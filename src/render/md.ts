import { ansi } from '../banner.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const I = ansi.italic;
const D = ansi.dim;
const U = ansi.underline;

function inline(text: string): string {
  // Render in order so links don't get clobbered by emphasis inside their labels.
  // Links: [label](url) — OSC 8 hyperlink so xterm.js's web-links addon recognises them.
  let out = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const open = `\x1b]8;;${url}\x07`;
    const close = `\x1b]8;;\x07`;
    return `${open}${c.cyan}${U}${label}${R}${close}`;
  });
  // Inline code: `code`
  out = out.replace(/`([^`]+)`/g, (_, code) => `${c.brightCyan}${code}${R}`);
  // Bold: **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, (_, s) => `${B}${s}${R}`);
  // Italic: *text* (but not list bullets — those are at line start, handled separately)
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, (_, pre, s) => `${pre}${I}${s}${R}`);
  return out;
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      inFence = !inFence;
      out.push(`${D}${'─'.repeat(40)}${R}`);
      continue;
    }
    if (inFence) {
      out.push(`  ${c.brightCyan}${line}${R}`);
      continue;
    }

    // Heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = inline(h[2]);
      if (level === 1) {
        out.push('');
        out.push(`${B}${c.brightGreen}${text}${R}`);
        out.push(`${c.brightGreen}${'═'.repeat(Math.min(60, stripAnsi(text).length))}${R}`);
      } else if (level === 2) {
        out.push('');
        out.push(`${B}${c.brightYellow}${text}${R}`);
        out.push(`${c.brightYellow}${'─'.repeat(Math.min(60, stripAnsi(text).length))}${R}`);
      } else {
        out.push('');
        out.push(`${B}${c.brightCyan}${text}${R}`);
      }
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line)) {
      out.push(`${D}${'─'.repeat(40)}${R}`);
      continue;
    }

    // Blockquote
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      out.push(`  ${c.brightMagenta}│${R} ${D}${inline(bq[1])}${R}`);
      continue;
    }

    // List item (- or *)
    const ul = /^(\s*)[-*]\s+(.*)$/.exec(line);
    if (ul) {
      const indent = ul[1] ?? '';
      out.push(`${indent}${c.brightCyan}•${R} ${inline(ul[2])}`);
      continue;
    }

    // Ordered list
    const ol = /^(\s*)(\d+)\.\s+(.*)$/.exec(line);
    if (ol) {
      out.push(`${ol[1]}${c.brightCyan}${ol[2]}.${R} ${inline(ol[3])}`);
      continue;
    }

    if (line.trim() === '') {
      out.push('');
      continue;
    }

    out.push(inline(line));
  }

  return out.join('\r\n');
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}
