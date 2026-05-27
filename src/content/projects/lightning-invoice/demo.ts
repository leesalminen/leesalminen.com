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
  const lnurlpUrl = `https://${host}/.well-known/lnurlp/${name}`;

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

  // Step 2: request an invoice via the callback.
  const sep = params.callback.includes('?') ? '&' : '?';
  const callbackUrl = `${params.callback}${sep}amount=${msats}`;
  const invoice = await withSpinner(ctx, 'minting BOLT11 invoice…', async () => {
    const res = await abortableFetch(callbackUrl, ctx.signal);
    if (!res.ok) throw new Error(`callback returned HTTP ${res.status}`);
    const data = (await res.json()) as LnurlpInvoiceResponse;
    if (data.status === 'ERROR' || !data.pr) throw new Error(data.reason ?? 'no invoice returned');
    return data.pr;
  });
  checkAborted(ctx.signal);

  // Step 3: render as a QR code with background blocks. `small: true` uses
  // half-blocks so the QR fits in fewer rows.
  const qr = await QRCode.toString(invoice.toUpperCase(), {
    type: 'terminal',
    small: true,
    errorCorrectionLevel: 'L',
  });

  ctx.print(`${c.green}✓${R} invoice ready — scan to pay from any Lightning wallet:`);
  ctx.print('');
  // QRCode terminal output already includes its own line breaks.
  ctx.printRaw(qr.replace(/\n/g, '\r\n'));
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
