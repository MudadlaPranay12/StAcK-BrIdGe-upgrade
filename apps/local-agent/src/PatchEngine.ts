import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parse } from '@babel/parser';
import type { StagedPatchRequest, SourcePosition } from '@devbridge/protocol';
import { SecurityManager } from './SecurityManager.js';

export interface Checkpoint {
  id: string;
  file: string;
  previousContent: string;
  postApplyHash: string;
  timestamp: string;
  verifiedGreen?: boolean;
}

export class PatchEngine {
  private checkpoints: Checkpoint[] = [];
  private checkpointFilePath: string;

  constructor(private security: SecurityManager, frontendRoot?: string) {
    const baseDir = frontendRoot ? path.resolve(frontendRoot) : process.cwd();
    const devBridgeDir = path.join(baseDir, '.devbridge');
    if (!fs.existsSync(devBridgeDir)) {
      try {
        fs.mkdirSync(devBridgeDir, { recursive: true });
      } catch {
        // Best-effort: checkpoints stay in-memory if the dir can't be created
      }
    }
    this.checkpointFilePath = path.join(devBridgeDir, 'checkpoints.json');
    this.loadCheckpointsFromDisk();
  }

  private loadCheckpointsFromDisk() {
    try {
      if (fs.existsSync(this.checkpointFilePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.checkpointFilePath, 'utf8'));
        if (Array.isArray(parsed)) this.checkpoints = parsed;
      }
    } catch {
      this.checkpoints = [];
    }
  }

  private saveCheckpointsToDisk() {
    try {
      fs.writeFileSync(this.checkpointFilePath, JSON.stringify(this.checkpoints.slice(-30), null, 2), 'utf8');
    } catch {
      // Disk persistence is best-effort; in-memory checkpoints still work
    }
  }

  public getCheckpoints(): Omit<Checkpoint, 'previousContent'>[] {
    return this.checkpoints.map(({ previousContent: _omit, ...rest }) => rest).reverse();
  }

  public markCheckpointGreen(checkpointId: string) {
    const chk = this.checkpoints.find((c) => c.id === checkpointId);
    if (chk) {
      chk.verifiedGreen = true;
      this.saveCheckpointsToDisk();
    }
  }

  public computeHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  }

  public readSourceFile(relFile: string): { content: string; hash: string } {
    const fullPath = this.security.assertPathInProject(relFile, 'frontend');
    const content = fs.readFileSync(fullPath, 'utf8');
    return { content, hash: this.computeHash(content) };
  }

  // Exact CRLF / LF safe line:column -> string index resolver
  private positionToOffset(content: string, pos: SourcePosition): number {
    if (!pos || !Number.isInteger(pos.line) || !Number.isInteger(pos.column) || pos.line < 1 || pos.column < 0) {
      const err: any = new Error('INVALID_POSITION: line must be >= 1 and column must be >= 0');
      err.statusCode = 422;
      throw err;
    }
    const lines = content.split('\n');
    if (pos.line > lines.length) {
      const err: any = new Error(`INVALID_POSITION: line ${pos.line} is outside the file`);
      err.statusCode = 422;
      throw err;
    }
    const line = lines[pos.line - 1].replace(/\r$/, '');
    if (pos.column > line.length) {
      const err: any = new Error(`INVALID_POSITION: column ${pos.column} is outside line ${pos.line}`);
      err.statusCode = 422;
      throw err;
    }
    let offset = 0;
    for (let i = 0; i < pos.line - 1; i++) offset += lines[i].length + 1;
    return offset + pos.column;
  }

  // Validates that patched TSX/JSX code has zero syntax errors before touching disk
  private assertValidAstSyntax(file: string, code: string): void {
    if (!/\.(tsx|jsx|ts|js)$/.test(file)) return;
    try {
      parse(code, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
      });
    } catch (syntaxErr: any) {
      const err: any = new Error(
        `AST_SYNTAX_ERROR: Patch rejected because it produces invalid JSX/TS syntax: ${syntaxErr.message}`
      );
      err.statusCode = 422;
      throw err;
    }
  }

  public previewDiff(req: StagedPatchRequest): { nextContent: string; unifiedDiff: string } {
    if (!req || typeof req.file !== 'string' || typeof req.originalHash !== 'string' || typeof req.replacement !== 'string') {
      const err: any = new Error('INVALID_PATCH: file, originalHash, and replacement are required');
      err.statusCode = 422;
      throw err;
    }
    const { content, hash } = this.readSourceFile(req.file);
    if (hash !== req.originalHash) {
      const err: any = new Error('CONFLICT: File was modified externally in IDE since inspection.');
      err.statusCode = 409;
      throw err;
    }

    const startOffset = this.positionToOffset(content, req.start);
    const endOffset = this.positionToOffset(content, req.end);
    if (endOffset < startOffset) {
      const err: any = new Error('INVALID_POSITION: end must not precede start');
      err.statusCode = 422;
      throw err;
    }
    const nextContent = content.slice(0, startOffset) + req.replacement + content.slice(endOffset);

    // Pre-verify AST syntax even on preview so bad AI/manual patches fail fast
    this.assertValidAstSyntax(req.file, nextContent);

    const oldSlice = content.slice(startOffset, endOffset);
    const unifiedDiff = [
      `--- a/${req.file}`,
      `+++ b/${req.file}`,
      `@@ -${req.start.line},${req.start.column} +${req.start.line},${req.start.column} @@`,
      `- ${oldSlice}`,
      `+ ${req.replacement}`,
    ].join('\n');

    return { nextContent, unifiedDiff };
  }

  public applyAtomicPatch(req: StagedPatchRequest): { checkpointId: string; newHash: string } {
    const fullPath = this.security.assertPathInProject(req.file, 'frontend');
    const currentContent = fs.readFileSync(fullPath, 'utf8');
    const currentHash = this.computeHash(currentContent);

    // Strict 409 Conflict Check
    if (currentHash !== req.originalHash) {
      const err: any = new Error('CONFLICT: File hash mismatch. Someone edited this file in VS Code/Cursor.');
      err.statusCode = 409;
      throw err;
    }

    const { nextContent } = this.previewDiff(req);

    // Save rollback checkpoint (memory + disk so history survives restarts)
    const checkpointId = `chk_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const newHash = this.computeHash(nextContent);
    const checkpoint: Checkpoint = {
      id: checkpointId,
      file: req.file,
      previousContent: currentContent,
      postApplyHash: newHash,
      timestamp: new Date().toISOString(),
    };

    // Atomic Write: write to temp file in same directory, then rename
    const tempPath = path.join(
      path.dirname(fullPath),
      `.${path.basename(fullPath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.devbridge.tmp`
    );
    try {
      fs.writeFileSync(tempPath, nextContent, 'utf8');
      fs.renameSync(tempPath, fullPath);
      this.checkpoints.push(checkpoint);
      this.saveCheckpointsToDisk();
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup; the ignored temp file is never treated as a source file.
      }
    }

    return { checkpointId, newHash };
  }

  public rollbackLastCheckpoint(): Omit<Checkpoint, 'previousContent'> {
    const last = this.checkpoints[this.checkpoints.length - 1];
    if (!last) {
      throw new Error('NO_CHECKPOINTS: Nothing to roll back');
    }
    const fullPath = this.security.assertPathInProject(last.file, 'frontend');
    const currentContent = fs.readFileSync(fullPath, 'utf8');
    if (!last.postApplyHash || this.computeHash(currentContent) !== last.postApplyHash) {
      const err: any = new Error('CONFLICT: File changed after the checkpoint was applied; rollback was not performed.');
      err.statusCode = 409;
      throw err;
    }
    const tempPath = path.join(
      path.dirname(fullPath),
      `.${path.basename(fullPath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.rollback.tmp`
    );
    try {
      fs.writeFileSync(tempPath, last.previousContent, 'utf8');
      fs.renameSync(tempPath, fullPath);
      this.checkpoints.pop();
      this.saveCheckpointsToDisk();
    } finally {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {
        // Best-effort cleanup.
      }
    }
    const { previousContent: _omitted, ...metadata } = last;
    return metadata;
  }
}
