import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devBridgeBackendTracer } from '@devbridge/backend-tracer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Simulated failing route so you can test Frontend -> Backend stack trace correlation
app.post('/api/checkout', (req, res, next) => {
  try {
    const user: any = undefined;
    // Intentional crash on this exact line!
    console.log(user.profile.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Wire the DevBridge Backend Tracer middleware AFTER routes
app.use(
  devBridgeBackendTracer({
    agentUrl: 'http://127.0.0.1:4321',
    agentToken: 'devbridge-local-secret',
    backendRoot: __dirname,
  })
);

// Final Express error response
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

app.listen(4000, '127.0.0.1', () => {
  console.log('[Demo Backend] Running at http://127.0.0.1:4000');
});
