export type CommandContext = {
  args: string[];
  raw: string;
  print: (line: string) => void;
  printRaw: (text: string) => void;
  clear: () => void;
  run: (commandLine: string) => Promise<void>;
  getHistory: () => string[];
  setTheme: (name: string) => boolean;
  listThemes: () => string[];
  signal: AbortSignal;
};

export type Command = {
  name: string;
  description: string;
  usage?: string;
  hidden?: boolean;
  handler: (ctx: CommandContext) => void | string | Promise<void | string>;
};

export type Theme = {
  name: string;
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
};

// Chrome built-in Prompt API (window.LanguageModel) — typed loosely since the API is evolving.
declare global {
  interface LanguageModelMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
  }

  interface LanguageModelCreateOptions {
    initialPrompts?: LanguageModelMessage[];
    temperature?: number;
    topK?: number;
    monitor?: (m: EventTarget) => void;
    signal?: AbortSignal;
    expectedInputs?: Array<{ type: string; languages?: string[] }>;
    expectedOutputs?: Array<{ type: string; languages?: string[] }>;
  }

  interface LanguageModelPromptOptions {
    signal?: AbortSignal;
    responseConstraint?: unknown;
  }

  interface LanguageModelSession {
    prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
    promptStreaming(input: string, options?: LanguageModelPromptOptions): ReadableStream<string>;
    destroy(): void;
    clone(): Promise<LanguageModelSession>;
  }

  interface LanguageModelStatic {
    availability(options?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
    create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
    params?: () => Promise<unknown>;
  }

  interface Window {
    LanguageModel?: LanguageModelStatic;
  }

  const LanguageModel: LanguageModelStatic | undefined;
}
