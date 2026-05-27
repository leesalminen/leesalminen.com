import type { CommandContext } from './types.js';

// Markdown content — bundled as raw strings via Vite's ?raw query.
import aboutMd from './content/about.md?raw';
import nowMd from './content/now.md?raw';
import contactMd from './content/contact.md?raw';
import familyMd from './content/family.md?raw';
import locationsMd from './content/locations.md?raw';
import interestsMd from './content/interests.md?raw';
import skillsMd from './content/skills.md?raw';
import projectsReadme from './content/projects/readme.md?raw';
import bitcoinJungleReadme from './content/projects/bitcoin-jungle/readme.md?raw';
import lightningInvoiceReadme from './content/projects/lightning-invoice/readme.md?raw';
import nostrFeedReadme from './content/projects/nostr-feed/readme.md?raw';
import sqlPlaygroundReadme from './content/projects/sql-playground/readme.md?raw';
import writingReadme from './content/writing/readme.md?raw';
import onDeviceAi from './content/writing/on-device-ai.md?raw';
import bitcoinJungleStory from './content/writing/bitcoin-jungle-story.md?raw';

export type FileNode = {
  type: 'file';
  mime: 'text/markdown' | 'text/plain';
  content: string;
};

export type DemoRunner = (ctx: CommandContext) => Promise<void>;

export type DemoNode = {
  type: 'demo';
  // Lazy importer so each demo only loads when invoked.
  load: () => Promise<{ run: DemoRunner }>;
};

export type DirNode = {
  type: 'dir';
  children: Record<string, FsNode>;
};

export type FsNode = FileNode | DirNode | DemoNode;

const file = (content: string): FileNode => ({ type: 'file', mime: 'text/markdown', content });
const dir = (children: Record<string, FsNode>): DirNode => ({ type: 'dir', children });

// Demos are lazy — the import() only runs on `run <path>`, so they don't bloat
// the initial bundle. Vite picks them up as separate chunks.
const demo = (load: DemoNode['load']): DemoNode => ({ type: 'demo', load });

export const ROOT: DirNode = dir({
  home: dir({
    lee: dir({
      'about.md': file(aboutMd),
      'now.md': file(nowMd),
      'contact.md': file(contactMd),
      'family.md': file(familyMd),
      'locations.md': file(locationsMd),
      'interests.md': file(interestsMd),
      'skills.md': file(skillsMd),
      projects: dir({
        'readme.md': file(projectsReadme),
        'bitcoin-jungle': dir({
          'readme.md': file(bitcoinJungleReadme),
          demo: demo(() => import('./content/projects/bitcoin-jungle/demo.js')),
        }),
        'lightning-invoice': dir({
          'readme.md': file(lightningInvoiceReadme),
          demo: demo(() => import('./content/projects/lightning-invoice/demo.js')),
        }),
        'nostr-feed': dir({
          'readme.md': file(nostrFeedReadme),
          demo: demo(() => import('./content/projects/nostr-feed/demo.js')),
        }),
        'sql-playground': dir({
          'readme.md': file(sqlPlaygroundReadme),
          demo: demo(() => import('./content/projects/sql-playground/demo.js')),
        }),
      }),
      writing: dir({
        'readme.md': file(writingReadme),
        'on-device-ai.md': file(onDeviceAi),
        'bitcoin-jungle-story.md': file(bitcoinJungleStory),
      }),
    }),
  }),
});

export const HOME = '/home/lee';

// Normalize a path: collapse `.` and `..`, leading slash means absolute.
export function resolvePath(cwd: string, p: string): string {
  if (!p || p === '~') return HOME;
  if (p.startsWith('~/')) p = HOME + '/' + p.slice(2);
  if (p === '~') p = HOME;
  const base = p.startsWith('/') ? '' : cwd;
  const parts = (base + '/' + p).split('/').filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return '/' + out.join('/');
}

export function abbreviate(p: string): string {
  if (p === HOME) return '~';
  if (p.startsWith(HOME + '/')) return '~' + p.slice(HOME.length);
  return p;
}

export class VirtualFs {
  readonly root: DirNode;
  constructor(root: DirNode = ROOT) {
    this.root = root;
  }

  get(path: string): FsNode | null {
    if (path === '/') return this.root;
    const parts = path.split('/').filter(Boolean);
    let node: FsNode = this.root;
    for (const part of parts) {
      if (node.type !== 'dir') return null;
      const next: FsNode | undefined = node.children[part];
      if (!next) return null;
      node = next;
    }
    return node;
  }

  list(path: string): { name: string; node: FsNode }[] | null {
    const n = this.get(path);
    if (!n || n.type !== 'dir') return null;
    return Object.entries(n.children).map(([name, node]) => ({ name, node }));
  }

  // Tab-complete a partial path against the FS. Returns absolute paths that
  // match. The caller is responsible for re-formatting them relative to cwd.
  complete(cwd: string, prefix: string): string[] {
    const abs = resolvePath(cwd, prefix || '.');
    // If prefix ends with '/', list its children.
    const trailing = prefix.endsWith('/') || prefix === '' || prefix === '.' || prefix === '..';
    let dirAbs: string;
    let partial: string;
    if (trailing) {
      dirAbs = abs;
      partial = '';
    } else {
      const idx = abs.lastIndexOf('/');
      dirAbs = idx <= 0 ? '/' : abs.slice(0, idx);
      partial = abs.slice(idx + 1);
    }
    const entries = this.list(dirAbs);
    if (!entries) return [];
    return entries.filter(e => e.name.startsWith(partial)).map(e => {
      const child = dirAbs === '/' ? '/' + e.name : `${dirAbs}/${e.name}`;
      return e.node.type === 'dir' ? child + '/' : child;
    });
  }

  // Walk all file nodes for `find`-style search.
  *walk(path: string = '/'): Generator<{ path: string; node: FsNode }> {
    const root = this.get(path);
    if (!root) return;
    yield { path, node: root };
    if (root.type !== 'dir') return;
    for (const [name, child] of Object.entries(root.children)) {
      const childPath = path === '/' ? `/${name}` : `${path}/${name}`;
      if (child.type === 'dir') {
        yield* this.walk(childPath);
      } else {
        yield { path: childPath, node: child };
      }
    }
  }
}
