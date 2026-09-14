import { beforeEach, describe, expect, test } from 'vitest';
import { buildFilterItems, clampIndex, stepIndex } from '../src/tui/filters.js';
import type { TuiActions } from '../src/tui/commands.js';
import { getSnapshot, selectedIssue, tuiStore, visibleIssues } from '../src/tui/store.js';
import type { Issue } from '../src/jira/types.js';
import { contentRows, filterRows, ticketRows, DETAIL_ROWS, MIN_MAIN_ROWS } from '../src/tui/layout.js';

function spyActions() {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const actions = new Proxy(
    {},
    {
      get:
        (_target, prop: string) =>
        async (...args: unknown[]) => {
          calls.push({ action: prop, args });
        },
    }
  ) as TuiActions;
  return { actions, calls };
}

function issue(key: string, status: string): Issue {
  return { key, status, summary: key, assignee: null, type: 'Bug', priority: null, updated: '2026-09-11T11:06:10.144+0530' };
}

const BOARD = {
  id: 1,
  name: 'A2A board',
  columns: [
    { name: 'To Do', statuses: ['To Do'] },
    { name: 'Done', statuses: ['Done'] },
    { name: 'Review', statuses: ['IN Review', 'In Dev'] },
  ],
  openStatuses: ['To Do', 'IN Review', 'In Dev'],
};

function answerPrompt(text: string | null): void {
  const modal = getSnapshot().modal;
  if (!modal || modal.kind !== 'prompt') throw new Error('no prompt open');
  if (text === null) modal.onCancel();
  else modal.onSubmit(text);
}

beforeEach(() => {
  tuiStore.reset();
  tuiStore.setProject('A2A', null);
});

