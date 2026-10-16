import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIManager } from '../AIManager.js';

const record = { id: 'dvi_test', componentName: 'Button', tagName: 'button', file: 'src/Button.tsx', start: { line: 1, column: 0 }, end: { line: 1, column: 20 } };

afterEach(() => vi.unstubAllGlobals());

describe('AI provider configuration validation', () => {
  it('rejects unsupported providers before making a network request', () => {
    expect(() => new AIManager().resolveConfig({ provider: 'not-a-provider' as any })).toThrow(/Unsupported AI provider/);
  });

  it('requires a key for hosted providers', () => {
    expect(() => new AIManager().resolveConfig({ provider: 'openai', apiKey: '' })).toThrow(/API key/);
  });

  it('allows a local OpenAI-compatible gateway without a key', () => {
    const config = new AIManager().resolveConfig({ provider: 'openai-compatible' });
    expect(config.baseUrl).toBe('http://127.0.0.1:11434/v1');
    expect(config.apiKey).toBe('');
  });

  it('fails closed when a provider returns invalid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })));
    await expect(new AIManager().generateQuickFix(record, '<button>Save</button>', undefined, { provider: 'openai', apiKey: 'test-key' })).rejects.toThrow(/non-JSON/);
  });

  it('reports provider network failures as actionable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket timeout')));
    await expect(new AIManager().generateQuickFix(record, '<button>Save</button>', undefined, { provider: 'openai', apiKey: 'test-key' })).rejects.toThrow(/request failed/);
  });
});
