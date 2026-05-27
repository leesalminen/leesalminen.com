import type { Command, CommandContext } from './types.js';
import { ansi, banner } from './banner.js';

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

const PROJECTS: Array<{ name: string; tag: string; blurb: string }> = [
  {
    name: 'Bitcoin Jungle',
    tag: 'open source · circular economy',
    blurb: 'A Bitcoin community + Lightning wallet in southern Costa Rica.',
  },
  {
    name: 'Galoy / Blink contributions',
    tag: 'lightning · open source',
    blurb: 'Patches and integrations for the open-source Bitcoin banking stack.',
  },
  {
    name: 'leesalminen.com',
    tag: 'this site',
    blurb: 'An agentic terminal portfolio. The Prompt API guides you through it.',
  },
];

const SKILLS: Record<string, string[]> = {
  Languages: ['TypeScript', 'JavaScript', 'Go', 'Rust', 'Python', 'Bash'],
  Frontend: ['React', 'Vite', 'Svelte', 'Web Components', 'xterm.js'],
  Backend: ['Node.js', 'Postgres', 'Redis', 'GraphQL', 'gRPC'],
  Bitcoin: ['Lightning', 'LNURL', 'NWC', 'Liquid', 'Nostr'],
  Infra: ['Docker', 'Kubernetes', 'NixOS', 'Cloudflare', 'Linux'],
  AI: ['On-device LLMs', 'Tool use / agents', 'Prompt API', 'RAG'],
};

const LOCATIONS = [
  ['🗽 Buffalo, NY', 'Where it began.'],
  ['🗽 New York City, NY', 'Where it sped up.'],
  ['🏔  Boulder, CO', 'Where it leveled up.'],
  ['🌴 Los Angeles, CA', 'Where it stretched out.'],
  ['🌊 Dominical, Costa Rica', 'Pura vida.'],
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
  return s.replace(/\x1b\[[0-9;]*m/g, '');
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
      ctx.print(`${D}Tip: pipe nothing, escape nothing. Just type a command and hit ↵.${R}`);
    },
  },
  {
    name: 'about',
    description: 'short bio',
    handler: () =>
      [
        `Hi, I'm ${B}${c.brightGreen}Lee Salminen${R} — father, husband, technologist, entrepreneur.`,
        ``,
        `I build software, mostly around Bitcoin, Lightning, and the open web.`,
        `I've lived in Buffalo, NYC, Boulder, LA, and Costa Rica.`,
        ``,
        `Try ${B}projects${R}, ${B}skills${R}, ${B}locations${R}, or ${B}contact${R} for more.`,
      ].join('\r\n'),
  },
  {
    name: 'whoami',
    description: 'what is the meaning of life?',
    handler: () => `${B}${c.brightMagenta}42${R}`,
  },
  {
    name: 'contact',
    description: 'how to reach me',
    handler: () => {
      const rows = SOCIALS.map(s => [
        `  ${c.brightYellow}${s.label}${R}`,
        s.url ? `${c.cyan}${s.url}${R}` : s.value,
      ]);
      return table(rows);
    },
  },
  {
    name: 'email',
    description: 'shortcut: my email',
    handler: () => `${c.cyan}me@leesalminen.com${R}  ${D}— I read everything.${R}`,
  },
  {
    name: 'projects',
    description: 'things I have built',
    handler: () => {
      const lines: string[] = [];
      for (const p of PROJECTS) {
        lines.push(`${B}${c.brightCyan}${p.name}${R} ${D}— ${p.tag}${R}`);
        lines.push(`  ${p.blurb}`);
        lines.push('');
      }
      return lines.join('\r\n').trimEnd();
    },
  },
  {
    name: 'skills',
    description: 'what I work with',
    handler: () => {
      const lines: string[] = [];
      for (const [category, items] of Object.entries(SKILLS)) {
        lines.push(`${B}${c.brightYellow}${category}${R}`);
        lines.push(`  ${items.map(i => `${c.green}${i}${R}`).join(`${D} · ${R}`)}`);
      }
      return lines.join('\r\n');
    },
  },
  {
    name: 'locations',
    description: 'places I have called home',
    handler: () => LOCATIONS.map(([place, blurb]) => `  ${B}${place}${R}  ${D}${blurb}${R}`).join('\r\n'),
  },
  {
    name: 'now',
    description: 'what I am up to right now',
    handler: () =>
      [
        `${B}Currently${R}:`,
        `  • Building open-source things around Bitcoin & Lightning`,
        `  • Tinkering with on-device AI agents (you're using one)`,
        `  • Raising kids, climbing mountains, riding waves`,
      ].join('\r\n'),
  },
  {
    name: 'interests',
    description: 'things I think about',
    handler: () =>
      [
        '⚡ Bitcoin, Lightning, sound money',
        '🌐 The open web, Nostr, freedom tech',
        '🤖 On-device AI, agents, the offline-first future',
        '🏔  Mountains, surf, the outdoors',
        '👨‍👩‍👦 Family',
      ]
        .map(x => '  ' + x)
        .join('\r\n'),
  },
  {
    name: 'family',
    description: 'the people I love',
    handler: () =>
      [
        `  ${c.brightMagenta}❤  Nikki${R}  ${D}— wife, partner-in-crime${R}`,
        `  ${c.brightCyan}🧒 Parker${R} ${D}— son, future captain${R}`,
        `  ${c.brightGreen}🐾 ...${R}     ${D}— the rest is offline${R}`,
      ].join('\r\n'),
  },
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
    name: 'ls',
    description: 'list the imaginary filesystem',
    handler: (ctx) => {
      const dirs: Record<string, string[]> = {
        '/': ['home', 'projects', 'about.txt'],
        '/home': ['lee', 'nikki', 'parker'],
        '/home/lee': ['README', 'todo.md', '.secrets'],
        '/projects': PROJECTS.map(p => p.name.toLowerCase().replace(/\s+/g, '-')),
      };
      const path = ctx.args[0] || '/';
      const entries = dirs[path];
      if (!entries) return `${c.red}ls: ${path}: no such directory${R}`;
      return entries.map(e => (e.endsWith('.txt') || e.endsWith('.md') ? e : `${c.brightCyan}${e}${R}`)).join('  ');
    },
  },
  {
    name: 'cat',
    description: 'read a fake file',
    usage: 'cat <path>',
    handler: (ctx) => {
      const path = ctx.args[0] || '';
      const files: Record<string, string> = {
        '/about.txt': `Lee Salminen — father, husband, technologist, entrepreneur.\nSee 'about' for more.`,
        '/home/lee/README': `42`,
        '/home/lee/todo.md':
          `- [x] make a terminal portfolio\r\n- [x] add fun commands\r\n- [x] wire up an on-device AI agent\r\n- [ ] add more easter eggs`,
        '/home/lee/.secrets': `${c.red}Permission denied.${R}`,
        '/home/nikki/README': `hi 💚`,
        '/home/parker/README': `yo`,
      };
      const body = files[path];
      if (body === undefined) return `${c.red}cat: ${path}: no such file${R}`;
      return body;
    },
  },
  {
    name: 'pwd',
    description: 'print working directory',
    handler: () => '/home/lee',
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
    description: 'toggle the on-device AI guide',
    handler: () => {
      // The runtime intercepts this — see main.ts. Stub here just for help/listing.
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

export async function runCommand(line: string, ctx: Omit<CommandContext, 'args' | 'raw' | 'signal'> & { signal: AbortSignal }): Promise<void> {
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
  const fullCtx: CommandContext = { ...ctx, args, raw: trimmed };
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
