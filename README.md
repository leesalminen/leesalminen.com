# leesalminen.com

Personal homepage — an agentic terminal portfolio.

Live at https://leesalminen.com

## Stack

- Vite + TypeScript
- `@xterm/xterm` for the terminal
- Chrome's built-in Prompt API (Gemini Nano) for the on-device AI guide

When the browser supports `window.LanguageModel`, the terminal boots into
agent mode: the agent has the terminal's commands as its tools and uses
them to answer visitors' questions. Otherwise it falls back to a classic
terminal where you type commands directly.

## Dev

```
npm install
npm run dev
npm run build
```
