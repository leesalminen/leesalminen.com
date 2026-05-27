import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { Theme } from './types.js';
import { ansi } from './banner.js';
import { listCommandNames, runCommand } from './commands.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;

export const THEMES: Record<string, Theme> = {
  matrix: {
    name: 'matrix',
    background: '#0a0a0a',
    foreground: '#33ff33',
    cursor: '#33ff33',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#226622',
    black: '#0a0a0a',
    red: '#ff5555',
    green: '#33ff33',
    yellow: '#ffff66',
    blue: '#66aaff',
    magenta: '#ff66cc',
    cyan: '#66ffff',
    white: '#cccccc',
    brightBlack: '#444444',
    brightRed: '#ff8888',
    brightGreen: '#88ff88',
    brightYellow: '#ffffaa',
    brightBlue: '#88ccff',
    brightMagenta: '#ff99dd',
    brightCyan: '#99ffff',
    brightWhite: '#ffffff',
  },
  amber: {
    name: 'amber',
    background: '#1a0e00',
    foreground: '#ffb000',
    cursor: '#ffb000',
    cursorAccent: '#1a0e00',
    selectionBackground: '#664400',
    black: '#1a0e00',
    red: '#ff5555',
    green: '#ffb000',
    yellow: '#ffd060',
    blue: '#aa7700',
    magenta: '#ff8844',
    cyan: '#ffcc88',
    white: '#ffdda0',
    brightBlack: '#553300',
    brightRed: '#ff8888',
    brightGreen: '#ffc844',
    brightYellow: '#ffe888',
    brightBlue: '#ccaa55',
    brightMagenta: '#ffaa77',
    brightCyan: '#ffe4bb',
    brightWhite: '#ffffff',
  },
  mono: {
    name: 'mono',
    background: '#0a0a0a',
    foreground: '#e0e0e0',
    cursor: '#ffffff',
    cursorAccent: '#0a0a0a',
    selectionBackground: '#333333',
    black: '#0a0a0a',
    red: '#cccccc',
    green: '#e0e0e0',
    yellow: '#ffffff',
    blue: '#bbbbbb',
    magenta: '#dddddd',
    cyan: '#eeeeee',
    white: '#ffffff',
    brightBlack: '#666666',
    brightRed: '#eeeeee',
    brightGreen: '#ffffff',
    brightYellow: '#ffffff',
    brightBlue: '#dddddd',
    brightMagenta: '#eeeeee',
    brightCyan: '#ffffff',
    brightWhite: '#ffffff',
  },
  dracula: {
    name: 'dracula',
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#bd93f9',
    cursorAccent: '#282a36',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
    brightBlack: '#6272a4',
    brightRed: '#ff6e6e',
    brightGreen: '#69ff94',
    brightYellow: '#ffffa5',
    brightBlue: '#d6acff',
    brightMagenta: '#ff92df',
    brightCyan: '#a4ffff',
    brightWhite: '#ffffff',
  },
  solarized: {
    name: 'solarized',
    background: '#002b36',
    foreground: '#839496',
    cursor: '#93a1a1',
    cursorAccent: '#002b36',
    selectionBackground: '#073642',
    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',
    brightBlack: '#586e75',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',
  },
};

export type DispatchHandler = (line: string, signal: AbortSignal) => Promise<void>;

export class TerminalUI {
  private term: XTerm;
  private fit: FitAddon;
  private buffer = '';
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = -1;
  private historyDraft = '';
  private currentAbort: AbortController | null = null;
  private busy = false;
  private prompt = '';
  private dispatch: DispatchHandler = async () => {};
  private currentTheme = 'matrix';
  private statusLeft: HTMLElement | null = null;
  private statusRight: HTMLElement | null = null;
  private agentLabel = '';

