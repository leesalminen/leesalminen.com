import QRCode from 'qrcode';
import type { CommandContext } from '../../../types.js';
import { ansi } from '../../../banner.js';
import { withSpinner, abortableFetch, checkAborted } from '../_common.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const D = ansi.dim;

const LIGHTNING_ADDRESS = 'lee@pay.bitcoinjungle.app';

type LnurlpResponse = {
  callback: string;
  minSendable: number;
  maxSendable: number;
  metadata: string;
  tag: string;
};

type LnurlpInvoiceResponse = {
  pr: string;
  routes?: unknown[];
  status?: string;
  reason?: string;
};

export async function run(ctx: CommandContext): Promise<void> {
  const sats = Math.max(1, Math.floor(Number(ctx.args[0] ?? '1000')));
  if (!Number.isFinite(sats)) {
    ctx.print(`${c.red}usage: run projects/lightning-invoice/demo <sats>${R}`);
    return;
  }

  const [name, host] = LIGHTNING_ADDRESS.split('@');
  // pay.bitcoinjungle.app doesn't send CORS headers, so we go through a
  // same-origin proxy (configured in netlify.toml and vite.config.ts).
  const lnurlpUrl =
    host === 'pay.bitcoinjungle.app'
      ? `/_bj/.well-known/lnurlp/${name}`
      : `https://${host}/.well-known/lnurlp/${name}`;

  ctx.print('');
  ctx.print(`${B}${c.brightCyan}Lightning Tip Jar${R}`);
  ctx.print(`  ${D}address:${R} ${c.brightYellow}${LIGHTNING_ADDRESS}${R}`);
  ctx.print(`  ${D}amount: ${R} ${c.brightYellow}${sats.toLocaleString()} sats${R}`);
  ctx.print('');

  // Step 1: resolve the LNURL-pay endpoint.
  const params = await withSpinner(ctx, `resolving ${lnurlpUrl}`, async () => {
    const res = await abortableFetch(lnurlpUrl, ctx.signal);
    if (!res.ok) throw new Error(`LNURL-pay endpoint returned HTTP ${res.status}`);
    const data = (await res.json()) as LnurlpResponse;
    if (data.tag !== 'payRequest') throw new Error(`expected payRequest, got ${data.tag}`);
    return data;
  });
  checkAborted(ctx.signal);

  const msats = sats * 1000;
  if (msats < params.minSendable || msats > params.maxSendable) {
    ctx.print(`${c.red}amount out of range: ${params.minSendable / 1000}–${params.maxSendable / 1000} sats${R}`);
    return;
  }

  // Step 2: request an invoice via the callback. Route through the same
  // proxy so the browser doesn't hit a CORS wall.
  const proxiedCallback = params.callback.replace(
    'https://pay.bitcoinjungle.app',
    '/_bj',
  );
  const sep = proxiedCallback.includes('?') ? '&' : '?';
  const callbackUrl = `${proxiedCallback}${sep}amount=${msats}`;
  const invoice = await withSpinner(ctx, 'minting BOLT11 invoice…', async () => {
    const res = await abortableFetch(callbackUrl, ctx.signal);
    if (!res.ok) throw new Error(`callback returned HTTP ${res.status}`);
    const data = (await res.json()) as LnurlpInvoiceResponse;
    if (data.status === 'ERROR' || !data.pr) throw new Error(data.reason ?? 'no invoice returned');
    return data.pr;
  });
  checkAborted(ctx.signal);

  // Step 3: render as a QR code using half-block characters. The qrcode
  // library's browser build strips the terminal renderer, so we get the raw
  // matrix and render it ourselves — two rows per line via ▀/▄/█.
  const qr = renderQrHalfBlocks(invoice.toUpperCase());

  ctx.print(`${c.green}✓${R} invoice ready — scan to pay from any Lightning wallet:`);
  ctx.print('');
  for (const line of qr) ctx.print(line);
  ctx.print('');
  ctx.print(`${D}BOLT11:${R}`);
  // Wrap long invoice across the terminal nicely.
  for (const chunk of wrap(invoice, 64)) {
    ctx.print(`  ${c.brightYellow}${chunk}${R}`);
  }
  ctx.print('');
  ctx.print(`${D}sats land in Lee's Bitcoin Jungle wallet — no servers in between.${R}`);
}

function wrap(s: string, width: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < s.length; i += width) lines.push(s.slice(i, i + width));
  return lines;
}

// Render `data` as a QR code using ANSI half-blocks on a forced white
// background. Polarity matters: scanners need dark modules on a light
// background, and the terminal theme is light-on-dark, so we paint a white
// canvas with black foreground inside the QR region. Each output cell
// represents two stacked QR modules so the aspect is ~square in the terminal.
function renderQrHalfBlocks(data: string): string[] {
  const matrix = QRCode.create(data, { errorCorrectionLevel: 'L' });
  const size: number = matrix.modules.size;
  const bits: Uint8Array = matrix.modules.data;
  const get = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= size || y >= size) return 0;
    return bits[y * size + x] ? 1 : 0;
  };

  const pad = 4; // QR quiet zone — scanners require ≥4 modules.
  // Black fg on bright-white bg, reset at line end.
  const ON = '\x1b[30;107m';
  const OFF = '\x1b[0m';

  const width = size + pad * 2;
  const lines: string[] = [];
  for (let y = -pad; y < size + pad; y += 2) {
    let row = ON;
    for (let x = -pad; x < size + pad; x++) {
      const top = get(x, y);
      const bot = get(x, y + 1);
      if (top && bot) row += '█';      // both dark
      else if (top)  row += '▀';        // top dark, bottom light
      else if (bot)  row += '▄';        // top light, bottom dark
      else           row += ' ';        // both light
    }
    row += OFF;
    lines.push(row);
  }
  // Outer whitespace breathing room.
  const blank = ON + ' '.repeat(width) + OFF;
  return [blank, ...lines, blank];
}
