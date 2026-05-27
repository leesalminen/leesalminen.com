import type { Command, CommandContext } from './types.js';
import { ansi, banner } from './banner.js';
import { renderMarkdown } from './render/md.js';
import { abbreviate, resolvePath } from './fs.js';
import type { FsNode } from './fs.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;
const D = ansi.dim;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

const FORTUNES = [
  'The best time to plant a tree was 20 years ago. The second best time is now.',
  'A ship in harbor is safe — but that is not what ships are built for.',
  '“We are what we repeatedly do. Excellence, then, is not an act, but a habit.” — Aristotle',
  'Make it work. Make it right. Make it fast. — Kent Beck',
  'You can do anything, but not everything.',
  'Premature optimization is the root of all evil. — Knuth',
  'The mountains are calling and I must go. — John Muir',
  'Pura vida 🌴',
  'Stay hungry, stay foolish.',
  'Talk is cheap. Show me the code. — Linus Torvalds',
];

const SOCIALS: Array<{ label: string; value: string; url?: string }> = [
  { label: 'email', value: 'me@leesalminen.com', url: 'mailto:me@leesalminen.com' },
  { label: 'github', value: 'github.com/leesalminen', url: 'https://github.com/leesalminen' },
  { label: 'nostr', value: 'npub: 5f498ff8…643f3cacc' },
  { label: 'site', value: 'leesalminen.com', url: 'https://leesalminen.com' },
];

function table(rows: string[][], pad = 2): string {
  if (rows.length === 0) return '';
  const cols = rows[0].length;
  const widths = new Array(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      widths[i] = Math.max(widths[i], stripAnsi(row[i] ?? '').length);
    }
  }
  return rows
    .map(row =>
      row
        .map((cell, i) => {
          const visible = stripAnsi(cell ?? '').length;
          const padding = ' '.repeat(Math.max(0, widths[i] - visible + pad));
          return (cell ?? '') + padding;
        })
        .join('')
        .trimEnd(),
    )
    .join('\r\n');
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\]8;;[^\x07]*\x07/g, '');
}

// ---------- FS HELPERS ----------

function nodeIsDir(n: FsNode): n is { type: 'dir'; children: Record<string, FsNode> } {
  return n.type === 'dir';
}

function nodeKind(n: FsNode): string {
  if (n.type === 'dir') return 'dir';
  if (n.type === 'demo') return 'demo';
  return 'file';
}

function colorEntry(name: string, n: FsNode): string {
  if (n.type === 'dir') return `${c.brightCyan}${name}/${R}`;
  if (n.type === 'demo') return `${c.brightGreen}${name}*${R}`;
  return `${c.white}${name}${R}`;
}

// Resolve a name relative to cwd. Defaults to the FS shortcut: bare names like
// "about" map to ~/about.md so the user can still type `cat about` like before.
function shortcutToPath(ctx: CommandContext, name: string): string {
  // Try the literal path first.
  const direct = resolvePath(ctx.cwd, name);
  if (ctx.fs.get(direct)) return direct;
  // Try ~/<name>.md (e.g. `cat about`).
  const md = resolvePath(ctx.cwd, `~/${name}.md`);
  if (ctx.fs.get(md)) return md;
  return direct;
}

// ---------- COMMANDS ----------

