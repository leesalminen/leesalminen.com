import type { TerminalUI } from './terminal.js';
import { listAllCommands } from './commands.js';
import { ansi } from './banner.js';
import { Voice } from './voice.js';

const c = ansi.fg;
const R = ansi.reset;
const D = ansi.dim;

const MEMORY_KEY = 'lee-terminal-agent-memory';

// JSON schema the model must return on every turn.
const RESPONSE_SCHEMA = {
  type: 'object',
  required: ['thought', 'commands', 'reply', 'done'],
  additionalProperties: false,
  properties: {
    thought: {
      type: 'string',
      description: 'A short note to yourself about what to do next. Not shown to the user.',
    },
    commands: {
      type: 'array',
      maxItems: 4,
      items: { type: 'string' },
      description: 'Terminal commands to run, in order. Leave empty if no commands are needed.',
    },
    reply: {
      type: 'string',
      description: 'Your message to the visitor. Keep it concise and warm — like a friend giving a tour.',
    },
    memory: {
      type: 'string',
      description: 'Optional. A short note to remember about the visitor across sessions (e.g. "interested in Bitcoin Jungle, asked about Lightning fees"). Leave empty to not update memory.',
    },
    done: {
      type: 'boolean',
      description: 'true if this fully answers the visitor; false if you need to see command output and continue.',
    },
  },
} as const;

type AgentTurn = {
  thought: string;
  commands: string[];
  reply: string;
  memory?: string;
  done: boolean;
};

