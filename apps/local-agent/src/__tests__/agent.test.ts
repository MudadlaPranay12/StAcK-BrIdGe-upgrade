import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SecurityManager } from '../SecurityManager.js';
import { PatchEngine } from '../PatchEngine.js';

describe('DevBridge SecurityManager & Atomic PatchEngine', () => {
  let tmpDir: string;
  let security: SecurityManager;
  let patchEngine: PatchEngine;
  let sampleFileRel = 'src/Hero.tsx';

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devbridge-test-'));
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, sampleFileRel),
      `<button className="bg-blue-500">Click</button>\n`,
      'utf8'
    );
    security = new SecurityManager(tmpDir, tmpDir, 'test-secret');
    patchEngine = new PatchEngine(security, tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('blocks path traversal outside project root (../)', () => {
    expect(() => security.assertPathInProject('../../etc/passwd', 'frontend')).toThrow(
      /PATH_TRAVERSAL_BLOCKED/
    );
  });

  it('blocks unauthorized token requests', () => {
    const fakeReq: any = { headers: { 'x-devbridge-token': 'wrong-token' } };
    expect(() => security.verifyRequest(fakeReq)).toThrow(/UNAUTHORIZED/);
  });

  it('applies an atomic patch when hash matches and rolls back cleanly', () => {
    const { hash } = patchEngine.readSourceFile(sampleFileRel);

    // Replace "bg-blue-500" (line 1, col 18 to line 1, col 31)
    const res = patchEngine.applyAtomicPatch({
      file: sampleFileRel,
      originalHash: hash,
      start: { line: 1, column: 18 },
      end: { line: 1, column: 31 },
      replacement: '"bg-emerald-600 px-4"',
    });

    expect(res.checkpointId).toMatch(/^chk_/);
    const updated = patchEngine.readSourceFile(sampleFileRel).content;
    expect(updated).toBe(`<button className="bg-emerald-600 px-4">Click</button>\n`);

    // Rollback
    patchEngine.rollbackLastCheckpoint();
    const rolledBack = patchEngine.readSourceFile(sampleFileRel).content;
    expect(rolledBack).toBe(`<button className="bg-blue-500">Click</button>\n`);
  });

  it('throws 409 CONFLICT if file was modified in IDE before patch apply', () => {
    const { hash } = patchEngine.readSourceFile(sampleFileRel);

    // Simulate external edit in VS Code/Cursor
    fs.writeFileSync(
      path.join(tmpDir, sampleFileRel),
      `<button className="bg-red-500">External Edit</button>\n`,
      'utf8'
    );

    expect(() =>
      patchEngine.applyAtomicPatch({
        file: sampleFileRel,
        originalHash: hash,
        start: { line: 1, column: 18 },
        end: { line: 1, column: 31 },
        replacement: '"bg-emerald-600"',
      })
    ).toThrow(/CONFLICT/);
  });
});
