// Lightweight wrapper around the Web Speech API (SpeechRecognition +
// SpeechSynthesis). Both are browser-native so no dependencies are needed.

export type VoiceListenResult = {
  transcript: string;
  cancelled: boolean;
};

type SRConstructor = new () => SRInstance;
type SRInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: { length: number; [i: number]: { 0: { transcript: string } } } }) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onstart: ((ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

function getSpeechRecognition(): SRConstructor | null {
  const w = window as unknown as { SpeechRecognition?: SRConstructor; webkitSpeechRecognition?: SRConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export class Voice {
  private rec: SRInstance | null = null;
  private synth: SpeechSynthesis | null = null;

  isSupported(): boolean {
    return Boolean(getSpeechRecognition()) && typeof window.speechSynthesis !== 'undefined';
  }

  isSpeechRecognitionSupported(): boolean {
    return Boolean(getSpeechRecognition());
  }

  isSpeechSynthesisSupported(): boolean {
    return typeof window.speechSynthesis !== 'undefined';
  }

  listenOnce(signal?: AbortSignal): Promise<VoiceListenResult> {
    return new Promise(resolve => {
      const SR = getSpeechRecognition();
      if (!SR) {
        resolve({ transcript: '', cancelled: true });
        return;
      }
      const rec = new SR();
      this.rec = rec;
      rec.lang = navigator.language || 'en-US';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;

      let settled = false;
      const finish = (transcript: string, cancelled: boolean) => {
        if (settled) return;
        settled = true;
        this.rec = null;
        try { rec.abort(); } catch { /* ignore */ }
        resolve({ transcript, cancelled });
      };

      rec.onresult = (ev) => {
        const len = ev.results.length;
        const last = len > 0 ? ev.results[len - 1] : null;
        const transcript = last?.[0]?.transcript?.trim() ?? '';
        finish(transcript, false);
      };
      rec.onerror = () => finish('', true);
      rec.onend = () => finish('', true);

      if (signal) {
        if (signal.aborted) {
          finish('', true);
          return;
        }
        signal.addEventListener('abort', () => finish('', true), { once: true });
      }

      try {
        rec.start();
      } catch {
        // already started or denied
        finish('', true);
      }
    });
  }

  speak(text: string, signal?: AbortSignal): Promise<void> {
    return new Promise(resolve => {
      if (typeof window.speechSynthesis === 'undefined') {
        resolve();
        return;
      }
      this.synth = window.speechSynthesis;
      this.synth.cancel();

      const u = new SpeechSynthesisUtterance(text);
      u.lang = navigator.language || 'en-US';
      u.rate = 1.05;
      u.pitch = 1.0;
      u.onend = () => resolve();
      u.onerror = () => resolve();

      if (signal) {
        if (signal.aborted) {
          resolve();
          return;
        }
        signal.addEventListener('abort', () => {
          try { this.synth?.cancel(); } catch { /* ignore */ }
          resolve();
        }, { once: true });
      }

      this.synth.speak(u);
    });
  }

  stop() {
    try { this.rec?.abort(); } catch { /* ignore */ }
    try { this.synth?.cancel(); } catch { /* ignore */ }
  }
}
