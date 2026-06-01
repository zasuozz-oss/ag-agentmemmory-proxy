import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('dist/setup/proxy-config.js')).href;

test('buildProxyConfig returns wrapper-scoped defaults', async () => {
  const { buildProxyConfig } = await import(moduleUrl);
  const config = buildProxyConfig({}, '/repo');

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, '3129');
  assert.equal(config.timeoutMs, '120000');
  assert.equal(config.sandbox, 'false');
  assert.equal(config.agyBin, '/repo/agy-clean-wrapper.sh');
});

test('renderProxyEnv writes only ag-agentmemmory-proxy keys', async () => {
  const { buildProxyConfig, renderProxyEnv } = await import(moduleUrl);
  const config = buildProxyConfig({ port: '3999', agyBin: '/tmp/agy-wrapper' }, '/repo');
  const rendered = renderProxyEnv(config);

  assert.match(rendered, /AGY_PROXY_HOST=127\.0\.0\.1/);
  assert.match(rendered, /AGY_PROXY_PORT=3999/);
  assert.match(rendered, /AGY_CLI_BIN=\/tmp\/agy-wrapper/);
  assert.match(rendered, /AGY_CLI_DISABLE_AUTO_UPDATE=1/);
  assert.doesNotMatch(rendered, /AGENTMEMORY_/);
  assert.doesNotMatch(rendered, /OPENAI_BASE_URL/);
});

test('defaultProxyConfigPath uses ~/.ag-agentmemmory-proxy/proxy.env', async () => {
  const { defaultProxyConfigPath } = await import(moduleUrl);
  assert.equal(defaultProxyConfigPath('/home/example'), path.join('/home/example', '.ag-agentmemmory-proxy', 'proxy.env'));
  assert.equal(defaultProxyConfigPath(), path.join(os.homedir(), '.ag-agentmemmory-proxy', 'proxy.env'));
});
