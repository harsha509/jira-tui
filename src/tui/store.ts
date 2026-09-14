import type { BoardInfo } from '../jira/board.js';
import type { Scope } from '../jira/jql.js';
import type { Issue, JiraUser } from '../jira/types.js';

export type TuiScreen = 'welcome' | 'main' | 'board';

export type TranscriptKind = 'info' | 'warn' | 'error' | 'command' | 'result';

export type MainFocus = 'menu' | 'issues' | 'prompt';

export interface IssueQuery {
  label: string;
  jql: string;
}

export interface TranscriptEntry {
  id: number;
  kind: TranscriptKind;
  text: string;
  detail?: string;
  ts: number;
}

export interface ViewerStatus {
  color: string;
  text: string;
}

export interface SelectItem {
  id: string;
  label: string;
  hint?: string;
}

/** A blocking question rendered in place of the active screen; see modal.ts for the promise wrappers. */
export type Modal =
  | {
      kind: 'select';
      title: string;
      subtitle?: string;
      items: SelectItem[];
      onSelect: (item: SelectItem) => void;
      onCancel: () => void;
    }
  | {
      kind: 'prompt';
      title: string;
      subtitle?: string;
      placeholder?: string;
      initial?: string;
      onSubmit: (value: string) => void;
      onCancel: () => void;
    };

export interface TuiState {
  screen: TuiScreen;
  project: string;
  teamJql: string | null;
  /** The project's board, once loaded; drives column order and which statuses count as open. */
  board: BoardInfo | null;
  me: JiraUser | null;
  scope: Scope;
  query: IssueQuery | null;
  issues: Issue[];
  issuesLoading: boolean;
  issuesError: string | null;
  /** Index into visibleIssues(). */
  issuesSelected: number;
  /** Board column (or status) name narrowing the loaded list; null shows everything. */
  statusFilter: string | null;
  /** Which main-screen pane owns the keyboard; kept here because dialogs unmount the screen. */
  mainFocus: MainFocus;
  menuIndex: number;
  transcript: TranscriptEntry[];
  running: boolean;
  /** Inline feedback under the prompt (e.g. a typo'd command), separate from the transcript. */
  paletteError: string | null;
  statusMessage: string;
  busyMessage: string;
  modal: Modal | null;
  viewerOpen: boolean;
  viewerTitle: string;
  viewerSubtitle?: string;
  viewerLines: string[];
  viewerStatus?: ViewerStatus;
  /** Issue the viewer is showing, so its action keys know what to act on. */
  viewerIssueKey: string | null;
}

function initial(): TuiState {
  return {
    screen: 'welcome',
    project: '',
    teamJql: null,
    board: null,
    me: null,
    scope: 'mine',
    query: null,
    issues: [],
    issuesLoading: false,
    issuesError: null,
    issuesSelected: 0,
    statusFilter: null,
    mainFocus: 'menu',
    menuIndex: 0,
    transcript: [],
    running: false,
    paletteError: null,
    statusMessage: '',
    busyMessage: '',
    modal: null,
    viewerOpen: false,
    viewerTitle: '',
    viewerSubtitle: undefined,
    viewerLines: [],
    viewerStatus: undefined,
    viewerIssueKey: null,
  };
}

const MAX_TRANSCRIPT = 500;

let state: TuiState = initial();
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function set(patch: Partial<TuiState>): void {
  state = { ...state, ...patch };
  emit();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): TuiState {
  return state;
}

/** Statuses the current filter admits (a board column's statuses, or the name itself), lower-cased. */
function filterStatuses(s: TuiState): Set<string> | null {
  if (!s.statusFilter) return null;
  const column = s.board?.columns.find((c) => c.name.toLowerCase() === s.statusFilter!.toLowerCase());
  return new Set((column?.statuses ?? [s.statusFilter]).map((name) => name.toLowerCase()));
}

/** The loaded list narrowed by the status filter — what the ticket pane shows. */
export function visibleIssues(s: TuiState = state): Issue[] {
  const wanted = filterStatuses(s);
  return wanted ? s.issues.filter((i) => wanted.has(i.status.toLowerCase())) : s.issues;
}

/** The issue highlighted in the panel, if any. */
export function selectedIssue(): Issue | undefined {
  return visibleIssues()[state.issuesSelected];
}

/** Observable state behind every screen; consumed via useSyncExternalStore. */
export const tuiStore = {
  reset(): void {
    state = initial();
    nextId = 1;
    emit();
  },
  goTo(screen: TuiScreen): void {
    set({ screen });
  },
  /** Switching project also drops the previous board and list. */
  setProject(project: string, teamJql: string | null): void {
    const changed = project !== state.project;
    set(changed ? { project, teamJql, board: null, query: null, issues: [], issuesSelected: 0, statusFilter: null } : { project, teamJql });
  },
  setBoard(board: BoardInfo | null): void {
    set({ board });
  },
  setMe(me: JiraUser | null): void {
    set({ me });
  },
  setScope(scope: Scope): void {
    set({ scope });
  },
  setIssuesLoading(query: IssueQuery): void {
    set({ query, issuesLoading: true, issuesError: null });
  },
  setIssues(issues: Issue[]): void {
    const next = { ...state, issues };
    set({
      issues,
      issuesLoading: false,
      issuesError: null,
      issuesSelected: Math.min(state.issuesSelected, Math.max(0, visibleIssues(next).length - 1)),
    });
  },
  setStatusFilter(statusFilter: string | null): void {
    set({ statusFilter, issuesSelected: 0 });
  },
  setIssuesError(issuesError: string): void {
    set({ issuesError, issuesLoading: false });
  },
  setIssuesSelected(issuesSelected: number): void {
    set({ issuesSelected: Math.max(0, Math.min(issuesSelected, visibleIssues().length - 1)) });
  },
  setMainFocus(mainFocus: MainFocus): void {
    set({ mainFocus });
  },
  setMenuIndex(menuIndex: number): void {
    set({ menuIndex });
  },
  log(kind: TranscriptKind, text: string, detail?: string): void {
    const entry: TranscriptEntry = { id: nextId++, kind, text, detail, ts: Date.now() };
    set({ transcript: [...state.transcript, entry].slice(-MAX_TRANSCRIPT) });
  },
  clearTranscript(): void {
    set({ transcript: [] });
  },
  setRunning(running: boolean): void {
    set({ running });
  },
  setPaletteError(paletteError: string | null): void {
    set({ paletteError });
  },
  setStatusMessage(statusMessage: string): void {
    set({ statusMessage });
  },
  setBusy(busyMessage: string): void {
    set({ busyMessage });
  },
  openModal(modal: Modal): void {
    set({ modal });
  },
  closeModal(): void {
    set({ modal: null });
  },
  showViewer(opts: {
    title: string;
    subtitle?: string;
    lines: string[];
    status?: ViewerStatus;
    issueKey?: string;
  }): void {
    set({
      viewerOpen: true,
      viewerTitle: opts.title,
      viewerSubtitle: opts.subtitle,
      viewerLines: opts.lines,
      viewerStatus: opts.status,
      viewerIssueKey: opts.issueKey ?? null,
    });
  },
  closeViewer(): void {
    set({
      viewerOpen: false,
      viewerTitle: '',
      viewerSubtitle: undefined,
      viewerLines: [],
      viewerStatus: undefined,
      viewerIssueKey: null,
    });
  },
};
