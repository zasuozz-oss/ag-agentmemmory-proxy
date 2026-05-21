export function expandClients(client) {
    if (client === 'all')
        return ['antigravity', 'codex', 'claude-code'];
    if (client === 'antigravity' || client === 'codex' || client === 'claude-code') {
        return [client];
    }
    throw new Error(`Unsupported client: ${client}`);
}