const commands: Command[] = [
  {
    name: 'help',
    description: 'list available commands',
    handler: (ctx) => {
      const all = listAllCommands().filter(cmd => !cmd.hidden);
      const rows = all.map(cmd => [
        `  ${c.brightYellow}${cmd.name}${R}`,
        `${D}${cmd.description}${R}`,
      ]);
      ctx.print(`${B}Commands${R}`);
      ctx.print(table(rows));
      ctx.print('');
      ctx.print(`${D}Tip: try ${B}tree${R}${D}, then ${B}cat projects/readme.md${R}${D}, then ${B}run projects/bitcoin-jungle/demo${R}${D}.${R}`);
      ctx.print(`${D}Pipes work: ${B}find bitcoin | head 3${R}${D}.${R}`);
    },
  },
  {
    name: 'pwd',
    description: 'print working directory',
    handler: (ctx) => ctx.cwd,
  },
  {
    name: 'cd',
    description: 'change working directory',
    usage: 'cd <path>',
    handler: (ctx) => {
      const arg = ctx.args[0] ?? '~';
      const abs = resolvePath(ctx.cwd, arg);
      const node = ctx.fs.get(abs);
      if (!node) return `${c.red}cd: no such directory: ${arg}${R}`;
      if (node.type !== 'dir') return `${c.red}cd: not a directory: ${arg}${R}`;
      ctx.setCwd(abs);
    },
  },
  {
    name: 'ls',
    description: 'list directory contents',
    usage: 'ls [path]',
    handler: (ctx) => {
      const arg = ctx.args[0] ?? '.';
      const abs = resolvePath(ctx.cwd, arg);
      const node = ctx.fs.get(abs);
      if (!node) return `${c.red}ls: ${arg}: no such file or directory${R}`;
      if (node.type !== 'dir') {
        return colorEntry(arg.split('/').pop() ?? arg, node);
      }
      const entries = ctx.fs.list(abs) ?? [];
      if (entries.length === 0) return `${D}(empty)${R}`;
      return entries.map(e => colorEntry(e.name, e.node)).join('  ');
    },
  },
  {
    name: 'tree',
    description: 'recursive directory listing',
    usage: 'tree [path]',
    handler: (ctx) => {
      const arg = ctx.args[0] ?? '.';
      const abs = resolvePath(ctx.cwd, arg);
      const node = ctx.fs.get(abs);
      if (!node) return `${c.red}tree: ${arg}: no such directory${R}`;
      const lines: string[] = [];
      lines.push(`${c.brightCyan}${abbreviate(abs)}${R}`);
      if (node.type === 'dir') {
        renderTree(node, '', lines);
      }
      return lines.join('\r\n');
    },
  },
  {
    name: 'cat',
    description: 'show the contents of a file',
    usage: 'cat <path>',
    handler: (ctx) => {
      const arg = ctx.args[0];
      if (!arg) return `${c.red}cat: missing path${R}`;
      const abs = shortcutToPath(ctx, arg);
      const node = ctx.fs.get(abs);
      if (!node) return `${c.red}cat: ${arg}: no such file${R}`;
      if (node.type === 'dir') return `${c.red}cat: ${arg}: is a directory${R}`;
      if (node.type === 'demo') return `${D}cat: ${arg}: this is a runnable demo. Try ${B}run ${arg}${R}${D}.${R}`;
      if (node.mime === 'text/markdown') return renderMarkdown(node.content);
      return node.content;
    },
  },
  {
    name: 'find',
    description: 'search files by name or content',
    usage: 'find <query>',
    handler: (ctx) => {
      const q = (ctx.args.join(' ') || '').trim().toLowerCase();
      if (!q) return `${c.red}find: missing query${R}`;
      const hits: string[] = [];
      for (const { path, node } of ctx.fs.walk('/home/lee')) {
        if (node.type === 'dir') continue;
        const nameMatch = path.toLowerCase().includes(q);
        const contentMatch = node.type === 'file' && node.content.toLowerCase().includes(q);
        if (nameMatch || contentMatch) {
          const kind = node.type === 'demo' ? `${c.brightGreen}[demo]${R}` : `${c.brightCyan}[file]${R}`;
          hits.push(`${kind} ${abbreviate(path)}`);
        }
      }
      if (hits.length === 0) return `${D}no matches for "${q}"${R}`;
      return hits.join('\r\n');
    },
  },
  {
    name: 'run',
    description: 'run a demo (look for *-marked entries in tree)',
    usage: 'run <demo-path>',
    handler: async (ctx) => {
      const arg = ctx.args[0];
      if (!arg) {
        return `${c.red}run: missing path${R}  ${D}try: run projects/bitcoin-jungle/demo${R}`;
      }
      const abs = shortcutToPath(ctx, arg);
      const node = ctx.fs.get(abs);
      if (!node) {
        ctx.print(`${c.red}run: ${arg}: not found${R}`);
        return;
      }
      if (node.type !== 'demo') {
        ctx.print(`${c.red}run: ${arg}: not a demo (it's a ${nodeKind(node)})${R}`);
        return;
      }
      try {
        const mod = await node.load();
        await mod.run({ ...ctx, args: ctx.args.slice(1), raw: ctx.args.slice(1).join(' ') });
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          ctx.print(`${D}^C${R}`);
          return;
        }
        ctx.print(`${c.red}demo error: ${(err as Error).message}${R}`);
      }
    },
  },
  // ---- pipe filters ----
  {
    name: 'grep',
    description: 'filter lines matching a pattern',
    usage: 'grep <pattern>',
    handler: (ctx) => {
      const input = ctx.pipedInput ?? '';
      const q = ctx.args.join(' ');
      if (!q) return `${c.red}grep: missing pattern${R}`;
      const re = new RegExp(q, 'i');
      return input
        .split(/\r?\n/)
        .filter(line => re.test(stripAnsi(line)))
        .join('\r\n');
    },
  },
  {
    name: 'head',
    description: 'first N lines of input',
    usage: 'head [N]',
    handler: (ctx) => {
      const n = Math.max(1, parseInt(ctx.args[0] ?? '10', 10));
      const input = ctx.pipedInput ?? '';
      return input.split(/\r?\n/).slice(0, n).join('\r\n');
    },
  },
  {
    name: 'tail',
    description: 'last N lines of input',
    usage: 'tail [N]',
    handler: (ctx) => {
      const n = Math.max(1, parseInt(ctx.args[0] ?? '10', 10));
      const input = ctx.pipedInput ?? '';
      const lines = input.split(/\r?\n/);
      return lines.slice(Math.max(0, lines.length - n)).join('\r\n');
    },
  },
  {
    name: 'wc',
    description: 'count lines, words, chars of input',
    handler: (ctx) => {
      const input = ctx.pipedInput ?? '';
      const lines = input.split(/\r?\n/).length;
      const words = input.split(/\s+/).filter(Boolean).length;
      const chars = stripAnsi(input).length;
      return `  ${lines} lines  ${words} words  ${chars} chars`;
    },
  },
  // ---- top-level info shortcuts (each delegates to cat) ----
  {
    name: 'about',
    description: 'short bio',
    handler: (ctx) => renderFile(ctx, '~/about.md'),
  },
  {
    name: 'whoami',
    description: 'what is the meaning of life?',
    handler: () => `${B}${c.brightMagenta}42${R}`,
  },
  {
    name: 'contact',
    description: 'how to reach me',
    handler: (ctx) => renderFile(ctx, '~/contact.md'),
  },
  {
    name: 'email',
    description: 'shortcut: my email',
    handler: () => `${c.cyan}me@leesalminen.com${R}  ${D}— I read everything.${R}`,
  },
  {
    name: 'projects',
    description: 'things I have built',
    handler: (ctx) => renderFile(ctx, '~/projects/readme.md'),
  },
  {
    name: 'skills',
    description: 'what I work with',
    handler: (ctx) => renderFile(ctx, '~/skills.md'),
  },
  {
    name: 'locations',
    description: 'places I have called home',
    handler: (ctx) => renderFile(ctx, '~/locations.md'),
  },
  {
    name: 'now',
    description: 'what I am up to right now',
    handler: (ctx) => renderFile(ctx, '~/now.md'),
  },
  {
    name: 'interests',
    description: 'things I think about',
    handler: (ctx) => renderFile(ctx, '~/interests.md'),
  },
  {
    name: 'family',
    description: 'the people I love',
    handler: (ctx) => renderFile(ctx, '~/family.md'),
  },
  {
    name: 'writing',
    description: 'short pieces I have written',
    handler: (ctx) => renderFile(ctx, '~/writing/readme.md'),
  },
  // ---- fun + system ----
  {
    name: 'banner',
    description: 'show the welcome banner again',
    handler: () => banner(),
  },
  {
    name: 'theme',
    description: 'switch color theme (try: theme list)',
    usage: 'theme <name>',
    handler: (ctx) => {
      const arg = ctx.args[0];
      if (!arg || arg === 'list') {
        const themes = ctx.listThemes();
        return [
          `${B}Available themes:${R}`,
          ...themes.map(t => `  ${c.brightYellow}${t}${R}`),
          ``,
          `${D}Usage: theme <name>${R}`,
        ].join('\r\n');
      }
      const ok = ctx.setTheme(arg);
      return ok ? `${c.green}✓ theme: ${arg}${R}` : `${c.red}unknown theme: ${arg}${R}`;
    },
  },
  {
    name: 'date',
    description: 'show the current date and time',
    handler: () => new Date().toString(),
  },
  {
    name: 'echo',
    description: 'echo arguments',
    usage: 'echo <text>',
    handler: (ctx) => ctx.args.join(' '),
  },
  {
    name: 'history',
    description: 'show command history',
    handler: (ctx) => {
      const h = ctx.getHistory();
      if (h.length === 0) return `${D}(no history yet)${R}`;
      return h.map((line, i) => `  ${D}${String(i + 1).padStart(3)}${R}  ${line}`).join('\r\n');
    },
  },
  {
    name: 'clear',
    description: 'clear the screen',
    handler: (ctx) => {
      ctx.clear();
    },
  },
  {
    name: 'cowsay',
    description: 'consult the cow oracle',
    usage: 'cowsay <text>',
    handler: (ctx) => {
      const text = ctx.args.join(' ') || 'moo.';
      const top = ' ' + '_'.repeat(text.length + 2);
      const bottom = ' ' + '-'.repeat(text.length + 2);
      return [
        top,
        `< ${text} >`,
        bottom,
        `        \\   ^__^`,
        `         \\  (oo)\\_______`,
        `            (__)\\       )\\/\\`,
        `                ||----w |`,
        `                ||     ||`,
      ].join('\r\n');
    },
  },
  {
    name: 'fortune',
    description: 'a random thought for the day',
    handler: () => `${c.brightYellow}❝${R} ${FORTUNES[Math.floor(Math.random() * FORTUNES.length)]} ${c.brightYellow}❞${R}`,
  },
  {
    name: 'coffee',
    description: 'always.',
    handler: () =>
      [
        `      ( (`,
        `       ) )`,
        `    ........`,
        `    |      |]   ${c.brightYellow}fresh coffee, always.${R}`,
        `    \\      /`,
        `     \`----'`,
      ].join('\r\n'),
  },
  {
    name: 'sudo',
    description: 'try it',
    handler: (ctx) => {
      const cmd = ctx.args.join(' ') || '...';
      return `${c.red}${cmd}: Permission denied${R} ${D}(nice try)${R}`;
    },
  },
  {
    name: 'vim',
    description: 'leave the editor',
    handler: () => `${D}vim: I'm not falling for that. Try ${B}:q!${R}${D} like a real person.${R}`,
  },
  {
    name: 'emacs',
    description: 'the other one',
    handler: () => `${D}emacs is a great operating system — lacking only a decent editor.${R}`,
  },
  {
    name: 'rm',
    description: 'be careful',
    usage: 'rm <path>',
    handler: (ctx) => {
      const arg = ctx.args.join(' ');
      if (arg.includes('-rf') && (arg.includes('/') || arg.includes('*'))) {
        return `${c.red}nope.${R} ${D}I like this filesystem the way it is.${R}`;
      }
      return `${D}rm: refusing — this filesystem is read-only by design.${R}`;
    },
  },
  {
    name: 'neofetch',
    description: 'system info, terminal-style',
    handler: () => {
      const ua = navigator.userAgent;
      const browser = ua.match(/(Chrome|Firefox|Safari|Edg)\/[\d.]+/)?.[0] ?? 'Browser';
      const platform = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? 'Web';
      const cores = navigator.hardwareConcurrency ?? '?';
      const lang = navigator.language;
      const ai = typeof window.LanguageModel !== 'undefined' ? `${c.brightGreen}✓ on-device${R}` : `${D}not available${R}`;
      const leftRaw = [
        '    ████  ████  ',
        '  ████      ████',
        ' ████        ████',
        '████   LEE    ████',
        ' ████        ████',
        '  ████      ████',
        '    ████  ████  ',
      ];
      const colWidth = 22;
      const left = leftRaw.map(s => `${c.brightCyan}${s}${R}` + ' '.repeat(Math.max(0, colWidth - s.length)));
      const right = [
        `${B}${c.brightYellow}guest@leesalminen${R}`,
        `${'─'.repeat(20)}`,
        `${c.brightYellow}OS${R}:        ${platform}`,
        `${c.brightYellow}Browser${R}:   ${browser}`,
        `${c.brightYellow}CPU cores${R}: ${cores}`,
        `${c.brightYellow}Locale${R}:    ${lang}`,
        `${c.brightYellow}Terminal${R}:  xterm.js`,
        `${c.brightYellow}AI guide${R}:  ${ai}`,
      ];
      const lines: string[] = [];
      const maxLen = Math.max(left.length, right.length);
      for (let i = 0; i < maxLen; i++) {
        const l = left[i] ?? ' '.repeat(colWidth);
        lines.push(`${l}  ${right[i] ?? ''}`);
      }
      return lines.join('\r\n');
    },
  },
  {
    name: 'weather',
    description: 'always sunny in the terminal',
    handler: () =>
      [
        `   \\   /     `,
        `    .-.      ${c.brightYellow}${B}Sunny${R}, always.`,
        ` ― (   ) ―   ${D}Temperature: green-on-black${R}`,
        `    \`-'      ${D}Visibility: infinite${R}`,
        `   /   \\     `,
      ].join('\r\n'),
  },
  {
    name: 'matrix',
    description: 'follow the white rabbit',
    handler: async (ctx) => {
      const cols = 60;
      const charset = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ';
      const rows = 18;
      for (let r = 0; r < rows; r++) {
        if (ctx.signal.aborted) return;
        let line = '';
        for (let i = 0; i < cols; i++) {
          line += `${c.brightGreen}${charset[Math.floor(Math.random() * charset.length)]}${R}`;
        }
        ctx.print(line);
        try {
          await sleep(40, ctx.signal);
        } catch {
          return;
        }
      }
      ctx.print(`${c.brightGreen}${B}wake up...${R}`);
    },
  },
  {
    name: 'man',
    description: 'manual page for a command',
    usage: 'man <command>',
    handler: (ctx) => {
      const name = ctx.args[0];
      if (!name) return `${c.red}what manual page do you want?${R}`;
      const cmd = listAllCommands().find(x => x.name === name);
      if (!cmd) return `${c.red}No manual entry for ${name}${R}`;
      const lines = [
        `${B}NAME${R}`,
        `  ${cmd.name} — ${cmd.description}`,
        ``,
        `${B}USAGE${R}`,
        `  ${cmd.usage ?? cmd.name}`,
      ];
      return lines.join('\r\n');
    },
  },
  {
    name: 'ai',
    description: 'toggle the on-device AI guide  (ai voice / ai forget)',
    handler: () => {
      // The runtime intercepts this — see main.ts.
      return `${D}(handled by the runtime)${R}`;
    },
  },
  {
    name: 'exit',
    description: 'leave the terminal',
    handler: () => `${D}You can check out any time you like, but you can never leave.${R}`,
  },
  {
    name: 'logout',
    description: 'see: exit',
    hidden: true,
    handler: () => `${D}nope.${R}`,
  },
  {
    name: 'open',
    description: 'open a link in a new tab',
    usage: 'open <github|email|site|nostr>',
    handler: (ctx) => {
      const key = (ctx.args[0] ?? '').toLowerCase();
      const social = SOCIALS.find(s => s.label === key);
      if (!social || !social.url) return `${c.red}don't know how to open '${key}'. try: github, email, site${R}`;
      window.open(social.url, '_blank', 'noopener');
      return `${c.green}↗  opened ${social.url}${R}`;
    },
  },
];

