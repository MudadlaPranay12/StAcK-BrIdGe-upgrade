import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectGit, runGitForTest } from '../GitInspector.js';

describe('Git root inspection', () => {
  const roots: string[] = [];
  afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

  it('reports a configured directory that is not a repository', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devbridge-git-')); roots.push(root);
    const result = await inspectGit(root);
    expect(result.state).toBe('not-repository');
    expect(result.checkedDirectory).toBe(path.resolve(root));
    expect(result.message).toContain('not a Git repository');
  });

  it('distinguishes an initialized repository with no commits', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devbridge-git-')); roots.push(root);
    await runGitForTest(root, ['init']);
    fs.writeFileSync(path.join(root, 'untracked.txt'), 'pending\n');
    const result = await inspectGit(root);
    expect(result.state).toBe('no-commits');
    expect(result.files).toEqual([{ status: '??', file: 'untracked.txt' }]);
    expect(result.diff).toBe('');
  });

  it('reports clean and dirty working trees from the same verified root', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devbridge-git-')); roots.push(root);
    await runGitForTest(root, ['init']);
    await runGitForTest(root, ['config', 'user.email', 'devbridge-test@example.invalid']);
    await runGitForTest(root, ['config', 'user.name', 'DevBridge Test']);
    const tracked = path.join(root, 'tracked.txt'); fs.writeFileSync(tracked, 'before\n');
    await runGitForTest(root, ['add', 'tracked.txt']); await runGitForTest(root, ['commit', '-m', 'initial']);
    expect((await inspectGit(root)).state).toBe('clean');
    fs.writeFileSync(tracked, 'after\n'); fs.writeFileSync(path.join(root, 'new.txt'), 'new\n');
    const dirty = await inspectGit(root);
    expect(dirty.state).toBe('dirty');
    expect(dirty.files.map((file) => file.file)).toEqual(expect.arrayContaining(['tracked.txt', 'new.txt']));
    expect(dirty.diff).toContain('after');
  });
});
