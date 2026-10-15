# DevBridge — Surgical Patch & Full-Stack X-Ray

## Quickstart

```bash
# 1. Install all workspace dependencies and generate pnpm-lock.yaml
pnpm install

# 2. Run the automated security & atomic patch tests
pnpm test

# 3. Terminal 1: Start the Local Agent pointed at the demo app
FRONTEND_ROOT=./examples/full-stack-demo BACKEND_ROOT=./examples/full-stack-demo pnpm agent

# 4. Terminal 2: Start the Express Backend (port 4000)
pnpm demo:api

# 5. Terminal 3: Start the React + Vite Frontend (port 5173)
pnpm demo:web
```

Once those three terminals are running, open http://localhost:5173,
open Chrome DevTools → DevBridge, and both the Surgical Patcher and
the Full-Stack Backend Crash Tracer will work out of the box.
