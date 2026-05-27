import './styles.css';
import { TerminalUI } from './terminal.js';
import { runPipeline, getCommand, splitPipes } from './commands.js';
import { Agent } from './agent.js';
import { banner, welcome, ansi } from './banner.js';
import { HOME } from './fs.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;

const container = document.getElementById('terminal');
if (!container) throw new Error('#terminal not found');

const ui = new TerminalUI(container);

const HUMAN_PROMPT_FOR = (cwd: string) => {
  const short = cwd === HOME ? '~' : cwd.startsWith(HOME + '/') ? '~' + cwd.slice(HOME.length) : cwd;
  return `${c.brightGreen}${B}guest${R}${c.green}@leesalminen${R}:${c.brightCyan}${short}${R}$ `;
};
const AGENT_PROMPT_FOR = (_cwd: string) => `${c.brightCyan}${B}✦ ask${R} ${c.brightCyan}›${R} `;

let agent: Agent | null = null;
let agentReady = false;
let pendingImage: Blob | null = null;

function setMode() {
  if (agentReady && agent?.isReady()) {
    ui.setPromptBuilder(AGENT_PROMPT_FOR);
    ui.setAgentLabel('✦ ai guide: on   (prefix / to bypass)');
  } else {
    ui.setPromptBuilder(HUMAN_PROMPT_FOR);
    ui.setAgentLabel('classic mode');
  }
}

function makeCtx(signal: AbortSignal) {
  return {
    print: (l: string) => ui.print(l),
    printRaw: (t: string) => ui.printRaw(t),
    clear: () => ui.clear(),
    run: async (cmd: string) => {
      await runPipeline(cmd, makeCtx(signal));
    },
    getHistory: () => ui.getHistory(),
    setTheme: (n: string) => ui.setTheme(n),
    listThemes: () => ui.listThemes(),
    cwd: ui.getCwd(),
    setCwd: (p: string) => ui.setCwd(p),
    fs: ui.fs,
    signal,
  };
}

async function dispatch(line: string, signal: AbortSignal): Promise<void> {
  let trimmed = line.trim();
  let bypass = false;
  if (trimmed.startsWith('/')) {
    bypass = true;
    trimmed = trimmed.slice(1).trim();
    if (!trimmed) return;
  }

  // Built-in toggles and helpers.
  if (trimmed === 'ai' || trimmed.startsWith('ai ')) {
    handleAiToggle(trimmed, signal);
    return;
  }

  const segments = splitPipes(trimmed);
  const firstHead = segments[0]?.split(/\s+/)[0] ?? '';
  const isKnownCommand = !!getCommand(firstHead);
  const useAgent = agentReady && agent?.isReady() && !bypass && !isKnownCommand;

  // If there's a pending image, prefer routing to the agent. Discard with a
  // notice if the user ran a command instead.
  if (pendingImage) {
    if (useAgent && agent) {
      const img = pendingImage;
      pendingImage = null;
      await agent.ask(trimmed || 'What do you see in this image?', signal, img);
      return;
    }
    ui.printSystem(`✦ image discarded (you ran a command instead).`);
    pendingImage = null;
  }

  if (useAgent) {
    await agent!.ask(trimmed, signal);
    return;
  }

  await runPipeline(trimmed, makeCtx(signal));
}

async function enableAgent() {
  if (!agent) return;
  const s = agent.getStatus();
  if (s === 'unsupported' || s === 'unavailable') {
    ui.print(`${c.red}AI guide unavailable in this browser.${R}`);
    return;
  }
  if (s !== 'ready') {
    ui.printSystem(`Loading on-device model…`);
    const r = await agent.load();
    if (r.status !== 'ready') {
      ui.print(`${c.red}Could not load model: ${r.message ?? r.status}${R}`);
      return;
    }
  }
  if (!agent.isReady()) agent.toggle();
  agentReady = true;
  ui.print(`${c.brightCyan}✦ AI guide enabled.${R}`);
  setMode();
}

