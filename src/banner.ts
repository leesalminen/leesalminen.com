// ANSI helpers — xterm.js renders these.
export const ansi = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    brightGreen: '\x1b[92m',
    brightCyan: '\x1b[96m',
    brightYellow: '\x1b[93m',
    brightMagenta: '\x1b[95m',
  },
  clearScreen: '\x1b[2J\x1b[H',
  clearLine: '\x1b[2K\r',
};

const c = ansi.fg;
const R = ansi.reset;
const B = ansi.bold;

export function banner(): string {
  const lines = [
    `${c.brightCyan}${B} ██╗     ███████╗███████╗${R}`,
    `${c.brightCyan}${B} ██║     ██╔════╝██╔════╝${R}`,
    `${c.brightCyan}${B} ██║     █████╗  █████╗  ${R}`,
    `${c.brightCyan}${B} ██║     ██╔══╝  ██╔══╝  ${R}`,
    `${c.brightCyan}${B} ███████╗███████╗███████╗${R}`,
    `${c.brightCyan}${B} ╚══════╝╚══════╝╚══════╝${R}`,
    ``,
    `${c.brightGreen}${B} leesalminen.com ${ansi.dim}// father · husband · technologist · entrepreneur${R}`,
    ``,
  ];
  return lines.join('\r\n');
}

export function welcome(agentAvailable: boolean): string {
  const lines: string[] = [];
  lines.push(`${c.green}Welcome.${R} You've reached an agentic terminal portfolio.`);
  lines.push(``);
  if (agentAvailable) {
    lines.push(`${c.brightCyan}✦ AI guide detected${R} — Chrome's on-device Prompt API is available.`);
    lines.push(`  Just ${B}ask a question${R} (e.g. "who is Lee?" or "show me his projects").`);
    lines.push(`  Prefix a line with ${B}/${R} to bypass the agent and run a command directly.`);
  } else {
    lines.push(`${ansi.dim}No on-device AI available — running in classic terminal mode.${R}`);
    lines.push(`${ansi.dim}Tip: Chrome with the Prompt API will unlock an AI guide.${R}`);
  }
  lines.push(``);
  lines.push(`Type ${B}${c.brightYellow}help${R} for commands, or ${B}${c.brightYellow}about${R} for the short version.`);
  return lines.join('\r\n');
}
