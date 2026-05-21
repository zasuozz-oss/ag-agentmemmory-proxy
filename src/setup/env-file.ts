import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type SetupProfile = 'local' | 'api-key' | 'agy-local';
export type ApiProvider = 'openrouter' | 'openai' | 'anthropic' | 'gemini' | 'minimax';

export type EnvSetupOptions = {
  profile?: SetupProfile;
  provider?: ApiProvider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  agyBin?: string;
};

export const LOCAL_AGENTMEMORY_ENV_VALUES: Record<string, string> = {
  EMBEDDING_PROVIDER: 'local',
  BM25_WEIGHT: '0.4',
  VECTOR_WEIGHT: '0.6',
  AGENTMEMORY_URL: 'http://localhost:3111',
  AGENTMEMORY_AUTO_COMPRESS: 'false',
  CONSOLIDATION_ENABLED: 'false',
  GRAPH_EXTRACTION_ENABLED: 'false',
  AGENTMEMORY_INJECT_CONTEXT: 'true',
  AGENTMEMORY_DROP_STALE_INDEX: 'false',
  AGENTMEMORY_LLM_TIMEOUT_MS: '180000',
  TRANSFORMERS_CACHE: path.join(os.homedir(), '.cache', 'xenova-transformers'),
};

export const AGENTMEMORY_ENV_VALUES = LOCAL_AGENTMEMORY_ENV_VALUES;

const PROVIDER_CONFIG: Record<ApiProvider, {
  key: string;
  modelKey: string;
  defaultModel: string;
  embeddingProvider: string;
  baseUrlKey?: string;
}> = {
  openrouter: {
    key: 'OPENROUTER_API_KEY',
    modelKey: 'OPENROUTER_MODEL',
    defaultModel: 'anthropic/claude-sonnet-4',
    embeddingProvider: 'openrouter',
  },
  openai: {
    key: 'OPENAI_API_KEY',
    modelKey: 'OPENAI_MODEL',
    defaultModel: 'gpt-4o-mini',
    embeddingProvider: 'openai',
    baseUrlKey: 'OPENAI_BASE_URL',
  },
  anthropic: {
    key: 'ANTHROPIC_API_KEY',
    modelKey: 'ANTHROPIC_MODEL',
    defaultModel: 'claude-sonnet-4-20250514',
    embeddingProvider: 'local',
    baseUrlKey: 'ANTHROPIC_BASE_URL',
  },
  gemini: {
    key: 'GEMINI_API_KEY',
    modelKey: 'GEMINI_MODEL',
    defaultModel: 'gemini-2.5-flash',
    embeddingProvider: 'gemini',
  },
  minimax: {
    key: 'MINIMAX_API_KEY',
    modelKey: 'MINIMAX_MODEL',
    defaultModel: 'MiniMax-M2.7',
    embeddingProvider: 'local',
  },
};

const LLM_KEYS = Object.values(PROVIDER_CONFIG).flatMap((config) =>
  [config.key, config.modelKey, config.baseUrlKey].filter((key): key is string => Boolean(key)),
);
const AGY_KEYS = ['AGY_CLI_BIN', 'AGY_CLI_TIMEOUT_MS', 'AGY_CLI_SANDBOX', 'AGY_PROXY_PORT'];
const LLM_AND_AGY_KEYS = [...LLM_KEYS, 'OPENAI_API_KEY_FOR_LLM', ...AGY_KEYS];

export function detectActiveApiProvider(values: Record<string, string>): ApiProvider | undefined {
  for (const [provider, config] of Object.entries(PROVIDER_CONFIG) as Array<[ApiProvider, typeof PROVIDER_CONFIG[ApiProvider]]>) {
    if (values[config.key]?.trim()) return provider;
  }
  return undefined;
}

function parseEnv(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2]!.trim();
    const quote = value[0] === '"' || value[0] === "'" ? value[0] : '';
    if (quote) {
      const closeIdx = value.indexOf(quote, 1);
      if (closeIdx !== -1) value = value.slice(1, closeIdx);
    } else {
      const hashIdx = value.indexOf(' #');
      if (hashIdx !== -1) value = value.slice(0, hashIdx).trim();
    }
    values[match[1]!] = value;
  }
  return values;
}

