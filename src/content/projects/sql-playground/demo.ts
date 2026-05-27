import type { CommandContext } from '../../../types.js';
import { ansi } from '../../../banner.js';
import { withSpinner, checkAborted } from '../_common.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const D = ansi.dim;

// Sample dataset — a fake "commits" table so SQL queries return something
// meaningful without any network round-trip.
const COMMITS = [
  ['2026-05-12', 'leesalminen.com',  'feat',  'agentic terminal portfolio',  4127],
  ['2026-05-08', 'bitcoin-jungle',   'fix',   'lightning fee estimation',     312],
  ['2026-04-29', 'leesalminen.com',  'feat',  'on-device AI guide',          2890],
  ['2026-04-21', 'galoy',            'feat',  'NWC connection import',        688],
  ['2026-04-15', 'bitcoin-jungle',   'feat',  'merchant onboarding flow',    1542],
  ['2026-04-02', 'galoy',            'chore', 'upgrade to TS 5.6',             89],
  ['2026-03-28', 'bitcoin-jungle',   'feat',  'LNURL-pay support',            901],
  ['2026-03-19', 'leesalminen.com',  'fix',   'matrix easter egg',             45],
  ['2026-03-11', 'galoy',            'fix',   'graphql N+1 in price feed',    211],
  ['2026-03-02', 'bitcoin-jungle',   'feat',  'on-device receipt printer',    734],
];

const QUERIES: Array<{ title: string; sql: string }> = [
  {
    title: 'commits per project',
    sql: `SELECT project, COUNT(*) AS commits, SUM(lines) AS lines
          FROM commits
          GROUP BY project
          ORDER BY commits DESC;`,
  },
  {
    title: 'top 3 biggest changes',
    sql: `SELECT date, project, summary, lines
          FROM commits
          ORDER BY lines DESC
          LIMIT 3;`,
  },
  {
    title: 'features vs everything else',
    sql: `SELECT kind, COUNT(*) AS n, ROUND(AVG(lines)) AS avg_lines
          FROM commits
          GROUP BY kind
          ORDER BY n DESC;`,
  },
];

export async function run(ctx: CommandContext): Promise<void> {
  ctx.print('');
  ctx.print(`${B}${c.brightCyan}SQL Playground${R}  ${D}— DuckDB-wasm in your browser${R}`);
  ctx.print('');

  const db = await withSpinner(ctx, 'loading DuckDB-wasm (first time only, ~10 MB)…', async () => {
    const duckdb = await import('@duckdb/duckdb-wasm');
    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    if (!bundle.mainWorker) throw new Error('no worker URL in selected bundle');
    const workerBlob = await fetch(bundle.mainWorker).then(r => r.blob());
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);
    const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
    const inst = new duckdb.AsyncDuckDB(logger, worker);
    await inst.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(workerUrl);
    return inst;
  });
  checkAborted(ctx.signal);

  const conn = await db.connect();
  try {
    await conn.query(`CREATE TABLE commits (date DATE, project VARCHAR, kind VARCHAR, summary VARCHAR, lines INTEGER);`);
    const values = COMMITS.map(([d, p, k, s, l]) => `('${d}','${p}','${k}','${(s as string).replace(/'/g, "''")}',${l})`).join(',');
    await conn.query(`INSERT INTO commits VALUES ${values};`);

    ctx.print(`${c.green}✓${R} DuckDB ready · ${COMMITS.length} rows loaded into ${B}commits${R}`);
    ctx.print('');

    for (const q of QUERIES) {
      ctx.print(`${B}${c.brightYellow}-- ${q.title}${R}`);
      for (const line of q.sql.split(/\r?\n/)) ctx.print(`${c.brightCyan}${line.trim()}${R}`);
      ctx.print('');
      const result = await conn.query(q.sql);
      printResult(ctx, result);
      ctx.print('');
    }

    ctx.print(`${D}all queries ran client-side — DuckDB compiled to WebAssembly.${R}`);
  } finally {
    await conn.close();
    await db.terminate();
  }
}

type ArrowTable = {
  schema: { fields: { name: string }[] };
  toArray: () => Record<string, unknown>[];
};

function printResult(ctx: CommandContext, table: ArrowTable): void {
  const rows = table.toArray();
  if (rows.length === 0) {
    ctx.print(`${D}(no rows)${R}`);
    return;
  }
  const cols = table.schema.fields.map(f => f.name);
  const data = rows.map(r => cols.map(col => String(r[col] ?? '')));
  const widths = cols.map((col, i) => Math.max(col.length, ...data.map(row => row[i].length)));
  const sep = '  ';
  ctx.print(cols.map((col, i) => `${B}${c.brightCyan}${col.padEnd(widths[i])}${R}`).join(sep));
  ctx.print(widths.map(w => `${D}${'─'.repeat(w)}${R}`).join(sep));
  for (const row of data) {
    ctx.print(row.map((cell, i) => cell.padEnd(widths[i])).join(sep));
  }
}