  constructor(container: HTMLElement) {
    this.term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace",
      fontSize: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      allowProposedApi: true,
      scrollback: 5000,
      theme: THEMES.matrix,
      convertEol: false,
    });

    this.fit = new FitAddon();
    this.term.loadAddon(this.fit);
    this.term.loadAddon(new WebLinksAddon());

    this.term.open(container);
    this.fit.fit();

    this.term.onData(data => this.onData(data));
    this.term.onKey(({ domEvent }) => {
      // Ctrl+C / Ctrl+L are handled in onData via ETX/FF — keep this hook for paste/focus.
      if (domEvent.key === 'Tab') domEvent.preventDefault();
    });

    window.addEventListener('resize', () => this.fit.fit());

    this.statusLeft = document.getElementById('status-left');
    this.statusRight = document.getElementById('status-right');
    this.updateStatus();
  }

  focus() {
    this.term.focus();
  }

  setDispatch(d: DispatchHandler) {
    this.dispatch = d;
  }

  setPrompt(p: string) {
    this.prompt = p;
  }

  setAgentLabel(label: string) {
    this.agentLabel = label;
    this.updateStatus();
  }

  setTheme(name: string): boolean {
    const t = THEMES[name];
    if (!t) return false;
    this.term.options.theme = t;
    this.currentTheme = name;
    document.documentElement.style.setProperty('--bg', t.background);
    document.documentElement.style.setProperty('--fg', t.foreground);
    this.updateStatus();
    return true;
  }

  listThemes(): string[] {
    return Object.keys(THEMES);
  }

  print(line: string) {
    // Each call ends with newline. Lines can already contain CRLF for multi-line strings.
    this.term.write(line.replace(/\r?\n/g, '\r\n') + '\r\n');
  }

  printRaw(text: string) {
    this.term.write(text);
  }

  clear() {
    this.term.write('\x1b[2J\x1b[H');
  }

  showPrompt() {
    this.term.write(this.prompt);
    this.buffer = '';
    this.cursor = 0;
  }

  getHistory(): string[] {
    return this.history.slice();
  }

  // Programmatically run a command as if the user typed it.
  async typeAndRun(line: string) {
    if (this.busy) return;
    this.term.write(line + '\r\n');
    await this.handleSubmit(line);
  }

  async runSilent(line: string): Promise<string> {
    // Run a command but capture its output instead of writing it to the terminal.
    // Used by the AI agent so the human-visible output is decoupled from the
    // raw text the model consumes.
    const collected: string[] = [];
    const ctxOverride = {
      print: (l: string) => collected.push(l),
      printRaw: (t: string) => collected.push(t),
      clear: () => {},
      run: async () => {},
      getHistory: () => this.history.slice(),
      setTheme: (name: string) => this.setTheme(name),
      listThemes: () => this.listThemes(),
    };
    const ac = new AbortController();
    await runCommand(line, { ...ctxOverride, signal: ac.signal });
    return collected.map(stripAnsi).join('\n').trim();
  }

  private updateStatus() {
    if (this.statusLeft) {
      this.statusLeft.textContent = `theme: ${this.currentTheme}  •  ${this.history.length} cmds`;
    }
    if (this.statusRight) {
      this.statusRight.textContent = this.agentLabel || 'classic mode';
    }
  }

  private async onData(data: string) {
    // If a command is running, only handle Ctrl+C.
    if (this.busy) {
      if (data === '\x03') {
        this.currentAbort?.abort();
      }
      return;
    }

    for (let i = 0; i < data.length; ) {
      const code = data.charCodeAt(i);

      if (data[i] === '\x1b') {
        // Escape sequence — e.g. arrow keys
        if (data[i + 1] === '[') {
          const next = data[i + 2];
          if (next === 'A') {
            this.historyUp();
            i += 3;
            continue;
          }
          if (next === 'B') {
            this.historyDown();
            i += 3;
            continue;
          }
          if (next === 'C') {
            this.moveCursor(1);
            i += 3;
            continue;
          }
          if (next === 'D') {
            this.moveCursor(-1);
            i += 3;
            continue;
          }
          if (next === 'H') {
            // Home
            this.moveCursorAbs(0);
            i += 3;
            continue;
          }
          if (next === 'F') {
            // End
            this.moveCursorAbs(this.buffer.length);
            i += 3;
            continue;
          }
          // Unknown escape — skip
          i += 3;
          continue;
        }
        i++;
        continue;
      }

      if (code === 0x03) {
        // Ctrl+C
        this.term.write('^C\r\n');
        this.buffer = '';
        this.cursor = 0;
        this.historyIndex = -1;
        this.showPrompt();
        i++;
        continue;
      }
      if (code === 0x0c) {
        // Ctrl+L — clear and redraw prompt with current buffer
        this.clear();
        this.term.write(this.prompt + this.buffer);
        const back = this.buffer.length - this.cursor;
        if (back > 0) this.term.write(`\x1b[${back}D`);
        i++;
        continue;
      }
      if (code === 0x15) {
        // Ctrl+U — clear current line
        this.redrawBuffer('');
        i++;
        continue;
      }
      if (code === 0x01) {
        // Ctrl+A — beginning of line
        this.moveCursorAbs(0);
        i++;
        continue;
      }
      if (code === 0x05) {
        // Ctrl+E — end of line
        this.moveCursorAbs(this.buffer.length);
        i++;
        continue;
      }
      if (code === 0x17) {
        // Ctrl+W — delete previous word
        this.deleteWord();
        i++;
        continue;
      }
      if (code === 0x7f || code === 0x08) {
        // Backspace
        this.backspace();
        i++;
        continue;
      }
      if (code === 0x0d || code === 0x0a) {
        // Enter
        const line = this.buffer;
        this.term.write('\r\n');
        this.buffer = '';
        this.cursor = 0;
        this.historyIndex = -1;
        await this.handleSubmit(line);
        i++;
        continue;
      }
      if (code === 0x09) {
        // Tab — simple completion against command names
        this.tabComplete();
        i++;
        continue;
      }
      if (code < 0x20) {
        // Other control chars — ignore
        i++;
        continue;
      }

      // Insert printable
      this.insert(data[i]);
      i++;
    }
  }

  private insert(ch: string) {
    if (this.cursor === this.buffer.length) {
      this.buffer += ch;
      this.term.write(ch);
      this.cursor++;
      return;
    }
    const tail = this.buffer.slice(this.cursor);
    this.buffer = this.buffer.slice(0, this.cursor) + ch + tail;
    this.term.write(ch + tail);
    if (tail.length > 0) this.term.write(`\x1b[${tail.length}D`);
    this.cursor++;
  }

  private deleteWord() {
    if (this.cursor === 0) return;
    let start = this.cursor;
    while (start > 0 && /\s/.test(this.buffer[start - 1])) start--;
    while (start > 0 && !/\s/.test(this.buffer[start - 1])) start--;
    const removed = this.cursor - start;
    const before = this.buffer.slice(0, start);
    const after = this.buffer.slice(this.cursor);
    this.buffer = before + after;
    if (removed > 0) this.term.write(`\x1b[${removed}D`);
    this.term.write('\x1b[K' + after);
    if (after.length > 0) this.term.write(`\x1b[${after.length}D`);
    this.cursor = start;
  }

  private backspace() {
    if (this.cursor === 0) return;
    this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
    this.cursor--;
    // Move left, write rest + space to overwrite tail, then move back
    const rest = this.buffer.slice(this.cursor);
    this.term.write(`\x1b[D${rest} `);
    this.term.write(`\x1b[${rest.length + 1}D`);
  }

  private moveCursor(delta: number) {
    const next = Math.max(0, Math.min(this.buffer.length, this.cursor + delta));
    if (next === this.cursor) return;
    if (next > this.cursor) {
      this.term.write(`\x1b[${next - this.cursor}C`);
    } else {
      this.term.write(`\x1b[${this.cursor - next}D`);
    }
    this.cursor = next;
  }

  private moveCursorAbs(pos: number) {
    this.moveCursor(pos - this.cursor);
  }

  private redrawBuffer(newBuffer: string) {
    // Erase current line content after prompt and rewrite buffer.
    // Move cursor to start of buffer
    if (this.cursor > 0) this.term.write(`\x1b[${this.cursor}D`);
    // Clear from cursor to end of line
    this.term.write('\x1b[K');
    this.buffer = newBuffer;
    this.cursor = newBuffer.length;
    this.term.write(newBuffer);
  }

  private historyUp() {
    if (this.history.length === 0) return;
    if (this.historyIndex === -1) {
      this.historyDraft = this.buffer;
      this.historyIndex = this.history.length - 1;
    } else if (this.historyIndex > 0) {
      this.historyIndex--;
    }
    this.redrawBuffer(this.history[this.historyIndex] ?? '');
  }

  private historyDown() {
    if (this.historyIndex === -1) return;
    if (this.historyIndex >= this.history.length - 1) {
      this.historyIndex = -1;
      this.redrawBuffer(this.historyDraft);
      this.historyDraft = '';
    } else {
      this.historyIndex++;
      this.redrawBuffer(this.history[this.historyIndex] ?? '');
    }
  }

  private tabComplete() {
    if (!this.buffer.trim()) return;
    const parts = this.buffer.split(/\s+/);
    if (parts.length !== 1) return; // only complete first word for now
    const prefix = parts[0];
    const names = listCommandNames();
    const matches = names.filter(n => n.startsWith(prefix));
    if (matches.length === 0) return;
    if (matches.length === 1) {
      this.redrawBuffer(matches[0] + ' ');
      return;
    }
    // Multiple matches — show them and reprint prompt + buffer
    this.term.write('\r\n');
    this.term.write(matches.map(m => `${c.brightCyan}${m}${R}`).join('  '));
    this.term.write('\r\n');
    this.term.write(this.prompt + this.buffer);
  }

  private async handleSubmit(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      this.showPrompt();
      return;
    }
    if (this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
    }
    this.updateStatus();
    this.busy = true;
    this.currentAbort = new AbortController();
    try {
      await this.dispatch(trimmed, this.currentAbort.signal);
    } finally {
      this.busy = false;
      this.currentAbort = null;
      this.showPrompt();
    }
  }

  printAgentSay(text: string) {
    const lines = text.split(/\r?\n/);
    const prefix = `${c.brightCyan}${B}✦${R} `;
    for (const ln of lines) {
      this.print(`${prefix}${c.cyan}${ln}${R}`);
    }
  }

  printAgentDoing(text: string) {
    this.print(`${ansi.dim}  ↳ ${text}${R}`);
  }

  printSystem(text: string) {
    this.print(`${ansi.dim}${text}${R}`);
  }
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
