import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Request, Response, NextFunction } from 'express';
import type { BackendTraceEvent } from '@devbridge/protocol';

export interface BackendTracerOptions {
  agentUrl?: string;
  agentToken?: string;
  backendRoot?: string;
}

export function devBridgeBackendTracer(options: BackendTracerOptions = {}) {
  const agentUrl = options.agentUrl || 'http://127.0.0.1:4321';
  const agentToken = options.agentToken || process.env.DEVBRIDGE_TOKEN || 'devbridge-local-secret';
  const normalizedRoot = path.resolve(options.backendRoot || process.cwd()).replace(/\\/g, '/').toLowerCase();

  return (err: Error, req: Request, res: Response, next: NextFunction) => {
    const traceId = (req.headers['x-devbridge-trace-id'] as string) || `trc_unlinked_${Date.now()}`;
    const triggeredByDevId = req.headers['x-devbridge-dev-id'] as string | undefined;

    let backendFile: string | undefined;
    let backendLine: number | undefined;
    let backendColumn: number | undefined;

    if (err.stack) {
      const stackLines = err.stack.split('\n');
      for (const line of stackLines) {
        if (line.includes('node_modules') || line.includes('node:internal')) continue;

        // Match (path:line:col) or at path:line:col
        const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at\s+(?:.+?\s+\()?(.+):(\d+):(\d+)\)?/);
        if (match) {
          let rawFile = match[1].trim();
          if (rawFile.startsWith('file://')) {
            try {
              rawFile = fileURLToPath(rawFile);
            } catch {
              rawFile = rawFile.replace(/^file:\/\/\/?/, '');
            }
          }

          const normalizedFile = path.resolve(rawFile).replace(/\\/g, '/');
          if (normalizedFile.toLowerCase().startsWith(normalizedRoot)) {
            backendFile = normalizedFile.slice(normalizedRoot.length).replace(/^\/+/, '');
            backendLine = Number(match[2]);
            backendColumn = Number(match[3]);
            break;
          }
        }
      }
    }

    const payload: BackendTraceEvent = {
      traceId,
      triggeredByDevId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode >= 400 ? res.statusCode : 500,
      errorMessage: err.message || 'Unhandled Backend Error',
      backendFile,
      backendLine,
      backendColumn,
      timestamp: new Date().toISOString(),
    };

    fetch(`${agentUrl}/api/v1/traces/backend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DevBridge-Token': agentToken,
      },
      body: JSON.stringify(payload),
    }).catch(() => {});

    next(err);
  };
}
