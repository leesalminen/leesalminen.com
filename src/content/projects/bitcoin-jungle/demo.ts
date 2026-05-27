import type { CommandContext } from '../../../types.js';
import { ansi } from '../../../banner.js';
import { withSpinner, sparkline, abortableFetch, checkAborted } from '../_common.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const D = ansi.dim;

// Bitcoin Jungle's public GraphQL endpoint (same one that powers the wallets).
const BJ_GRAPHQL = 'https://api.mainnet.bitcoinjungle.app/graphql';

// realtimePrice gives current price + a 1-day history of recent points.
const PRICE_QUERY = `
  query Price {
    btcPriceList(range: ONE_DAY) {
      timestamp
      price {
        base
        offset
        currencyUnit
      }
    }
  }
`;

type PricePoint = {
  timestamp: number;
  price: { base: number; offset: number; currencyUnit: string };
};

function toUsd(p: PricePoint): number {
  // Galoy/Blink/BJ pricing convention: price = base * 10^-offset, then it's
  // a per-sat USD-cent. Convert to USD per BTC.
  const per = p.price.base * Math.pow(10, -p.price.offset); // USD-cents per sat
  return per * 100_000_000 / 100; // sats per BTC, cents -> USD
}

export async function run(ctx: CommandContext): Promise<void> {
  ctx.print('');
  ctx.print(`${B}${c.brightCyan}Bitcoin Jungle${R} ${D}— live price feed${R}`);
  ctx.print(`${D}querying ${BJ_GRAPHQL}${R}`);
  ctx.print('');

  const data = await withSpinner(ctx, 'fetching price history…', async () => {
    const res = await abortableFetch(BJ_GRAPHQL, ctx.signal, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: PRICE_QUERY }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message ?? 'GraphQL error');
    return json.data as { btcPriceList: PricePoint[] };
  });

  checkAborted(ctx.signal);

  const points = data.btcPriceList ?? [];
  if (points.length === 0) {
    ctx.print(`${c.red}no price points returned${R}`);
    return;
  }

  const prices = points.map(toUsd);
  const current = prices[prices.length - 1];
  const first = prices[0];
  const delta = current - first;
  const pct = (delta / first) * 100;

  // Sample down to ~60 points for a clean sparkline.
  const step = Math.max(1, Math.floor(prices.length / 60));
  const sampled = prices.filter((_, i) => i % step === 0);

  const arrow = delta >= 0 ? `${c.brightGreen}▲${R}` : `${c.brightMagenta}▼${R}`;
  const deltaColor = delta >= 0 ? c.brightGreen : c.brightMagenta;

  ctx.print(`  ${B}1 BTC${R}  =  ${B}${c.brightYellow}$${current.toLocaleString('en-US', { maximumFractionDigits: 0 })}${R} USD`);
  ctx.print(`  ${D}24h${R}    ${arrow} ${deltaColor}${delta >= 0 ? '+' : ''}$${delta.toFixed(0)} (${pct.toFixed(2)}%)${R}`);
  ctx.print('');
  ctx.print(`  ${c.brightCyan}${sparkline(sampled)}${R}`);
  ctx.print(`  ${D}${'└─ 24h ago' + ' '.repeat(Math.max(0, sampled.length - 18)) + 'now ─┘'}${R}`);
  ctx.print('');
  ctx.print(`  ${D}data: bitcoinjungle.app · the same backend that powers our wallets${R}`);
  ctx.print(`  ${D}try: open https://bitcoinjungle.app${R}`);
}