function handleAiToggle(line: string, signal: AbortSignal) {
  if (!agent) {
    ui.print(`${c.red}AI guide is not available in this browser.${R}`);
    ui.printSystem(`Chrome with the Prompt API (window.LanguageModel) is required.`);
    return;
  }
  const parts = line.split(/\s+/);
  const sub = parts[1] ?? '';

  if (sub === 'off') {
    if (agent.isReady()) agent.toggle();
    agentReady = false;
    ui.print(`${c.green}✓ AI guide disabled — classic terminal mode.${R}`);
    setMode();
    return;
  }
  if (sub === 'on' || sub === '') {
    if (sub === '' && agent.getStatus() === 'ready') {
      const enabledNow = agent.toggle();
      agentReady = enabledNow && agent.getStatus() === 'ready';
      ui.print(enabledNow ? `${c.brightCyan}✦ AI guide enabled.${R}` : `${c.green}✓ AI guide disabled.${R}`);
      setMode();
      return;
    }
    void enableAgent();
    return;
  }
  if (sub === 'voice') {
    if (agent.isVoiceActive()) {
      agent.stopVoiceMode();
    } else if (!agent.isReady()) {
      void (async () => {
        await enableAgent();
        if (agent!.isReady()) await agent!.startVoiceMode();
      })();
    } else {
      void agent.startVoiceMode();
    }
    void signal;
    return;
  }
  if (sub === 'forget') {
    agent.forgetMemory();
    ui.print(`${c.green}✓ agent memory cleared.${R}`);
    return;
  }
  ui.print(`${c.red}unknown: ai ${sub}${R}  ${ansi.dim}(try: ai on | ai off | ai voice | ai forget)${R}`);
}

function setupImagePaste() {
  // Listen on the document so it works whether the terminal has focus or not.
  document.addEventListener('paste', (ev: ClipboardEvent) => {
    const items = ev.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (!blob) continue;
        pendingImage = blob;
        ui.printSystem(`✦ image attached (${blob.type}, ${(blob.size / 1024).toFixed(0)} KB). Type a question, then Enter.`);
        ev.preventDefault();
        return;
      }
    }
  });

  // Also accept drag-and-drop into the terminal.
  container?.addEventListener('dragover', e => e.preventDefault());
  container?.addEventListener('drop', (ev: DragEvent) => {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    pendingImage = file;
    ui.printSystem(`✦ image attached (${file.type}, ${(file.size / 1024).toFixed(0)} KB). Type a question, then Enter.`);
  });
}

async function runDeepLink() {
  // Supports #cmd=<line>  or  #run=<demo-path>.
  const hash = location.hash.replace(/^#/, '');
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const cmd = params.get('cmd');
  const run = params.get('run');
  const line = cmd || (run ? `run ${run}` : '');
  if (!line) return;
  ui.printSystem(`✦ deep link → ${line}`);
  await ui.typeAndRun(line);
}

async function boot() {
  ui.focus();
  ui.print(banner());

  agent = new Agent(ui);
  const result = await agent.init();
  let status = result.status;

  if (status === 'downloadable' || status === 'downloading') {
    const choice = await ui.chooseModal(
      `✦  fancy a chat with Lee's agent?`,
      [
        `Lee cloned a small piece of his brain and stuffed it into`,
        `your browser. It knows his work, runs the terminal for you,`,
        `and never phones home — everything runs on-device.`,
        `One-time ~2 GB download. Or just poke around yourself.`,
      ],
      [
        `Sure, let the little guy out of the box`,
        `Nah, I'll drive — hands off my terminal`,
      ],
    );
    if (choice === 0) {
      ui.printSystem(`Loading on-device model…`);
      const loaded = await agent.load();
      status = loaded.status;
      if (loaded.status !== 'ready' && loaded.message) {
        ui.printSystem(`agent unavailable: ${loaded.message}`);
      }
    }
  } else if (status === 'unavailable' && result.message) {
    ui.printSystem(`agent unavailable: ${result.message}`);
  }

  agentReady = status === 'ready';
  ui.print(welcome(agentReady));
  ui.print('');

  setMode();
  ui.setDispatch(dispatch);
  setupImagePaste();

  if (location.hash) {
    await runDeepLink();
  } else if (agentReady) {
    ui.print(`${B}${c.brightCyan}✦${R} ${ansi.dim}warming up...${R}`);
    await agent!.ask('Greet the visitor with a short welcome and a quick intro to Lee.', new AbortController().signal);
  }
  ui.showPrompt();
}

boot().catch(err => {
  ui.print(`${c.red}boot error: ${err.message}${R}`);
});