function renderTree(node: { type: 'dir'; children: Record<string, FsNode> }, prefix: string, out: string[]): void {
  const entries = Object.entries(node.children);
  entries.forEach(([name, child], i) => {
    const last = i === entries.length - 1;
    const branch = last ? '└── ' : '├── ';
    out.push(`${D}${prefix}${branch}${R}${colorEntry(name, child)}`);
    if (nodeIsDir(child)) {
      renderTree(child, prefix + (last ? '    ' : '│   '), out);
    }
  });
}

function renderFile(ctx: CommandContext, relPath: string): string {
  const abs = resolvePath(ctx.cwd, relPath);
  const node = ctx.fs.get(abs);
  if (!node || node.type !== 'file') return `${c.red}missing: ${relPath}${R}`;
  return renderMarkdown(node.content);
}

let registry: Map<string, Command> | null = null;

function buildRegistry(): Map<string, Command> {
  const map = new Map<string, Command>();
  for (const cmd of commands) map.set(cmd.name, cmd);
  return map;
}

export function getCommand(name: string): Command | undefined {
  if (!registry) registry = buildRegistry();
  return registry.get(name);
}

export function listAllCommands(): Command[] {
  return commands.slice();
}

export function listCommandNames(includeHidden = false): string[] {
  return commands.filter(c => includeHidden || !c.hidden).map(c => c.name);
}

