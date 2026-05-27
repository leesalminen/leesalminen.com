import './styles.css';
import { TerminalUI } from './terminal.js';
import { runCommand, getCommand } from './commands.js';
import { Agent } from './agent.js';
import { banner, welcome, ansi } from './banner.js';

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;

const container = document.getElementById('terminal');
if (!container) throw new Error('#terminal not found');

const ui = new TerminalUI(container);

const HUMAN_PROMPT = `${c.brightGreen}${B}guest${R}${c.green}@leesalminen${R}:${c.brightCyan}~${R}$ `;
const AGENT_PROMPT = `${c.brightCyan}${B}✦ ask${R} ${c.brightCyan}›${R} `;

let agent: Agent | null = null;
let agentReady = false;

function setMode() {
  if (agentReady && agent?.isReady()) {
    ui.setPrompt(AGENT_PROMPT);
    ui.setAgentLabel('✦ ai guide: on   (prefix / to bypass)');
  } else {
    ui.setPrompt(HUMAN_PROMPT);
    ui.setAgentLabel('classic mode');
  }
}

async function dispatch(line: string, signal: AbortSignal): Promise<void> {
  // Allow user to bypass the agent with leading "/" — runs the command directly.
  let trimmed = line.trim();
  let bypass = false;
  if (trimmed.startsWith('/')) {
    bypass = true;
    trimmed = trimmed.slice(1).trim();
    if (!trimmed) return;
  }

  // Built-in toggle.
  if (trimmed === 'ai' || trimmed === 'ai on' || trimmed === 'ai off') {
    handleAiToggle(trimmed);
    return;
  }

  const head = trimmed.split(/\s+/)[0];

  // If the agent is active and not bypassed, only treat as a command if it
  // matches a real command name AND the line looks like a command (no spaces
  // beyond args, all lowercase head). Otherwise hand the line to the agent.
  const isKnownCommand = !!getCommand(head);
  const useAgent = agentReady && agent?.isReady() && !bypass && !isKnownCommand;

  if (useAgent) {
    await agent!.ask(trimmed, signal);
    return;
  }

  // Run as a direct command.
  await runCommand(trimmed, {
    print: l => ui.print(l),
    printRaw: t => ui.printRaw(t),
    clear: () => ui.clear(),
    run: async (cmd: string) => {
      await runCommand(cmd, {
        print: l => ui.print(l),
        printRaw: t => ui.printRaw(t),
        clear: () => ui.clear(),
        run: async () => {},
        getHistory: () => ui.getHistory(),
        setTheme: (n: string) => ui.setTheme(n),
        listThemes: () => ui.listThemes(),
        signal,
      });
    },
    getHistory: () => ui.getHistory(),
    setTheme: (n: string) => ui.setTheme(n),
    listThemes: () => ui.listThemes(),
    signal,
  });
}

function handleAiToggle(line: string) {
  if (!agent) {
    ui.print(`${c.red}AI guide is not available in this browser.${R}`);
    ui.printSystem(`Chrome with the Prompt API (window.LanguageModel) is required.`);
    return;
  }
  if (line === 'ai off') {
    if (agent.isReady()) agent.toggle();
    agentReady = false;
    ui.print(`${c.green}✓ AI guide disabled — classic terminal mode.${R}`);
    setMode();
    return;
  }
  if (line === 'ai on') {
    if (agent.getStatus() !== 'ready') {
      ui.print(`${c.red}AI guide not ready: ${agent.getStatus()}${R}`);
      return;
    }
    if (!agent.isReady()) agent.toggle();
    agentReady = true;
    ui.print(`${c.brightCyan}✦ AI guide enabled.${R}`);
    setMode();
    return;
  }
  // bare 'ai' — toggle
  const enabledNow = agent.toggle();
  agentReady = enabledNow && agent.getStatus() === 'ready';
  ui.print(enabledNow ? `${c.brightCyan}✦ AI guide enabled.${R}` : `${c.green}✓ AI guide disabled.${R}`);
  setMode();
}

async function boot() {
  ui.focus();
  ui.print(banner());

  // Try to bring up the on-device agent.
  agent = new Agent(ui);
  const result = await agent.init();
  agentReady = result.status === 'ready';

  ui.print(welcome(agentReady));
  ui.print('');

  if (result.status === 'downloadable' || result.status === 'downloading') {
    ui.printSystem(`(model finished downloading — agent ready)`);
  }
  if (result.status === 'unavailable' && result.message) {
    ui.printSystem(`agent unavailable: ${result.message}`);
  }

  setMode();
  ui.setDispatch(dispatch);

  if (agentReady) {
    // Let the agent introduce itself before the user types anything.
    ui.print(`${B}${c.brightCyan}✦${R} ${ansi.dim}warming up...${R}`);
    await agent!.ask('Greet the visitor with a short welcome and a quick intro to Lee.', new AbortController().signal);
    ui.showPrompt();
  } else {
    ui.showPrompt();
  }
}

boot().catch(err => {
  ui.print(`${c.red}boot error: ${err.message}${R}`);
});
