import { describe, expect, it, vi } from 'vitest';
import { devbridgePlugin } from './index.js';

describe('vite-plugin-devbridge transform', () => {
  it('stamps nested JSX, keeps parent identities aligned, and emits a source map', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const plugin: any = devbridgePlugin({ agentUrl: 'http://127.0.0.1:4321', agentToken: 'test-token' });
    plugin.configResolved({ root: 'C:/workspace/app' });
    const result = await plugin.transform(
      'const App = () => <section><button className={`save`}>Save</button><React.Fragment><span>Text</span></React.Fragment></section>',
      'C:/workspace/app/src/App.tsx'
    );
    const syncBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    fetchMock.mockRestore();
    expect(result.code).toContain('data-dev-id');
    expect(result.map.sources).toContain('C:/workspace/app/src/App.tsx');
    expect(result.map.mappings).toBeTruthy();
    const records = syncBody.records;
    expect(records).toHaveLength(3);
    expect(records[1].parentId).toBe(records[0].id);
    expect(records[2].parentId).toBe(records[0].id);
    expect(records[1].classNameRange.syntax).toBe('template');
  });
});
