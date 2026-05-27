import type { TerminalUI } from './terminal.js';
import { listAllCommands } from './commands.js';
import { ansi } from './banner.js';

const c = ansi.fg;
const R = ansi.reset;
const D = ansi.dim;

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
  done: boolean;
};

function buildSystemPrompt(): string {
  const cmds = listAllCommands()
    .filter(c => !c.hidden && c.name !== 'ai')
    .map(c => `- ${c.name}: ${c.description}`)
    .join('\n');
  return `You are the AI guide on Lee Salminen's terminal portfolio website at leesalminen.com.
Your job: help visitors explore the site by running its built-in terminal commands and explaining the results in a warm, concise voice.

Lee is a father, husband, technologist, and entrepreneur. He works on Bitcoin, Lightning, the open web, and on-device AI. He has lived in Buffalo NY, NYC, Boulder CO, LA, and Costa Rica.

You control a real terminal. Every turn you respond with JSON:
{
  "thought": "private planning note",
  "commands": ["<command line>", ...],
  "reply": "what you say to the visitor",
  "done": true|false
}

Rules:
- Use the AVAILABLE COMMANDS below — they are your tools. Do not invent commands.
- If you run commands, set done=false. You will then see their output and respond again. After you have the info you need, respond with done=true and an empty commands array.
- Keep "reply" short (1–3 sentences) and friendly. The user already sees the command output in the terminal — do not repeat it verbatim, just briefly comment.
- Never claim to be Lee. You are an assistant guiding visitors through Lee's portfolio.
- If a question is off-topic, gently redirect to what the portfolio can show.
- Do not run "clear" or "exit" unless the visitor explicitly asks.

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

      if (availability === 'downloadable' || availability === 'downloading') {
        this.status = availability;
        this.ui.printSystem(`Downloading on-device model... this happens once.`);
        this.session = await window.LanguageModel.create({
          initialPrompts: [{ role: 'system', content: buildSystemPrompt() }],
          temperature: 0.6,
          topK: 3,
          monitor: (m) => {
            m.addEventListener('downloadprogress', ((ev: Event) => {
              const e = ev as Event & { loaded: number };
              const pct = Math.round((e.loaded ?? 0) * 100);
              this.ui.printSystem(`  model download: ${pct}%`);
            }) as EventListener);
          },
        });
      } else {
        this.session = await window.LanguageModel.create({
          initialPrompts: [{ role: 'system', content: buildSystemPrompt() }],
          temperature: 0.6,
          topK: 3,
        });
      }

      this.status = 'ready';
      return { status: 'ready' };
    } catch (err) {
      this.status = 'unavailable';
      return { status: 'unavailable', message: (err as Error).message };
    }
  }

  async ask(userMessage: string, signal: AbortSignal): Promise<void> {
    if (!this.session) {
      this.ui.print(`${c.red}agent: not initialized${R}`);
      return;
    }

    let input = userMessage;
    for (let turn = 0; turn < this.maxTurns; turn++) {
      if (signal.aborted) return;
      let raw: string;
      try {
        raw = await this.session.prompt(input, {
          signal,
          responseConstraint: RESPONSE_SCHEMA,
        });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        // Fallback path: some Chrome versions error on responseConstraint. Retry without it.
        try {
          raw = await this.session.prompt(
            input +
              `\n\nRespond ONLY with valid JSON matching: {"thought":string,"commands":string[],"reply":string,"done":boolean}`,
            { signal },
          );
        } catch (err2) {
          if ((err2 as Error).name === 'AbortError') return;
          this.ui.print(`${c.red}agent error: ${(err2 as Error).message}${R}`);
          return;
        }
      }

      const parsed = parseTurn(raw);
      if (!parsed) {
        this.ui.print(`${c.red}agent: could not parse response${R}`);
        this.ui.printSystem(raw.slice(0, 200));
        return;
      }

      const observations: string[] = [];
      for (const cmd of parsed.commands.slice(0, 4)) {
        if (signal.aborted) return;
        if (!cmd.trim()) continue;
        // Skip destructive / meta commands when the user didn't ask for them.
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
        // Echo the captured output to the visible terminal so visitors see real command output.
        if (output) {
          for (const line of output.split(/\r?\n/)) {
            this.ui.print(`    ${D}│${R} ${line}`);
          }
        }
        observations.push(`$ ${cmd}\n${output}`);
      }

      if (parsed.reply.trim()) {
        this.ui.printAgentSay(parsed.reply.trim());
      }

      if (parsed.done || parsed.commands.length === 0) {
        return;
      }

      input = `Command results:\n${observations.join('\n\n')}\n\nContinue. Set done=true if the visitor's question is answered.`;
    }

    this.ui.printSystem(`(agent: reached max turns)`);
  }
}

function parseTurn(raw: string): AgentTurn | null {
  // Try a direct JSON parse first.
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

  // Pull the first {...} block out of fenced code or surrounding prose.
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