describe('buildFilterItems', () => {
  test('lists scope, board statuses with counts (Done column excluded) and actions, with headings between', () => {
    tuiStore.setBoard(BOARD);
    tuiStore.setIssuesLoading({ label: 'all open tickets', jql: 'x' });
    tuiStore.setIssues([issue('A2A-1', 'To Do'), issue('A2A-2', 'in dev'), issue('A2A-3', 'IN Review')]);
    const items = buildFilterItems(getSnapshot());
    expect(items.map((i) => `${i.kind}:${i.label}${i.count === undefined ? '' : `=${i.count}`}${i.active ? '*' : ''}`)).toEqual([
      'heading:Scope',
      'scope:My tickets',
      'scope:Team tickets',
      'scope:All open=3*',
      'heading:Status',
      'status:To Do=1',
      'status:Review=2',
      'heading:Actions',
      'action:Create ticket…',
      'action:Search tickets…',
      'action:Open a ticket…',
      'action:Board view',
      'action:Switch project…',
      'action:Help',
      'action:Quit',
    ]);
  });

  test('without a board the statuses come from the loaded tickets', () => {
    tuiStore.setIssues([issue('A2A-1', 'Weird'), issue('A2A-2', 'To Do')]);
    const labels = buildFilterItems(getSnapshot())
      .filter((i) => i.kind === 'status')
      .map((i) => i.label);
    expect(labels).toEqual(['To Do', 'Weird']);
  });

  test('a scope row resets the status filter and loads the scope', async () => {
    tuiStore.setStatusFilter('To Do');
    const { actions, calls } = spyActions();
    const mine = buildFilterItems(getSnapshot()).find((i) => i.id === 'scope:mine')!;
    await mine.run!(actions);
    expect(calls).toEqual([{ action: 'selectScope', args: ['mine'] }]);
    expect(getSnapshot().statusFilter).toBeNull();
  });

  test('a status row narrows all open tickets by column; exactly one row is applied at a time', async () => {
    tuiStore.setBoard(BOARD);
    tuiStore.setIssuesLoading({ label: 'all open tickets', jql: 'x' });
    tuiStore.setIssues([issue('A2A-1', 'To Do'), issue('A2A-2', 'in dev'), issue('A2A-3', 'IN Review')]);
    tuiStore.setIssuesSelected(2);
    const { actions, calls } = spyActions();
    await buildFilterItems(getSnapshot()).find((i) => i.id === 'status:Review')!.run!(actions);
    expect(calls).toEqual([]);
    expect(visibleIssues().map((i) => i.key)).toEqual(['A2A-2', 'A2A-3']);
    expect(getSnapshot().issuesSelected).toBe(0);
    expect(selectedIssue()?.key).toBe('A2A-2');
    const applied = buildFilterItems(getSnapshot()).filter((i) => i.active);
    expect(applied.map((i) => i.id)).toEqual(['status:Review']);
    await buildFilterItems(getSnapshot()).find((i) => i.id === 'scope:all')!.run!(actions);
    expect(calls).toEqual([{ action: 'selectScope', args: ['all'] }]);
    expect(visibleIssues()).toHaveLength(3);
    expect(buildFilterItems(getSnapshot()).filter((i) => i.active).map((i) => i.id)).toEqual(['scope:all']);
  });

  test('a status row loads all open tickets first when another scope is showing, and hides counts until then', async () => {
    tuiStore.setBoard(BOARD);
    tuiStore.setIssuesLoading({ label: 'my open tickets', jql: 'x' });
    tuiStore.setIssues([issue('A2A-1', 'To Do')]);
    const todo = buildFilterItems(getSnapshot()).find((i) => i.id === 'status:To Do')!;
    expect(todo.count).toBeUndefined();
    const { actions, calls } = spyActions();
    await todo.run!(actions);
    expect(calls).toEqual([{ action: 'selectScope', args: ['all'] }]);
    expect(getSnapshot().statusFilter).toBe('To Do');
  });

  test('search and open-ticket actions prompt, then act', async () => {
    const { actions, calls } = spyActions();
    const search = buildFilterItems(getSnapshot()).find((i) => i.id === 'search')!;
    const pending = search.run!(actions);
    answerPrompt('login');
    await pending;
    const open = buildFilterItems(getSnapshot()).find((i) => i.id === 'ticket')!;
    const pending2 = open.run!(actions);
    answerPrompt('92');
    await pending2;
    expect(calls).toEqual([
      { action: 'loadIssues', args: [{ label: 'search "login"', jql: 'project = A2A AND summary ~ "login*" ORDER BY updated DESC' }] },
      { action: 'ticketMenu', args: ['A2A-92'] },
    ]);
  });

  test('the other actions map straight to TuiActions', async () => {
    const { actions, calls } = spyActions();
    for (const id of ['create', 'board', 'project', 'quit']) {
      await buildFilterItems(getSnapshot()).find((i) => i.id === id)!.run!(actions);
    }
    expect(calls.map((c) => c.action)).toEqual(['createIssue', 'goToBoard', 'switchProject', 'quit']);
  });
});

describe('cursor stepping', () => {
  test('skips headings in both directions and wraps', () => {
    tuiStore.setIssues([issue('A2A-1', 'To Do')]);
    const items = buildFilterItems(getSnapshot());
    expect(items[0].kind).toBe('heading');
    expect(clampIndex(items, 0)).toBe(1);
    expect(stepIndex(items, 1, -1)).toBe(items.length - 1);
    expect(items[stepIndex(items, items.length - 1, 1)].id).toBe('scope:mine');
    const statusHeading = items.findIndex((i) => i.id === 'h:status');
    expect(stepIndex(items, statusHeading - 1, 1)).toBe(statusHeading + 1);
  });
});

describe('layout', () => {
  test('the filter pane takes the left column minus the prompt, and tickets leave room for the detail strip', () => {
    expect(filterRows(40, false, 1)).toBe(contentRows(40) - 3 - 1 - 3 - 1);
    expect(filterRows(40, true, 1)).toBeLessThan(filterRows(40, false, 1));
    expect(ticketRows(40)).toBe(contentRows(40) - 4 - 1 - DETAIL_ROWS);
    expect(filterRows(MIN_MAIN_ROWS, false, 1)).toBeGreaterThanOrEqual(3);
    expect(ticketRows(MIN_MAIN_ROWS)).toBeGreaterThanOrEqual(1);
  });
});