function loadMemory(): string {
  try {
    return localStorage.getItem(MEMORY_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveMemory(m: string): void {
  try {
    if (m.trim()) localStorage.setItem(MEMORY_KEY, m.trim().slice(0, 400));
  } catch { /* ignore */ }
}

function clearMemory(): void {
  try { localStorage.removeItem(MEMORY_KEY); } catch { /* ignore */ }
}

function buildSystemPrompt(): string {
  const cmds = listAllCommands()
    .filter(c => !c.hidden && c.name !== 'ai')
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n');

  const memory = loadMemory();
  const memoryBlock = memory
    ? `\nWHAT YOU REMEMBER ABOUT THIS VISITOR (from prior sessions):\n${memory}\n`
    : '';

  return `You are the AI guide on Lee Salminen's terminal portfolio website at leesalminen.com.
Your job: help visitors explore the site by running its built-in terminal commands and explaining the results in a warm, concise voice.

Lee is a father, husband, technologist, and entrepreneur. He works on Bitcoin, Lightning, the open web, and on-device AI. He has lived in Buffalo NY, NYC, Boulder CO, LA, and Costa Rica.

You control a real terminal with a virtual filesystem rooted at /home/lee.
Key layout:
  ~/about.md        ~/now.md         ~/skills.md
  ~/contact.md      ~/family.md      ~/locations.md     ~/interests.md
  ~/projects/       — readme.md + subdirs per project (each with a runnable demo)
    bitcoin-jungle/      readme.md + demo (live BTC price from Lee's own backend)
    lightning-invoice/   readme.md + demo (real Lightning tip-jar invoice for Lee)
    nostr-feed/          readme.md + demo (streams Lee's Nostr notes from a public relay)
    sql-playground/      readme.md + demo (DuckDB-wasm running client-side)
  ~/writing/        — short essays Lee has written

The most impressive parts of the site are the live demos under ~/projects/*/demo.
When a visitor asks about Lee's projects or Bitcoin work, consider \`cd\`-ing into
a project folder and running the demo — it shows real data, not just text.

Every turn you respond with JSON:
{
  "thought": "private planning note",
  "commands": ["<command line>", ...],
  "reply": "what you say to the visitor",
  "memory": "OPTIONAL — short note to remember across sessions",
  "done": true|false
}

Rules:
- Use the AVAILABLE COMMANDS below — they are your tools. Do not invent commands.
- Common patterns: \`tree\`, \`cat <path>\`, \`cd <path>\`, \`run <demo-path>\`, \`find <word>\`.
- Paths can be absolute (/home/lee/projects), home-relative (~/projects), or relative to cwd.
- If you run commands, set done=false. You will then see their output and respond again. After you have the info you need, respond with done=true and an empty commands array.
- Keep "reply" short (1–3 sentences) and friendly. The user already sees the command output in the terminal — do not repeat it verbatim, just briefly comment.
- Use "memory" sparingly — only when you learn something durable about the visitor (their interest area, what they're working on). Leave empty otherwise.
- Never claim to be Lee. You are an assistant guiding visitors through Lee's portfolio.
- If a question is off-topic, gently redirect to what the portfolio can show.
- Do not run "clear" or "exit" unless the visitor explicitly asks.
${memoryBlock}
AVAILABLE COMMANDS:
${cmds}
`;
}

export type AgentStatus = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'ready';

export type AgentInitResult = {
  status: AgentStatus;
  message?: string;
};

export class Agent {
  private session: LanguageModelSession | null = null;
  private ui: TerminalUI;
  private maxTurns = 4;
  private enabled = true;
  private status: AgentStatus = 'unsupported';
  private voice: Voice = new Voice();
  private voiceModeActive = false;
  private voiceLoopAbort: AbortController | null = null;

  constructor(ui: TerminalUI) {
    this.ui = ui;
  }

  isReady(): boolean {
    return this.enabled && this.session !== null && this.status === 'ready';
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  isVoiceSupported(): boolean {
    return this.voice.isSupported();
  }

  isVoiceActive(): boolean {
    return this.voiceModeActive;
  }

  forgetMemory(): void {
    clearMemory();
  }

  async init(): Promise<AgentInitResult> {
    if (typeof window === 'undefined' || typeof window.LanguageModel === 'undefined') {
      this.status = 'unsupported';
      return { status: 'unsupported' };
    }
    try {
      const availability = await window.LanguageModel.availability();
      if (availability === 'unavailable') {
        this.status = 'unavailable';
        return { status: 'unavailable' };
      }
      if (availability === 'available') {
        this.status = 'ready';
        this.session = await window.LanguageModel.create({
          initialPrompts: [{ role: 'system', content: buildSystemPrompt() }],
          temperature: 0.6,
          topK: 3,
          // Ask for image input support — Chrome ignores it on versions that
          // don't support multimodal yet.
          expectedInputs: [{ type: 'text' }, { type: 'image' }],
        });
        return { status: 'ready' };
      }
      this.status = availability;
      return { status: availability };
    } catch (err) {
      this.status = 'unavailable';
      return { status: 'unavailable', message: (err as Error).message };
    }
  }

  async load(): Promise<AgentInitResult> {
    if (typeof window === 'undefined' || typeof window.LanguageModel === 'undefined') {
      this.status = 'unsupported';
      return { status: 'unsupported' };
    }
    if (this.session) {
      this.status = 'ready';
      return { status: 'ready' };
    }
    try {
      this.session = await window.LanguageModel.create({
        initialPrompts: [{ role: 'system', content: buildSystemPrompt() }],
        temperature: 0.6,
        topK: 3,
        expectedInputs: [{ type: 'text' }, { type: 'image' }],
        monitor: (m) => {
          m.addEventListener('downloadprogress', ((ev: Event) => {
            const e = ev as Event & { loaded: number };
            const pct = Math.round((e.loaded ?? 0) * 100);
            this.ui.printSystem(`  model download: ${pct}%`);
          }) as EventListener);
        },
      });
      this.status = 'ready';
      return { status: 'ready' };
    } catch (err) {
      this.status = 'unavailable';
      return { status: 'unavailable', message: (err as Error).message };
    }
  }

  // Ask with optional image attachment. If an image is present, the request
  // is sent as a multimodal content array.
  async ask(userMessage: string, signal: AbortSignal, image?: Blob): Promise<string> {
    if (!this.session) {
      this.ui.print(`${c.red}agent: not initialized${R}`);
      return '';
    }

    let initialInput: string | LanguageModelContentPart[] | LanguageModelMessage[] = userMessage;
    if (image) {
      initialInput = [
        { type: 'text', value: userMessage || 'Take a look at this image and react.' },
        { type: 'image', value: image },
      ];
    }

    let nextInput: string | LanguageModelContentPart[] | LanguageModelMessage[] = initialInput;
    let lastReply = '';
    for (let turn = 0; turn < this.maxTurns; turn++) {
      if (signal.aborted) return lastReply;
      let raw: string;
      try {
        raw = await this.session.prompt(nextInput, {
          signal,
          responseConstraint: RESPONSE_SCHEMA,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return lastReply;
        // Retry without constraint.
        try {
          const fallbackText =
            (typeof nextInput === 'string' ? nextInput : '[multimodal input]') +
            `\n\nRespond ONLY with valid JSON matching: {"thought":string,"commands":string[],"reply":string,"memory":string,"done":boolean}`;
          raw = await this.session.prompt(fallbackText, { signal });
        } catch (err2) {
          if ((err2 as Error).name === 'AbortError') return lastReply;
          this.ui.print(`${c.red}agent error: ${(err2 as Error).message}${R}`);
          return lastReply;
        }
      }

      const parsed = parseTurn(raw);
      if (!parsed) {
        this.ui.print(`${c.red}agent: could not parse response${R}`);
        this.ui.printSystem(raw.slice(0, 200));
        return lastReply;
      }

      const observations: string[] = [];
      for (const cmd of parsed.commands.slice(0, 4)) {
        if (signal.aborted) return lastReply;
        if (!cmd.trim()) continue;
        const head = cmd.trim().split(/\s+/)[0];
        if (head === 'ai' || head === 'exit' || head === 'logout') {
          observations.push(`(skipped ${head})`);
          continue;
        }
        this.ui.printAgentDoing(`$ ${cmd}`);
        let output: string;
        try {
          output = await this.ui.runSilent(cmd);
        } catch (err) {
          output = `error: ${(err as Error).message}`;
        }
        if (output) {
          for (const line of output.split(/\r?\n/)) {
            this.ui.print(`    ${D}│${R} ${line}`);
          }
        }
        observations.push(`$ ${cmd}\n${output}`);
      }

      if (parsed.reply.trim()) {
        this.ui.printAgentSay(parsed.reply.trim());
        lastReply = parsed.reply.trim();
      }

      if (parsed.memory && parsed.memory.trim()) {
        saveMemory(parsed.memory);
      }

      if (parsed.done || parsed.commands.length === 0) {
        return lastReply;
      }

      nextInput = `Command results:\n${observations.join('\n\n')}\n\nContinue. Set done=true if the visitor's question is answered.`;
    }

    this.ui.printSystem(`(agent: reached max turns)`);
    return lastReply;
  }

  // ---- voice mode ----

  async startVoiceMode(): Promise<void> {
    if (this.voiceModeActive) return;
    if (!this.voice.isSupported()) {
      this.ui.print(`${c.red}voice mode unavailable — this browser doesn't support the Web Speech API.${R}`);
      return;
    }
    if (!this.isReady()) {
      this.ui.print(`${c.red}voice mode needs the AI guide enabled first. Try \`ai on\`.${R}`);
      return;
    }
    this.voiceModeActive = true;
    this.voiceLoopAbort = new AbortController();
    const signal = this.voiceLoopAbort.signal;

    this.ui.printSystem(`✦ voice mode on — speak; press Ctrl-C to stop.`);

    while (!signal.aborted) {
      this.ui.printSystem(`  🎤 listening…`);
      const { transcript, cancelled } = await this.voice.listenOnce(signal);
      if (cancelled || signal.aborted) break;
      if (!transcript) {
        this.ui.printSystem(`  (nothing heard, trying again)`);
        continue;
      }
      this.ui.print(`${c.brightGreen}you:${R} ${transcript}`);
      const reply = await this.ask(transcript, signal);
      if (reply) {
        await this.voice.speak(reply, signal);
      }
    }

    this.stopVoiceMode();
  }

  stopVoiceMode(): void {
    this.voiceModeActive = false;
    try { this.voiceLoopAbort?.abort(); } catch { /* ignore */ }
    this.voiceLoopAbort = null;
    this.voice.stop();
    this.ui.printSystem(`✦ voice mode off.`);
  }
}

function parseTurn(raw: string): AgentTurn | null {
  const tryParse = (s: string): AgentTurn | null => {
    try {
      const obj = JSON.parse(s);
      if (
        typeof obj === 'object' &&
        obj !== null &&
        typeof obj.reply === 'string' &&
        Array.isArray(obj.commands) &&
        typeof obj.done === 'boolean'
      ) {
        return {
          thought: typeof obj.thought === 'string' ? obj.thought : '',
          commands: obj.commands.filter((x: unknown): x is string => typeof x === 'string'),
          reply: obj.reply,
          memory: typeof obj.memory === 'string' ? obj.memory : '',
          done: obj.done,
        };
      }
    } catch {
      return null;
    }
    return null;
  };

  const direct = tryParse(raw.trim());
  if (direct) return direct;

  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    const inner = tryParse(fence[1].trim());
    if (inner) return inner;
  }
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = raw.slice(first, last + 1);
    const parsed = tryParse(slice);
    if (parsed) return parsed;
  }
  return null;
}
