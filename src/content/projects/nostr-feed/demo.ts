import type { CommandContext } from '../../../types.js';
import { ansi } from '../../../banner.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const D = ansi.dim;

const RELAY = 'wss://no.str.cr';

// npub14f26g7dddy6dpltc70da3pg4e5w2p4apzzqjuugnsr2ema6e3y6s2xv7lu
const LEE_PUBKEY = 'aa55a479ad6934d0fd78f3dbd88515cd1ca0d7a110812e711380d59df7598935';

type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  content: string;
  tags: string[][];
};

function shortPubkey(pk: string): string {
  return pk.slice(0, 8) + '…' + pk.slice(-4);
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export async function run(ctx: CommandContext): Promise<void> {
  const argPubkey = ctx.args[0];
  const pubkey = (argPubkey || LEE_PUBKEY).toLowerCase();

  ctx.print('');
  ctx.print(`${B}${c.brightCyan}Nostr Feed${R}  ${D}— live stream from ${RELAY}${R}`);
  ctx.print(`  ${D}pubkey:${R} ${c.brightYellow}${shortPubkey(pubkey)}${R}`);
  ctx.print('');

  const subId = 'lee-' + Math.random().toString(36).slice(2, 8);
  const filter = { authors: [pubkey], kinds: [1], limit: 5 };
  const events: NostrEvent[] = [];

  await new Promise<void>(resolve => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(RELAY);
    } catch (err) {
      ctx.print(`${c.red}could not open relay: ${(err as Error).message}${R}`);
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
    }, 8000);

    const onAbort = () => {
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
    };
    ctx.signal.addEventListener('abort', onAbort, { once: true });

    ws.onopen = () => {
      ctx.print(`${c.green}✓${R} connected to ${RELAY}`);
      ws.send(JSON.stringify(['REQ', subId, filter]));
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data as string);
        if (!Array.isArray(data)) return;
        if (data[0] === 'EVENT' && data[1] === subId) {
          const ev = data[2] as NostrEvent;
          if (events.find(e => e.id === ev.id)) return;
          events.push(ev);
          printNote(ctx, ev, events.length);
          if (events.length >= 5) {
            ws.send(JSON.stringify(['CLOSE', subId]));
            try { ws.close(); } catch { /* ignore */ }
          }
        } else if (data[0] === 'EOSE' && data[1] === subId) {
          // End of stored events. Close shortly after to give a moment for late events.
          setTimeout(() => {
            try { ws.close(); } catch { /* ignore */ }
          }, 500);
        }
      } catch { /* malformed message — ignore */ }
    };

    ws.onerror = () => {
      ctx.print(`${c.red}relay error${R}`);
    };

    ws.onclose = () => {
      clearTimeout(timer);
      ctx.signal.removeEventListener('abort', onAbort);
      resolve();
    };
  });

  ctx.print('');
  if (events.length === 0) {
    ctx.print(`${D}no recent notes from this pubkey on ${RELAY}.${R}`);
  } else {
    ctx.print(`${D}— ${events.length} notes from ${shortPubkey(pubkey)} —${R}`);
  }
}

function printNote(ctx: CommandContext, ev: NostrEvent, idx: number): void {
  const content = ev.content.slice(0, 280).replace(/\r?\n/g, ' ');
  ctx.print(`${c.brightCyan}[${idx}]${R} ${D}${relativeTime(ev.created_at)}${R}  ${c.brightYellow}id:${R} ${D}${ev.id.slice(0, 12)}${R}`);
  // Wrap long content.
  for (const line of wrap(content, 72)) {
    ctx.print(`  ${line}`);
  }
  ctx.print('');
}

function wrap(s: string, width: number): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = (cur ? cur + ' ' : '') + w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
