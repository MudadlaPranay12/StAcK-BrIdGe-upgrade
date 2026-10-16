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

## Chrome extension setup

The extension does not contain a credential. On first open, choose
**Settings**, enter the same value used by `DEVBRIDGE_TOKEN`, and use
**Validate and save**. The agent endpoint defaults to
`http://127.0.0.1:4321`; the optional backend health endpoint defaults to
`http://127.0.0.1:4000/api/health`. These values and any BYOK settings are
stored locally in the DevTools extension only.

Validate the unpacked extension from the repository root with:

```bash
pnpm extension:check
```

To reload it manually in Chrome: open `chrome://extensions`, enable
**Developer mode**, click **Reload** for the existing DevBridge extension (or
click **Load unpacked** and select `apps/chrome-extension`), then close and
reopen DevTools for the inspected page. Navigate to the **DevBridge** panel,
configure the token, and click **Sync tree**.

Git inspection never initializes a repository. It reports the exact checked
directory and distinguishes a missing Git executable, a non-repository, a
repository without commits, a clean tree, and a dirty tree. Set
`FRONTEND_ROOT` to the intended project root before starting the agent.
