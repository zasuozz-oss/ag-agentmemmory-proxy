import http from 'node:http';
import { runAgyPrompt } from './agy.js';

type ChatMessage = { role?: string; content?: string };

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function renderPrompt(messages: ChatMessage[]): string {
  return messages
    .map((message) => `${message.role || 'user'}:\n${message.content || ''}`)
    .join('\n\n');
}

export async function startAgyProxy(options: { port?: number; host?: string } = {}): Promise<http.Server> {
  const port = options.port || Number.parseInt(process.env.AGY_PROXY_PORT || '3129', 10);
  const host = options.host || process.env.AGY_PROXY_HOST || '127.0.0.1';

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        json(res, 200, { ok: true, service: 'agy-proxy' });
        return;
      }

      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
        json(res, 404, { error: { message: 'not found' } });
        return;
      }

      const raw = await readBody(req);
      const body = JSON.parse(raw) as { messages?: ChatMessage[]; model?: string };
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const prompt = renderPrompt(messages);
      const content = await runAgyPrompt(prompt);

      json(res, 200, {
        id: `agy-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model || 'agy-cli',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          },
        ],
      });
    } catch (error) {
      json(res, 500, {
        error: {
          message: error instanceof Error ? error.message : String(error),
          type: 'agy_proxy_error',
        },
      });
    }
  });

  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  return server;
}
