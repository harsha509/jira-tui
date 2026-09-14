import { searchJql, SCOPES, SCOPE_LABELS, type Scope } from '../jira/jql.js';
import { COMMANDS, type TuiActions } from './commands.js';
import { groupByStatus, resolveIssueKey } from './issue-format.js';
import { askText } from './modal.js';
import { getSnapshot, tuiStore, type TuiState } from './store.js';

export type FilterKind = 'heading' | 'scope' | 'status' | 'action';

export interface FilterItem {
  id: string;
  kind: FilterKind;
  label: string;
  /** Tickets this filter would show; only for scope/status rows. */
  count?: number;
  /** The currently applied scope or status filter. */
  active?: boolean;
  run?: (actions: TuiActions) => Promise<void> | void;
}

const SCOPE_TITLES: Record<Scope, string> = { mine: 'My tickets', team: 'Team tickets', all: 'All open' };

export const ALL_STATUSES = 'All statuses';

const ACTIONS: FilterItem[] = [
  {
    id: 'create',
    kind: 'action',
    label: 'Create ticket…',
    run: (actions) => actions.createIssue(),
  },
  {
    id: 'search',
    kind: 'action',
    label: 'Search tickets…',
    run: async (actions) => {
      const text = await askText({ title: 'Search tickets', placeholder: 'words in the summary' });
      if (!text) return;
      tuiStore.setStatusFilter(null);
      await actions.loadIssues({ label: `search "${text}"`, jql: searchJql(getSnapshot().project, text) });
    },
  },
  {
    id: 'ticket',
    kind: 'action',
    label: 'Open a ticket…',
    run: async (actions) => {
      const typed = await askText({ title: 'Open ticket', placeholder: `number (92) or key (${getSnapshot().project || 'ABC'}-92)` });
      if (!typed) return;
      const key = resolveIssueKey(typed, getSnapshot().project);
      if (!key) {
        tuiStore.log('warn', `"${typed}" is not a ticket number or key`);
        return;
      }
      await actions.ticketMenu(key);
    },
  },
  { id: 'board', kind: 'action', label: 'Board view', run: (actions) => actions.goToBoard() },
  { id: 'project', kind: 'action', label: 'Switch project…', run: (actions) => actions.switchProject() },
  { id: 'help', kind: 'action', label: 'Help', run: (actions) => COMMANDS.find((c) => c.id === 'help')!.run(actions, '') },
  { id: 'quit', kind: 'action', label: 'Quit', run: (actions) => actions.quit() },
];

function countIn(state: TuiState, statuses: string[]): number {
  const wanted = new Set(statuses.map((s) => s.toLowerCase()));
  return state.issues.filter((i) => wanted.has(i.status.toLowerCase())).length;
}

/** Status rows: the board's columns holding open statuses, or the statuses present in the list when there is no board. */
function statusItems(state: TuiState): FilterItem[] {
  const open = new Set(state.board?.openStatuses.map((s) => s.toLowerCase()) ?? []);
  const groups = state.board
    ? state.board.columns
        .map((c) => ({ name: c.name, statuses: c.statuses.filter((s) => open.has(s.toLowerCase())) }))
        .filter((c) => c.statuses.length > 0)
    : groupByStatus(state.issues).map((g) => ({ name: g.status, statuses: [g.status] }));
  return [
    {
      id: 'status:all',
      kind: 'status',
      label: ALL_STATUSES,
      count: state.issues.length,
      active: state.statusFilter === null,
      run: () => tuiStore.setStatusFilter(null),
    },
    ...groups.map((g) => ({
      id: `status:${g.name}`,
      kind: 'status' as const,
      label: g.name,
      count: countIn(state, g.statuses),
      active: state.statusFilter?.toLowerCase() === g.name.toLowerCase(),
      run: () => tuiStore.setStatusFilter(g.name),
    })),
  ];
}

/** The left pane, top to bottom: scope, statuses (with counts from the loaded scope), actions. */
export function buildFilterItems(state: TuiState): FilterItem[] {
  const scopeLoaded = (scope: Scope) => state.query?.label === SCOPE_LABELS[scope];
  return [
    { id: 'h:scope', kind: 'heading', label: 'Scope' },
    ...SCOPES.map((scope) => ({
      id: `scope:${scope}`,
      kind: 'scope' as const,
      label: SCOPE_TITLES[scope],
      count: scopeLoaded(scope) ? state.issues.length : undefined,
      active: scopeLoaded(scope),
      run: async (actions: TuiActions) => {
        tuiStore.setStatusFilter(null);
        await actions.selectScope(scope);
      },
    })),
    { id: 'h:status', kind: 'heading', label: 'Status' },
    ...statusItems(state),
    { id: 'h:actions', kind: 'heading', label: 'Actions' },
    ...ACTIONS,
  ];
}

/** Next selectable index from `from` in `direction`, wrapping and skipping headings. */
export function stepIndex(items: FilterItem[], from: number, direction: 1 | -1): number {
  if (items.length === 0) return 0;
  let index = from;
  for (let i = 0; i < items.length; i++) {
    index = (index + direction + items.length) % items.length;
    if (items[index].kind !== 'heading') return index;
  }
  return from;
}

/** First selectable index at or after `index`. */
export function clampIndex(items: FilterItem[], index: number): number {
  const start = Math.max(0, Math.min(index, items.length - 1));
  if (items[start] && items[start].kind !== 'heading') return start;
  return stepIndex(items, start, 1);
}
