import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { StagedPatchRequest, SourcePosition } from '@devbridge/protocol';
import { SecurityManager } from './SecurityManager.js';

interface Checkpoint {
  id: string;
  file: string;
  previousContent: string;
  timestamp: string;
}

export class PatchEngine {
  private checkpoints: Checkpoint[] = [];

  constructor(private security: SecurityManager) {}

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
    let currentLine = 1;
    let index = 0;

    while (currentLine < pos.line && index < content.length) {
      if (content[index] === '\n') {
        currentLine++;
      }
      index++;
    }
    return index + pos.column;
  }

  public previewDiff(req: StagedPatchRequest): { nextContent: string; unifiedDiff: string } {
    const { content, hash } = this.readSourceFile(req.file);
    if (hash !== req.originalHash) {
      const err: any = new Error('CONFLICT: File was modified externally in IDE since inspection.');
      err.statusCode = 409;
      throw err;
    }

    const startOffset = this.positionToOffset(content, req.start);
    const endOffset = this.positionToOffset(content, req.end);
    const nextContent = content.slice(0, startOffset) + req.replacement + content.slice(endOffset);

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

    // Save rollback checkpoint in memory (and optionally disk)
    const checkpointId = `chk_${Date.now()}`;
    this.checkpoints.push({
      id: checkpointId,
      file: req.file,
      previousContent: currentContent,
      timestamp: new Date().toISOString(),
    });

    // Atomic Write: write to temp file in same directory, then rename
    const tempPath = path.join(path.dirname(fullPath), `.${path.basename(fullPath)}.devbridge.tmp`);
    fs.writeFileSync(tempPath, nextContent, 'utf8');
    fs.renameSync(tempPath, fullPath);

    return { checkpointId, newHash: this.computeHash(nextContent) };
  }

  public rollbackLastCheckpoint(): Checkpoint {
    const last = this.checkpoints.pop();
    if (!last) {
      throw new Error('NO_CHECKPOINTS: Nothing to roll back');
    }
    const fullPath = this.security.assertPathInProject(last.file, 'frontend');
    const tempPath = path.join(path.dirname(fullPath), `.${path.basename(fullPath)}.rollback.tmp`);
    fs.writeFileSync(tempPath, last.previousContent, 'utf8');
    fs.renameSync(tempPath, fullPath);
    return last;
  }
}
