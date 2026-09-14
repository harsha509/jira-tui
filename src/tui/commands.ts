import { SCOPES, SCOPE_LABELS, scopeJql, searchJql, type Scope } from '../jira/jql.js';
import { resolveIssueKey } from './issue-format.js';
import { getSnapshot, selectedIssue, tuiStore, type IssueQuery } from './store.js';

/** Side-effecting surface commands call into, implemented by src/index.ts. Omitted args open a picker or prompt. */
export interface TuiActions {
  /** Welcome picker: record the scope, load its issues, move to main. */
  selectScope(scope: Scope): Promise<void>;
  loadIssues(query: IssueQuery): Promise<void>;
  refresh(): Promise<void>;
  /** Action menu for one ticket (view / move / assign / comment / open). */
  ticketMenu(key: string): Promise<void>;
  viewIssue(key: string): Promise<void>;
  moveIssue(key: string, target?: string): Promise<void>;
  /** `who` is "me", "none", an email or a name; omitted opens the assignable-user picker. */
  assignIssue(key: string, who?: string): Promise<void>;
  commentIssue(key: string, text?: string): Promise<void>;
  createIssue(type?: string, summary?: string): Promise<void>;
  openInBrowser(key: string): void;
  goToBoard(): void;
  goToMain(): void;
  goToWelcome(): void;
  quit(): Promise<void>;
}

export interface PaletteCommand {
  id: string;
  name: string;
  aliases?: string[];
  summary: string;
  run(actions: TuiActions, args: string): void | Promise<void>;
}

export const ISSUE_TYPES = ['Bug', 'Task', 'Story', 'Epic', 'Feature', 'Subtask'];

export function scopeQuery(scope: Scope): IssueQuery {
  const { project, teamJql } = getSnapshot();
  return { label: SCOPE_LABELS[scope], jql: scopeJql(scope, project, teamJql) };
}

function isScope(value: string): value is Scope {
  return (SCOPES as string[]).includes(value);
}

const KEY_SHAPE = /^(\d+|[a-z][a-z0-9]*-\d+)$/i;

/** `<key> <rest>`; without a leading key the selected ticket is used and the whole args are `rest`. */
function keyArg(args: string): { key: string; rest: string } | null {
  const trimmed = args.trim();
  const [head = '', ...tail] = trimmed.split(/\s+/);
  if (KEY_SHAPE.test(head)) {
    const key = resolveIssueKey(head, getSnapshot().project);
    return key ? { key, rest: tail.join(' ') } : null;
  }
  const selected = selectedIssue();
  return selected ? { key: selected.key, rest: trimmed } : null;
}

function noTicket(usage: string): void {
  tuiStore.setPaletteError(`${usage} — or select a ticket in the list first`);
}

