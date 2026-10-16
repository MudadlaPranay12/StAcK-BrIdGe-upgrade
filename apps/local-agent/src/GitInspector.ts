import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitInspection {
  checkedDirectory: string;
  repositoryRoot?: string;
  available: boolean;
  state: 'git-missing' | 'not-repository' | 'no-commits' | 'clean' | 'dirty' | 'command-error';
  branch: string | null;
  status: string;
  diff: string;
  diffTruncated?: boolean;
  files: Array<{ status: string; file: string }>;
  message: string;
  checkpoints: unknown[];
}

export async function inspectGit(frontendRoot: string, checkpoints: unknown[] = []): Promise<GitInspection> {
  const checkedDirectory = path.resolve(frontendRoot);
  const base = { checkedDirectory, checkpoints };
  try {
    await execFileAsync('git', ['--version'], { cwd: checkedDirectory });
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ...base, available: false, state: 'git-missing', branch: null, status: '', diff: '', files: [], message: 'Git is not installed or is not available on PATH. Install Git, then retry.' };
    return { ...base, available: false, state: 'command-error', branch: null, status: '', diff: '', files: [], message: String(err?.message || err).slice(0, 2000) };
  }

  let repositoryRoot = '';
  try {
    repositoryRoot = (await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: checkedDirectory })).stdout.trim();
  } catch (err: any) {
    const text = String(err?.stderr || err?.message || err);
    if (/not a git repository/i.test(text)) return { ...base, available: true, state: 'not-repository', branch: null, status: '', diff: '', files: [], message: `The configured project root is not a Git repository: ${checkedDirectory}` };
    return { ...base, available: true, state: 'command-error', branch: null, status: '', diff: '', files: [], message: text.slice(0, 2000) };
  }

  try {
    let branch = '(unborn branch)';
    try { branch = (await execFileAsync('git', ['symbolic-ref', '--short', '-q', 'HEAD'], { cwd: checkedDirectory })).stdout.trim() || branch; } catch { /* unborn repository */ }
    const statusRes = await execFileAsync('git', ['status', '--short'], { cwd: checkedDirectory });
    let hasCommit = true;
    try { await execFileAsync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: checkedDirectory }); } catch { hasCommit = false; }
    const diffRes = hasCommit ? await execFileAsync('git', ['diff', 'HEAD', '--', '.'], { cwd: checkedDirectory }) : { stdout: '' };
    const statusLines = statusRes.stdout.trim() ? statusRes.stdout.trim().split(/\r?\n/) : [];
    const files = statusLines.map((line) => ({ status: line.slice(0, 2).trim() || '?', file: line.slice(2).trim() }));
    const rawDiff = diffRes.stdout.trim();
    const diffTruncated = rawDiff.length > 20000;
    return {
      ...base, available: true, repositoryRoot,
      state: hasCommit ? (statusLines.length ? 'dirty' : 'clean') : 'no-commits',
      branch, status: statusLines.length ? statusRes.stdout.trim() : hasCommit ? 'Clean working tree' : 'Repository has no commits yet',
      diff: diffTruncated ? rawDiff.slice(0, 20000) : rawDiff, diffTruncated, files,
      message: hasCommit ? (statusLines.length ? 'Working tree has changes.' : 'Working tree is clean.') : 'Git repository detected, but it has no commits yet.',
    };
  } catch (err: any) {
    return { ...base, available: true, state: 'command-error', repositoryRoot, branch: null, status: '', diff: '', files: [], message: String(err?.stderr || err?.message || err).slice(0, 2000) };
  }
}

export async function runGitForTest(cwd: string, args: string[]) {
  return execFileAsync('git', args, { cwd });
}
