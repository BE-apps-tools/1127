import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './_env';

loadEnv();

const PAGES = ['B-001', 'B-002', 'B-003', 'B-004', 'B-005', 'B-006'];

interface SeedLine {
  line_no: number;
  qty_each: number | null;
  sis_initialed: boolean;
}
interface SeedPage {
  page_key: string;
  image: string;
  lines: SeedLine[];
}

async function main() {
  const { getConfig } = await import('../src/server/config');
  const cfg = getConfig();
  if (!cfg.anthropicApiKey || cfg.aiMode !== 'anthropic') {
    console.log('ai:check skipped: ANTHROPIC_API_KEY is not set (or AI_MODE is not anthropic).');
    return;
  }
  const { createAnthropicExtractor } = await import('../src/server/ai/anthropic');
  const { buildSystemPrompt } = await import('../src/server/ai/prompt');
  const { createPgliteDb } = await import('../src/server/db/pglite');
  const { migrate } = await import('../src/server/db/migrate');
  const { seedDatabase } = await import('../src/server/services/seed');
  const { getLookups } = await import('../src/server/services/lookups');
  const { normalizeExtraction } = await import('../src/domain/normalize');

  // Lookups come from an in-memory database seeded from the kit, so this works with no local data directory.
  const db = await createPgliteDb();
  await migrate(db, path.resolve('db', 'migrations'));
  await seedDatabase(db, { put: async () => {}, get: async () => null, remove: async () => {} }, process.cwd(), {
    email: 'check@local.test',
    name: 'Check',
    password: 'not-used-1234',
  });
  const lookups = await getLookups(db);
  const system = buildSystemPrompt(lookups);
  const ai = createAnthropicExtractor(cfg.anthropicApiKey, cfg.anthropicModel);
  const seed = JSON.parse(fs.readFileSync('seed/seed.json', 'utf8')) as { pages: SeedPage[] };
  const today = new Date().toISOString().slice(0, 10);

  const rows: string[] = [];
  let lineTotal = 0;
  let qtyOk = 0;
  let initialsOk = 0;
  for (const key of PAGES) {
    const page = seed.pages.find((p) => p.page_key === key);
    if (!page) continue;
    const full = new Uint8Array(fs.readFileSync(path.join('seed', page.image)));
    try {
      const result = await ai.extract({ system, full, detail: null });
      const draft = normalizeExtraction(result, lookups, today);
      let pq = 0;
      let pi = 0;
      for (const want of page.lines) {
        const got = result.lines.find((l) => l.line_no === want.line_no);
        const gotDraft = draft.lines[result.lines.findIndex((l) => l.line_no === want.line_no)];
        if (gotDraft && (gotDraft.qtyRequested ?? null) === want.qty_each) pq++;
        if (got && got.sis_initialed === want.sis_initialed) pi++;
      }
      lineTotal += page.lines.length;
      qtyOk += pq;
      initialsOk += pi;
      rows.push(`| ${key} | ${page.lines.length} | ${result.lines.length} | ${pq} | ${pi} |`);
    } catch (err) {
      rows.push(`| ${key} | ${page.lines.length} | error | - | - |`);
      console.error(`${key}: ${err instanceof Error ? err.message.slice(0, 200) : 'failed'}`);
    }
  }

  const md = [
    '# AI check',
    '',
    `Model: ${cfg.anthropicModel}. Pages B-001 to B-006 read from the whole-page image only (the detail crop is made in the browser).`,
    'Compared with the hand transcription in `seed/seed.json`.',
    '',
    '| Page | Lines on form | Lines read | Each-count matches | Initials match |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    `Totals: each-count ${qtyOk} of ${lineTotal}, initials ${initialsOk} of ${lineTotal}.`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join('docs', 'AI_CHECK.md'), md);
  console.log(md);
  await db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
