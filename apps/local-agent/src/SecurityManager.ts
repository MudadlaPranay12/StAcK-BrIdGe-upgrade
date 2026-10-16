import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';

export class SecurityManager {
  private readonly canonicalFrontRoot: string;
  private readonly canonicalBackRoot: string;
  private readonly secretToken: string;

  constructor(frontendRoot: string, backendRoot: string, secretToken: string) {
    this.canonicalFrontRoot = fs.realpathSync(path.resolve(frontendRoot));
    this.canonicalBackRoot = fs.realpathSync(path.resolve(backendRoot));
    this.secretToken = secretToken;
  }

  public verifyRequest(req: IncomingMessage): void {
    const token = req.headers['x-devbridge-token'];
    if (token !== this.secretToken) {
      throw new Error('UNAUTHORIZED: Invalid or missing X-DevBridge-Token');
    }

    this.verifyOrigin(req.headers['origin']);
  }

  public verifyWebSocket(token: string | null | undefined, origin?: string): void {
    if (token !== this.secretToken) {
      throw new Error('UNAUTHORIZED: Invalid or missing DevBridge WebSocket token');
    }
    this.verifyOrigin(origin);
  }

  public verifyWebSocketOrigin(origin?: string): void {
    this.verifyOrigin(origin);
  }

  private verifyOrigin(origin?: string): void {
    if (
      origin &&
      !origin.startsWith('chrome-extension://') &&
      !origin.startsWith('http://localhost:') &&
      !origin.startsWith('http://127.0.0.1:')
    ) {
      throw new Error(`FORBIDDEN_ORIGIN: ${origin} is not allowed`);
    }
  }

  public assertPathInProject(relativeFilePath: string, target: 'frontend' | 'backend' = 'frontend'): string {
    if (relativeFilePath.includes('\0')) {
      throw new Error('INVALID_PATH: Null byte detected');
    }
    const baseRoot = target === 'frontend' ? this.canonicalFrontRoot : this.canonicalBackRoot;
    const resolvedCandidate = path.resolve(baseRoot, relativeFilePath);

    // 1. Lexical containment check first — blocks ../ escapes even when
    // the target path (or its parent) does not exist on disk.
    if (resolvedCandidate !== baseRoot && !resolvedCandidate.startsWith(baseRoot + path.sep)) {
      throw new Error(`PATH_TRAVERSAL_BLOCKED: ${relativeFilePath} escapes registered project root`);
    }

    // 2. Resolve symlinks on existing file or parent dir (symlink-escape check)
    let realTarget: string;
    try {
      realTarget = fs.existsSync(resolvedCandidate)
        ? fs.realpathSync(resolvedCandidate)
        : fs.realpathSync(path.dirname(resolvedCandidate));
    } catch {
      // Parent chain does not exist yet (e.g. new file) — lexical check above
      // already proved containment, so return the lexically-safe path.
      return resolvedCandidate;
    }

    if (realTarget !== baseRoot && !realTarget.startsWith(baseRoot + path.sep)) {
      throw new Error(`PATH_TRAVERSAL_BLOCKED: ${relativeFilePath} escapes registered project root`);
    }

    return resolvedCandidate;
  }
}
