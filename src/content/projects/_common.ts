import { ansi } from '../../banner.js';
import type { CommandContext } from '../../types.js';

const c = ansi.fg;
const R = ansi.reset;
const D = ansi.dim;

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export async function withSpinner<T>(
  ctx: CommandContext,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  let i = 0;
  let alive = true;
  const tick = () => {
    if (!alive) return;
    ctx.printRaw(`\r${c.brightCyan}${SPINNER[i % SPINNER.length]}${R} ${D}${label}${R}`);
    i++;
  };
  tick();
  const handle = setInterval(tick, 80);
  try {
    const result = await task();
    return result;
  } finally {
    alive = false;
    clearInterval(handle);
    ctx.printRaw('\r\x1b[K');
  }
}

// Unicode block sparkline. Series should be small (<=80 points).
export function sparkline(series: number[]): string {
  if (series.length === 0) return '';
  const blocks = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  return series
    .map(v => {
      const idx = Math.min(blocks.length - 1, Math.max(0, Math.floor(((v - min) / range) * (blocks.length - 1))));
      return blocks[idx];
    })
    .join('');
}

export function abortableFetch(url: string, signal: AbortSignal, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal });
}

export function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}
