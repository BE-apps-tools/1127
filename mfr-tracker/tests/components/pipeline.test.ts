import { describe, it, expect } from 'vitest';
import { runPipeline, type PageProgress, type PageTask } from '@/components/scan/pipeline';

const tasks = (n: number): PageTask[] => Array.from({ length: n }, (_, i) => ({ key: `t${i}`, label: `Page ${i + 1}`, pageNumber: i + 1 }));
const tick = (ms = 2) => new Promise((r) => setTimeout(r, ms));
const TERMINAL = new Set(['ready', 'duplicate', 'failed']);

describe('runPipeline', () => {
  it('never has more than 3 pages in flight and uses all 3 slots', async () => {
    const active = new Set<string>();
    let max = 0;
    await runPipeline(tasks(10), {
      render: async () => { await tick(); return 'r'; },
      upload: async (t) => { await tick(); return { id: Number(t.pageNumber), status: 'uploaded', duplicateOfPageId: null }; },
      extract: async () => { await tick(); return { status: 'needs_review', error: null }; },
    }, {
      onProgress: (p) => {
        if (p.state === 'rendering') active.add(p.task.key);
        if (TERMINAL.has(p.state)) active.delete(p.task.key);
        max = Math.max(max, active.size);
      },
    });
    expect(max).toBe(3);
    expect(active.size).toBe(0);
  });

  it('marks a page whose upload rejects as failed and finishes the rest', async () => {
    const results = await runPipeline(tasks(5), {
      render: async () => 'r',
      upload: async (t) => {
        if (t.pageNumber === 2) throw new Error('network down');
        return { id: t.pageNumber, status: 'uploaded', duplicateOfPageId: null };
      },
      extract: async () => ({ status: 'needs_review', error: null }),
    }, { onProgress: () => {} });
    expect(results.map((r) => r.state)).toEqual(['ready', 'failed', 'ready', 'ready', 'ready']);
    expect(results[1].error).toBe('network down');
  });

  it('does not extract a page that came back as a duplicate', async () => {
    const extracted: number[] = [];
    const results = await runPipeline(tasks(2), {
      render: async () => 'r',
      upload: async (t) => ({ id: t.pageNumber, status: t.pageNumber === 2 ? 'duplicate' : 'uploaded', duplicateOfPageId: t.pageNumber === 2 ? 1 : null }),
      extract: async (id) => { extracted.push(id); return { status: 'needs_review', error: null }; },
    }, { onProgress: () => {} });
    expect(extracted).toEqual([1]);
    expect(results.map((r) => r.state)).toEqual(['ready', 'duplicate']);
  });

  it('reports a failed read as failed with the message', async () => {
    const results = await runPipeline(tasks(1), {
      render: async () => 'r',
      upload: async () => ({ id: 1, status: 'uploaded', duplicateOfPageId: null }),
      extract: async () => ({ status: 'failed', error: 'model timed out' }),
    }, { onProgress: () => {} });
    expect(results[0]).toMatchObject({ state: 'failed', error: 'model timed out', pageId: 1 });
  });

  it('fires progress in the order rendering, uploading, reading, ready for each page', async () => {
    const seen = new Map<string, string[]>();
    await runPipeline(tasks(4), {
      render: async () => { await tick(); return 'r'; },
      upload: async (t) => { await tick(); return { id: t.pageNumber, status: 'uploaded', duplicateOfPageId: null }; },
      extract: async () => { await tick(); return { status: 'needs_review', error: null }; },
    }, {
      onProgress: (p: PageProgress<PageTask>) => seen.set(p.task.key, [...(seen.get(p.task.key) ?? []), p.state]),
    });
    for (const states of seen.values()) expect(states).toEqual(['rendering', 'uploading', 'reading', 'ready']);
  });

  it('a render failure is a failed page too', async () => {
    const results = await runPipeline(tasks(2), {
      render: async (t) => { if (t.pageNumber === 1) throw new Error('bad pdf page'); return 'r'; },
      upload: async (t) => ({ id: t.pageNumber, status: 'uploaded', duplicateOfPageId: null }),
      extract: async () => ({ status: 'needs_review', error: null }),
    }, { onProgress: () => {} });
    expect(results.map((r) => r.state)).toEqual(['failed', 'ready']);
  });
});