export function agentmemoryEnvPath(home = os.homedir()): string {
  return path.join(home, '.agentmemory', '.env');
}

export function buildManagedEnvValues(options: EnvSetupOptions = {}): {
  values: Record<string, string>;
  disabledKeys: Set<string>;
} {
  const profile = options.profile || 'local';
  if (profile !== 'local' && profile !== 'api-key' && profile !== 'agy-local') {
    throw new Error(`Unsupported profile: ${profile}`);
  }
  if (profile === 'local') {
    return {
      values: LOCAL_AGENTMEMORY_ENV_VALUES,
      disabledKeys: new Set(LLM_AND_AGY_KEYS),
    };
  }

  if (profile === 'agy-local') {
    const values = {
      ...LOCAL_AGENTMEMORY_ENV_VALUES,
      OPENAI_API_KEY: 'dummy',
      OPENAI_MODEL: 'agy-cli',
      OPENAI_BASE_URL: 'http://127.0.0.1:3129',
      OPENAI_API_KEY_FOR_LLM: 'true',
      EMBEDDING_PROVIDER: 'local',
      AGENTMEMORY_AUTO_COMPRESS: 'true',
      CONSOLIDATION_ENABLED: 'true',
      GRAPH_EXTRACTION_ENABLED: 'true',
      AGY_CLI_BIN: options.agyBin || path.join(os.homedir(), '.local', 'bin', 'agy'),
      AGY_CLI_TIMEOUT_MS: '120000',
      AGY_CLI_SANDBOX: 'false',
      AGY_PROXY_PORT: '3129',
    };
    return {
      values,
      disabledKeys: new Set(LLM_AND_AGY_KEYS.filter((key) => !(key in values))),
    };
  }

  if (!options.provider) {
    throw new Error('--provider is required when --profile api-key is used');
  }
  if (!(options.provider in PROVIDER_CONFIG)) {
    throw new Error(`Unsupported provider: ${options.provider}`);
  }
  if (!options.apiKey || options.apiKey.trim().length === 0) {
    throw new Error('--api-key is required when --profile api-key is used');
  }

  const config = PROVIDER_CONFIG[options.provider];
  const values: Record<string, string> = {
    ...LOCAL_AGENTMEMORY_ENV_VALUES,
    EMBEDDING_PROVIDER: config.embeddingProvider,
    AGENTMEMORY_AUTO_COMPRESS: 'true',
    CONSOLIDATION_ENABLED: 'true',
    GRAPH_EXTRACTION_ENABLED: 'true',
    [config.key]: options.apiKey.trim(),
    [config.modelKey]: options.model?.trim() || config.defaultModel,
  };

  if (config.baseUrlKey && options.baseUrl?.trim()) {
    values[config.baseUrlKey] = options.baseUrl.trim();
  }

  return {
    values,
    disabledKeys: new Set(LLM_AND_AGY_KEYS.filter((key) => !(key in values))),
  };
}

export async function upsertAgentmemoryEnv(
  filePath = agentmemoryEnvPath(),
  options: EnvSetupOptions = {},
): Promise<string> {
  const current = await fs.readFile(filePath, 'utf8').catch(() => '');
  const { values: managedValues, disabledKeys } = buildManagedEnvValues(options);
  const lines = current ? current.split(/\r?\n/) : [];
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (!match) return line;
    const key = match[1]!;
    if (disabledKeys.has(key)) {
      return `# ${line} # disabled by ag-agentmemory ${options.profile || 'local'} profile`;
    }
    if (!(key in managedValues)) return line;
    seen.add(key);
    return `${key}=${managedValues[key]}`;
  });

  const missing = Object.entries(managedValues)
    .filter(([key]) => !seen.has(key))
    .map(([key, value]) => `${key}=${value}`);

  if (missing.length > 0) {
    if (next.length > 0 && next[next.length - 1] !== '') next.push('');
    next.push('# Managed by ag-agentmemory');
    next.push(...missing);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${next.join('\n').replace(/\n+$/, '')}\n`, 'utf8');
  return filePath;
}

export async function readEnvValues(filePath = agentmemoryEnvPath()): Promise<Record<string, string>> {
  const current = await fs.readFile(filePath, 'utf8').catch(() => '');
  return parseEnv(current);
}