// Split a line by unquoted | pipes.
export function splitPipes(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (ch === '|' && !inSingle && !inDouble) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

type RunOpts = Omit<CommandContext, 'args' | 'raw' | 'signal' | 'pipedInput'> & {
  signal: AbortSignal;
};

export async function runCommand(line: string, ctx: RunOpts, pipedInput?: string): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  const parts = trimmed.split(/\s+/);
  const name = parts[0];
  const args = parts.slice(1);
  const cmd = getCommand(name);
  if (!cmd) {
    ctx.print(`${c.red}command not found: ${name}${R}  ${D}(try ${B}help${R}${D})${R}`);
    return;
  }
  const fullCtx: CommandContext = { ...ctx, args, raw: trimmed, pipedInput };
  try {
    const result = await cmd.handler(fullCtx);
    if (typeof result === 'string' && result.length > 0) {
      ctx.print(result);
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      ctx.print(`${D}^C${R}`);
      return;
    }
    ctx.print(`${c.red}error: ${(err as Error).message}${R}`);
  }
}

// Run a full pipeline `cmd1 | cmd2 | cmd3`. All but the last segment run with
// a captured-output ctx; the last segment runs against the real ctx.
export async function runPipeline(line: string, ctx: RunOpts): Promise<void> {
  const segments = splitPipes(line);
  if (segments.length === 0) return;
  if (segments.length === 1) {
    await runCommand(segments[0], ctx);
    return;
  }
  let piped = '';
  for (let i = 0; i < segments.length - 1; i++) {
    const collected: string[] = [];
    const captureCtx: RunOpts = {
      ...ctx,
      print: (l: string) => collected.push(l),
      printRaw: (t: string) => collected.push(t),
    };
    await runCommand(segments[i], captureCtx, piped);
    piped = collected.map(stripAnsi).join('\n').replace(/\r\n/g, '\n').trim();
  }
  await runCommand(segments[segments.length - 1], ctx, piped);
}