export const COMMANDS: PaletteCommand[] = [
  {
    id: 'list',
    name: '/list',
    aliases: ['/ls'],
    summary: 'List open tickets: /list mine | team | all',
    run: async (actions, args) => {
      const want = args.trim().toLowerCase() || getSnapshot().scope;
      if (!isScope(want)) {
        tuiStore.setPaletteError('Usage: /list mine | team | all');
        return;
      }
      tuiStore.setScope(want);
      await actions.loadIssues(scopeQuery(want));
    },
  },
  {
    id: 'jql',
    name: '/jql',
    summary: 'Run a raw JQL query (e.g. /jql assignee = currentUser())',
    run: async (actions, args) => {
      const jql = args.trim();
      if (!jql) {
        tuiStore.setPaletteError('Usage: /jql <query>');
        return;
      }
      await actions.loadIssues({ label: `jql: ${jql}`, jql });
    },
  },
  {
    id: 'search',
    name: '/search',
    summary: 'Search summaries for text (a plain line does this too)',
    run: async (actions, args) => {
      const text = args.trim();
      if (!text) {
        tuiStore.setPaletteError('Usage: /search <text>');
        return;
      }
      await actions.loadIssues({ label: `search "${text}"`, jql: searchJql(getSnapshot().project, text) });
    },
  },
  {
    id: 'ticket',
    name: '/ticket',
    aliases: ['/t'],
    summary: 'Action menu for a ticket: /ticket [key] (default: selected)',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed || parsed.rest) {
        noTicket('Usage: /ticket [key]');
        return;
      }
      return actions.ticketMenu(parsed.key);
    },
  },
  {
    id: 'view',
    name: '/view',
    aliases: ['/v'],
    summary: 'View a ticket: /view [92 | A2A-92] (default: selected)',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed || parsed.rest) {
        noTicket('Usage: /view [key]');
        return;
      }
      return actions.viewIssue(parsed.key);
    },
  },
  {
    id: 'move',
    name: '/move',
    aliases: ['/mv'],
    summary: 'Change status: /move [key] [status] — no status opens a picker',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed) {
        noTicket('Usage: /move [key] [status]');
        return;
      }
      const target = parsed.rest.replace(/^"(.*)"$/, '$1').trim();
      return actions.moveIssue(parsed.key, target || undefined);
    },
  },
  {
    id: 'assign',
    name: '/assign',
    summary: 'Assign: /assign [key] [me|none|email|name] — no one opens a picker',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed) {
        noTicket('Usage: /assign [key] [me|none|email|name]');
        return;
      }
      return actions.assignIssue(parsed.key, parsed.rest.trim() || undefined);
    },
  },
  {
    id: 'comment',
    name: '/comment',
    aliases: ['/cm'],
    summary: 'Comment: /comment [key] [text] — no text opens a prompt',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed) {
        noTicket('Usage: /comment [key] [text]');
        return;
      }
      return actions.commentIssue(parsed.key, parsed.rest.trim() || undefined);
    },
  },
  {
    id: 'create',
    name: '/create',
    aliases: ['/new'],
    summary: `Create a ticket: /create [${ISSUE_TYPES.join('|')}] [summary] — guided when omitted`,
    run: (actions, args) => {
      const [head = '', ...tail] = args.trim().split(/\s+/);
      const type = ISSUE_TYPES.find((t) => t.toLowerCase() === head.toLowerCase());
      const summary = (type ? tail.join(' ') : args).trim();
      return actions.createIssue(type, summary || undefined);
    },
  },
  {
    id: 'open',
    name: '/open',
    aliases: ['/o'],
    summary: 'Open a ticket in the browser: /open [key] (default: selected)',
    run: (actions, args) => {
      const parsed = keyArg(args);
      if (!parsed || parsed.rest) {
        noTicket('Usage: /open [key]');
        return;
      }
      actions.openInBrowser(parsed.key);
    },
  },
  {
    id: 'board',
    name: '/board',
    aliases: ['/jb'],
    summary: 'Show the current list grouped by status, in board column order',
    run: (actions) => actions.goToBoard(),
  },
  {
    id: 'refresh',
    name: '/refresh',
    aliases: ['/r'],
    summary: 'Reload the current list',
    run: (actions) => actions.refresh(),
  },
  {
    id: 'scope',
    name: '/scope',
    summary: 'Back to the scope picker (mine / team / all)',
    run: (actions) => actions.goToWelcome(),
  },
  {
    id: 'clear-log',
    name: '/clear-log',
    summary: 'Clear the transcript',
    run: () => tuiStore.clearTranscript(),
  },
  {
    id: 'help',
    name: '/help',
    aliases: ['/?'],
    summary: 'List available commands',
    run: () => {
      const width = COMMANDS.reduce((w, c) => Math.max(w, c.name.length), 0);
      tuiStore.showViewer({
        title: 'Commands',
        subtitle: 'a plain line views a ticket (92, A2A-92) or searches summaries · ⇧tab then enter acts on a ticket',
        lines: COMMANDS.map((c) => `${c.name.padEnd(width + 2)}${c.summary}`),
      });
    },
  },
  {
    id: 'quit',
    name: '/quit',
    aliases: ['/exit', '/q'],
    summary: 'Exit the TUI',
    run: (actions) => actions.quit(),
  },
];

/** Case-insensitive prefix match against name + aliases, for the palette list. */
export function matchCommands(query: string): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q || q === '/') return COMMANDS;
  return COMMANDS.filter(
    (c) => c.name.toLowerCase().startsWith(q) || c.aliases?.some((a) => a.toLowerCase().startsWith(q))
  );
}

/** Tab completion: the longest shared prefix of every match, or the single match plus a space. */
export function completeCommand(line: string): string | null {
  if (!line.startsWith('/') || line.includes(' ')) return null;
  const q = line.toLowerCase();
  const candidates: string[] = [];
  for (const command of COMMANDS) {
    for (const name of [command.name, ...(command.aliases ?? [])]) {
      if (name.toLowerCase().startsWith(q)) candidates.push(name);
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return `${candidates[0]} `;
  let prefix = candidates[0];
  for (const candidate of candidates.slice(1)) {
    while (!candidate.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return null;
    }
  }
  return prefix.length > line.length ? prefix : null;
}

export function resolveCommand(line: string): PaletteCommand | undefined {
  const head = line.trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!head) return undefined;
  return COMMANDS.find(
    (c) => c.name.toLowerCase() === head || c.aliases?.some((a) => a.toLowerCase() === head)
  );
}

/** One submitted line: `/command args`, a ticket key/number to view, or text to search. */
export async function executeLine(line: string, actions: TuiActions): Promise<void> {
  const trimmed = line.trim();
  if (!trimmed) return;
  tuiStore.setPaletteError(null);

  if (trimmed.startsWith('/')) {
    const head = trimmed.split(/\s+/, 1)[0] ?? trimmed;
    let cmd = resolveCommand(trimmed);
    if (!cmd) {
      const candidates = matchCommands(head);
      if (candidates.length === 1) cmd = candidates[0];
    }
    if (!cmd) {
      tuiStore.setPaletteError(`Unknown command: ${head} — try /help`);
      return;
    }
    await cmd.run(actions, trimmed.slice(head.length).trim());
    return;
  }

  const key = resolveIssueKey(trimmed, getSnapshot().project);
  if (key) {
    await actions.viewIssue(key);
    return;
  }
  await actions.loadIssues({ label: `search "${trimmed}"`, jql: searchJql(getSnapshot().project, trimmed) });
}
