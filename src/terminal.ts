import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import type { Theme } from './types.js';
import { ansi } from './banner.js';
import { listCommandNames, runPipeline } from './commands.js';
import { VirtualFs, HOME } from './fs.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;

const HISTORY_KEY = 'lee-terminal-history';
const CWD_KEY = 'lee-terminal-cwd';
const HISTORY_CAP = 500;

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
export type PromptBuilder = (cwd: string) => string;

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
  private promptBuilder: PromptBuilder = () => '$ ';
  private dispatch: DispatchHandler = async () => {};
  private currentTheme = 'matrix';
  private statusLeft: HTMLElement | null = null;
  private statusRight: HTMLElement | null = null;
  private agentLabel = '';
  private modalResolve: ((index: number) => void) | null = null;
  private modalCount = 0;
  private cwd: string = HOME;
  readonly fs: VirtualFs = new VirtualFs();
  // Reverse-search state (Ctrl-R)
  private searching = false;
  private searchQuery = '';
  private searchResult = '';

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
      if (domEvent.key === 'Tab') domEvent.preventDefault();
    });

    window.addEventListener('resize', () => this.fit.fit());

    this.statusLeft = document.getElementById('status-left');
    this.statusRight = document.getElementById('status-right');

    this.loadPersisted();
    this.updateStatus();
  }

  private loadPersisted() {
    try {
      const h = localStorage.getItem(HISTORY_KEY);
      if (h) {
        const parsed = JSON.parse(h);
        if (Array.isArray(parsed)) this.history = parsed.filter((x: unknown) => typeof x === 'string').slice(-HISTORY_CAP);
      }
      const cwd = localStorage.getItem(CWD_KEY);
      if (cwd && this.fs.get(cwd)?.type === 'dir') {
        this.cwd = cwd;
      }
    } catch { /* ignore */ }
  }

  private persistHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(this.history.slice(-HISTORY_CAP)));
    } catch { /* ignore */ }
  }

  private persistCwd() {
    try {
      localStorage.setItem(CWD_KEY, this.cwd);
    } catch { /* ignore */ }
  }

  focus() {
    this.term.focus();
  }

  setDispatch(d: DispatchHandler) {
    this.dispatch = d;
  }

  setPromptBuilder(fn: PromptBuilder) {
    this.promptBuilder = fn;
    this.prompt = this.promptBuilder(this.cwd);
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

  getCwd(): string {
    return this.cwd;
  }

  setCwd(p: string): void {
    const node = this.fs.get(p);
    if (!node || node.type !== 'dir') return;
    this.cwd = p;
    this.prompt = this.promptBuilder(p);
    this.persistCwd();
  }

  print(line: string) {
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

  clearHistory(): void {
    this.history = [];
    try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
    this.updateStatus();
  }

  // Programmatically run a command as if the user typed it.
  async typeAndRun(line: string) {
    if (this.busy) return;
    this.term.write(line + '\r\n');
    await this.handleSubmit(line);
  }

  async runSilent(line: string): Promise<string> {
    // Run a full pipeline but capture its output instead of writing it to the
    // terminal. Used by the AI agent so the human-visible output is decoupled
    // from the raw text the model consumes.
    const collected: string[] = [];
    const ac = new AbortController();
    await runPipeline(line, {
      print: (l: string) => collected.push(l),
      printRaw: (t: string) => collected.push(t),
      clear: () => {},
      run: async () => {},
      getHistory: () => this.history.slice(),
      setTheme: (name: string) => this.setTheme(name),
      listThemes: () => this.listThemes(),
      cwd: this.cwd,
      setCwd: (p: string) => this.setCwd(p),
      fs: this.fs,
      signal: ac.signal,
    });
    return collected.map(stripAnsi).join('\n').trim();
  }

  private updateStatus() {
    if (this.statusLeft) {
      this.statusLeft.textContent = `${this.currentTheme}  ·  cwd: ${abbreviateCwd(this.cwd)}  ·  ${this.history.length} cmds`;
    }
    if (this.statusRight) {
      this.statusRight.textContent = this.agentLabel || 'classic mode';
    }
  }

  private async onData(data: string) {
    // Modal mode — capture a single digit (1..N) or Ctrl+C and resolve.
    if (this.modalResolve) {
      if (data === '\x03') {
        const r = this.modalResolve;
        this.modalResolve = null;
        r(-1);
        return;
      }
      for (const ch of data) {
        const code = ch.charCodeAt(0);
        if (code >= 0x31 && code <= 0x39) {
          const idx = code - 0x31;
          if (idx < this.modalCount) {
            const r = this.modalResolve;
            this.modalResolve = null;
            r(idx);
            return;
          }
        }
      }
      return;
    }

    // If a command is running, only handle Ctrl+C.
    if (this.busy) {
      if (data === '\x03') {
        this.currentAbort?.abort();
      }
      return;
    }

    // Reverse-search mode (Ctrl-R) consumes data with its own rules.
    if (this.searching) {
      for (let i = 0; i < data.length; i++) {
        await this.handleSearchKey(data, i);
        if (!this.searching) break;
      }
      return;
    }

    for (let i = 0; i < data.length; ) {
      const code = data.charCodeAt(i);

      if (data[i] === '\x1b') {
        if (data[i + 1] === '[') {
          const next = data[i + 2];
          if (next === 'A') { this.historyUp(); i += 3; continue; }
          if (next === 'B') { this.historyDown(); i += 3; continue; }
          if (next === 'C') { this.moveCursor(1); i += 3; continue; }
          if (next === 'D') { this.moveCursor(-1); i += 3; continue; }
          if (next === 'H') { this.moveCursorAbs(0); i += 3; continue; }
          if (next === 'F') { this.moveCursorAbs(this.buffer.length); i += 3; continue; }
          i += 3;
          continue;
        }
        i++;
        continue;
      }

      if (code === 0x03) {
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
      if (code === 0x12) {
        // Ctrl-R — reverse history search
        this.beginSearch();
        i++;
        continue;
      }
      if (code === 0x15) {
        this.redrawBuffer('');
        i++;
        continue;
      }
      if (code === 0x01) { this.moveCursorAbs(0); i++; continue; }
      if (code === 0x05) { this.moveCursorAbs(this.buffer.length); i++; continue; }
      if (code === 0x17) { this.deleteWord(); i++; continue; }
      if (code === 0x7f || code === 0x08) { this.backspace(); i++; continue; }
      if (code === 0x0d || code === 0x0a) {
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
        this.tabComplete();
        i++;
        continue;
      }
      if (code < 0x20) { i++; continue; }

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
    const rest = this.buffer.slice(this.cursor);
    this.term.write(`\x1b[D${rest} `);
    this.term.write(`\x1b[${rest.length + 1}D`);
  }

  private moveCursor(delta: number) {
    const next = Math.max(0, Math.min(this.buffer.length, this.cursor + delta));
    if (next === this.cursor) return;
    if (next > this.cursor) this.term.write(`\x1b[${next - this.cursor}C`);
    else this.term.write(`\x1b[${this.cursor - next}D`);
    this.cursor = next;
  }

  private moveCursorAbs(pos: number) {
    this.moveCursor(pos - this.cursor);
  }

  private redrawBuffer(newBuffer: string) {
    if (this.cursor > 0) this.term.write(`\x1b[${this.cursor}D`);
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
    const parts = this.buffer.split(/\s+/);
    // First word — complete against command names.
    if (parts.length <= 1) {
      const prefix = parts[0] ?? '';
      const names = listCommandNames();
      const matches = names.filter(n => n.startsWith(prefix));
      this.applyCompletion(matches);
      return;
    }
    // Subsequent words — complete against the virtual filesystem.
    const last = parts[parts.length - 1];
    const candidates = this.fs.complete(this.cwd, last);
    // Convert absolute paths back into the prefix the user is typing.
    // We want to replace the tail of the buffer that is `last` with the matched suffix.
    const display = candidates.map(abs => {
      // If the user typed an absolute path, keep it absolute.
      if (last.startsWith('/') || last.startsWith('~')) {
        return last.startsWith('~') ? '~' + abs.slice(HOME.length) : abs;
      }
      // Otherwise, return the relative suffix.
      const cwdAbs = this.cwd === '/' ? '' : this.cwd;
      if (abs.startsWith(cwdAbs + '/')) return abs.slice(cwdAbs.length + 1);
      return abs;
    });
    this.applyCompletion(display);
  }

  private applyCompletion(matches: string[]) {
    if (matches.length === 0) return;
    const parts = this.buffer.split(/(\s+)/); // keep spaces
    if (matches.length === 1) {
      // Replace last non-space token
      let i = parts.length - 1;
      while (i >= 0 && /^\s+$/.test(parts[i])) i--;
      if (i < 0) return;
      const completion = matches[0];
      const isDir = completion.endsWith('/');
      parts[i] = completion + (isDir ? '' : ' ');
      this.redrawBuffer(parts.join(''));
      return;
    }
    // Common prefix among matches — extend up to it.
    const commonPrefix = longestCommonPrefix(matches);
    let i = parts.length - 1;
    while (i >= 0 && /^\s+$/.test(parts[i])) i--;
    if (i >= 0 && commonPrefix.length > parts[i].length) {
      parts[i] = commonPrefix;
      this.redrawBuffer(parts.join(''));
    }
    this.term.write('\r\n');
    this.term.write(matches.map(m => `${c.brightCyan}${m}${R}`).join('  '));
    this.term.write('\r\n');
    this.term.write(this.prompt + this.buffer);
    const back = this.buffer.length - this.cursor;
    if (back > 0) this.term.write(`\x1b[${back}D`);
  }

  // ---- reverse search ----

  private beginSearch() {
    this.searching = true;
    this.searchQuery = '';
    this.searchResult = '';
    this.redrawSearchLine();
  }

  private async handleSearchKey(data: string, i: number) {
    const code = data.charCodeAt(i);
    if (code === 0x0d || code === 0x0a) {
      // Accept — exit search, place result in buffer
      this.finishSearch(true);
      return;
    }
    if (code === 0x03 || code === 0x07) {
      // Ctrl-C or Ctrl-G: cancel
      this.finishSearch(false);
      return;
    }
    if (code === 0x12) {
      // Ctrl-R again — find next earlier match
      this.findNextSearch();
      return;
    }
    if (code === 0x7f || code === 0x08) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.updateSearchResult();
      this.redrawSearchLine();
      return;
    }
    if (code < 0x20) return;
    this.searchQuery += data[i];
    this.updateSearchResult();
    this.redrawSearchLine();
  }

  private updateSearchResult() {
    if (!this.searchQuery) {
      this.searchResult = '';
      return;
    }
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].includes(this.searchQuery)) {
        this.searchResult = this.history[i];
        return;
      }
    }
    this.searchResult = '';
  }

  private findNextSearch() {
    if (!this.searchResult || !this.searchQuery) return;
    const idx = this.history.lastIndexOf(this.searchResult);
    for (let i = idx - 1; i >= 0; i--) {
      if (this.history[i].includes(this.searchQuery)) {
        this.searchResult = this.history[i];
        this.redrawSearchLine();
        return;
      }
    }
  }

  private redrawSearchLine() {
    // Erase current line and reprint search prompt + result
    this.term.write('\r\x1b[K');
    const prefix = `${c.brightMagenta}(reverse-i-search)\`${R}${this.searchQuery}${c.brightMagenta}':${R} `;
    this.term.write(prefix + this.searchResult);
  }

  private finishSearch(accept: boolean) {
    this.searching = false;
    // Clear the search line
    this.term.write('\r\x1b[K');
    // Redraw prompt + buffer (or search result if accepted)
    const newBuffer = accept ? this.searchResult || this.buffer : this.buffer;
    this.buffer = newBuffer;
    this.cursor = newBuffer.length;
    this.term.write(this.prompt + this.buffer);
    this.searchQuery = '';
    this.searchResult = '';
  }

  private async handleSubmit(line: string) {
    const trimmed = line.trim();
    if (!trimmed) {
      this.showPrompt();
      return;
    }
    if (this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed);
      if (this.history.length > HISTORY_CAP) this.history.shift();
      this.persistHistory();
    }
    this.updateStatus();
    this.busy = true;
    this.currentAbort = new AbortController();
    try {
      await this.dispatch(trimmed, this.currentAbort.signal);
    } finally {
      this.busy = false;
      this.currentAbort = null;
      this.updateStatus();
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

  printProgress(label: string, pct: number, suffix = '', done = false) {
    const width = 28;
    const clamped = Math.max(0, Math.min(100, pct));
    const filled = Math.round((clamped / 100) * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const pctStr = clamped.toFixed(0).padStart(3, ' ');
    const tail = suffix ? `  ${ansi.dim}${suffix}${R}` : '';
    this.term.write(`\r\x1b[2K${ansi.dim}${label}${R} [${c.brightCyan}${bar}${R}] ${pctStr}%${tail}`);
    if (done || clamped >= 100) this.term.write('\r\n');
  }

  async chooseModal(title: string, body: string[], options: string[]): Promise<number> {
    const width = Math.min(64, Math.max(40, this.term.cols - 4));
    const horiz = '─'.repeat(width - 2);
    const inner = width - 4;
    const pad = (s: string) => {
      const visible = stripAnsi(s);
      const space = Math.max(0, inner - visible.length);
      return `│ ${s}${' '.repeat(space)} │`;
    };
    const blank = `│${' '.repeat(width - 2)}│`;

    this.print('');
    this.print(`${c.brightCyan}╭${horiz}╮${R}`);
    this.print(`${c.brightCyan}${pad(`${B}${title}${R}${c.brightCyan}`)}${R}`);
    this.print(`${c.brightCyan}├${horiz}┤${R}`);
    for (const line of body) {
      this.print(`${c.brightCyan}${pad(`${ansi.dim}${line}${R}${c.brightCyan}`)}${R}`);
    }
    this.print(`${c.brightCyan}${blank}${R}`);
    options.forEach((opt, i) => {
      const num = `${c.brightYellow}${B}[${i + 1}]${R}`;
      this.print(`${c.brightCyan}${pad(`  ${num} ${opt}${c.brightCyan}`)}${R}`);
    });
    this.print(`${c.brightCyan}${blank}${R}`);
    this.print(`${c.brightCyan}${pad(`${ansi.dim}press 1–${options.length} to choose${R}${c.brightCyan}`)}${R}`);
    this.print(`${c.brightCyan}╰${horiz}╯${R}`);
    this.print('');

    this.modalCount = options.length;
    return new Promise(resolve => {
      this.modalResolve = resolve;
    });
  }
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}

function longestCommonPrefix(strs: string[]): string {
  if (strs.length === 0) return '';
  let prefix = strs[0];
  for (const s of strs) {
    while (!s.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}

function abbreviateCwd(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(HOME + '/')) return '~' + p.slice(HOME.length);
  return p;
}
