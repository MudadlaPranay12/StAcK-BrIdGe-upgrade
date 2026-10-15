import express from 'express';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { WebSocketServer, WebSocket } from 'ws';
import type { DevIdentityRecord, BackendTraceEvent, StagedPatchRequest } from '@devbridge/protocol';
import { SecurityManager } from './SecurityManager.js';
import { PatchEngine } from './PatchEngine.js';
import { AIManager, type AIProviderConfig } from './AIManager.js';

const PORT = 4321;
const TOKEN = process.env.DEVBRIDGE_TOKEN || 'devbridge-local-secret';
const FRONTEND_ROOT = process.env.FRONTEND_ROOT || process.cwd();
const BACKEND_ROOT = process.env.BACKEND_ROOT || process.cwd();

const security = new SecurityManager(FRONTEND_ROOT, BACKEND_ROOT, TOKEN);
const patchEngine = new PatchEngine(security);
const aiManager = new AIManager(process.env.GEMINI_API_KEY);

const identityRegistry = new Map<string, DevIdentityRecord>();
const backendTraces: BackendTraceEvent[] = [];

const app = express();
app.use(express.json({ limit: '1mb' }));

// Strict CORS + Token validation middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-DevBridge-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  try {
    security.verifyRequest(req);
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// 1. Receive AST Identity Batch from Vite Plugin
app.post('/api/v1/identities/batch', (req, res) => {
  const records: DevIdentityRecord[] = req.body.records || [];
  for (const r of records) {
    identityRegistry.set(r.id, r);
  }
  res.json({ ok: true, count: identityRegistry.size });
});

// 2. Resolve single DevIdentity + surrounding source code + current file hash
app.get('/api/v1/identity/:id', (req, res) => {
  const record = identityRegistry.get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Identity not found' });

  try {
    const { content, hash } = patchEngine.readSourceFile(record.file);
    const lines = content.split('\n');
    const startLine = Math.max(1, record.start.line - 6);
    const endLine = Math.min(lines.length, record.end.line + 6);
    const snippet = lines.slice(startLine - 1, endLine).join('\n');

    res.json({ record, hash, snippet, snippetStartLine: startLine });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Preview Surgical Diff
app.post('/api/v1/patches/preview', (req, res) => {
  try {
    const patchReq = req.body as StagedPatchRequest;
    const result = patchEngine.previewDiff(patchReq);
    res.json(result);
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// 4. Apply Atomic Patch
app.post('/api/v1/patches/apply', (req, res) => {
  try {
    const patchReq = req.body as StagedPatchRequest;
    const result = patchEngine.applyAtomicPatch(patchReq);
    broadcastEvent({ type: 'PATCH_APPLIED', file: patchReq.file, ...result });
    res.json(result);
  } catch (err: any) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// 5. Rollback Last Checkpoint
app.post('/api/v1/patches/rollback', (_req, res) => {
  try {
    const rolledBack = patchEngine.rollbackLastCheckpoint();
    res.json({ ok: true, rolledBack });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Receive Backend Crash Trace & Broadcast to DevTools
app.post('/api/v1/traces/backend', (req, res) => {
  const trace = req.body as BackendTraceEvent;
  backendTraces.unshift(trace);
  if (backendTraces.length > 50) backendTraces.pop();
  broadcastEvent({ type: 'BACKEND_TRACE', trace });
  res.json({ ok: true });
});

// 7. Safe IDE Handoff (Windows .cmd + URI protocol + macOS/Linux compatible)
app.post('/api/v1/ide/open', (req, res) => {
  try {
    const { file, line = 1, column = 1, target = 'frontend', editor = 'cursor' } = req.body;
    const canonicalPath = security.assertPathInProject(file, target);
    const safeLine = Number(line) || 1;
    const safeCol = Number(column) || 1;
    const locationArg = `${canonicalPath}:${safeLine}:${safeCol}`;

    const isWin = process.platform === 'win32';
    const normalizedForUri = canonicalPath.replace(/\\/g, '/');
    const protocolUri = `${editor === 'code' ? 'vscode' : 'cursor'}://file/${
      normalizedForUri.startsWith('/') ? normalizedForUri.slice(1) : normalizedForUri
    }:${safeLine}:${safeCol}`;

    if (isWin) {
      // On Windows, use cmd.exe /c start "" "cursor://file/..." which works even if CLI isn't in PATH
      execFile('cmd.exe', ['/c', 'start', '', protocolUri], (err) => {
        if (err) {
          execFile('cmd.exe', ['/c', 'code.cmd', '-g', locationArg], () => {});
        }
      });
    } else {
      const binary = editor === 'code' ? 'code' : 'cursor';
      execFile(binary, ['-g', locationArg], () => {});
    }

    res.json({ ok: true, opened: locationArg, protocolUri });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// 8. AI Visual Delta & Quick Fix (any configured provider proposes an element replacement)
app.post('/api/v1/ai/fix', async (req, res) => {
  try {
    const { devId, latestTrace, aiConfig } = req.body as {
      devId?: string;
      latestTrace?: BackendTraceEvent;
      aiConfig?: Partial<AIProviderConfig>;
    };
    if (!devId) return res.status(400).json({ error: 'Missing devId in request body' });
    const record = identityRegistry.get(devId);
    if (!record) return res.status(404).json({ error: 'Identity not found in registry' });

    const { content } = patchEngine.readSourceFile(record.file);
    const lines = content.split('\n');
    const startLine = Math.max(1, record.start.line - 4);
    const endLine = Math.min(lines.length, record.end.line + 4);
    const snippet = lines.slice(startLine - 1, endLine).join('\n');

    // Per-request BYOK config (from the panel's Enterprise AI Settings) falls
    // back to AI_PROVIDER / AI_MODEL / AI_API_KEY / AI_BASE_URL env vars.
    // The key itself is only held in memory for this request — never logged.
    const suggestion = await aiManager.generateQuickFix(record, snippet, latestTrace, aiConfig);
    res.json(suggestion);
  } catch (err: any) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

function broadcastEvent(payload: unknown) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

// Bind strictly to loopback 127.0.0.1
server.listen(PORT, '127.0.0.1', () => {
  console.log(`[DevBridge Agent] Listening strictly on http://127.0.0.1:${PORT}`);
});
