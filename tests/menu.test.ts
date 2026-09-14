import { beforeEach, describe, expect, test } from 'vitest';
import { MENU } from '../src/tui/menu.js';
import type { TuiActions } from '../src/tui/commands.js';
import { getSnapshot, tuiStore } from '../src/tui/store.js';
import { contentRows, leftLayout, paletteRows, INPUT_CHROME_ROWS, MIN_MAIN_ROWS } from '../src/tui/layout.js';

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

function item(id: string) {
  const found = MENU.find((m) => m.id === id);
  if (!found) throw new Error(`no menu item ${id}`);
  return found;
}

/** Answer the open text prompt the way a keypress would. */
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

describe('MENU', () => {
  test('lists the options in display order', () => {
    expect(MENU.map((m) => m.id)).toEqual([
      'mine',
      'team',
      'all',
      'search',
      'ticket',
      'create',
      'board',
      'project',
      'refresh',
      'help',
      'quit',
    ]);
  });

  test('scope items load a scope and want the ticket pane afterwards', async () => {
    const { actions, calls } = spyActions();
    for (const id of ['mine', 'team', 'all']) {
      expect(item(id).focusIssues).toBe(true);
      await item(id).run(actions);
    }
    expect(calls).toEqual([
      { action: 'selectScope', args: ['mine'] },
      { action: 'selectScope', args: ['team'] },
      { action: 'selectScope', args: ['all'] },
    ]);
  });

  test('search asks for text then loads a summary search; cancel loads nothing', async () => {
    const { actions, calls } = spyActions();
    const pending = item('search').run(actions);
    answerPrompt('login button');
    await pending;
    expect(calls).toEqual([
      {
        action: 'loadIssues',
        args: [{ label: 'search "login button"', jql: 'project = A2A AND summary ~ "login button" ORDER BY updated DESC' }],
      },
    ]);
    const cancelled = item('search').run(actions);
    answerPrompt(null);
    await cancelled;
    expect(calls).toHaveLength(1);
  });

  test('open a ticket resolves a number or key to the action menu, and warns on junk', async () => {
    const { actions, calls } = spyActions();
    const first = item('ticket').run(actions);
    answerPrompt('92');
    await first;
    const second = item('ticket').run(actions);
    answerPrompt('hello');
    await second;
    expect(calls).toEqual([{ action: 'ticketMenu', args: ['A2A-92'] }]);
    expect(getSnapshot().transcript.at(-1)?.kind).toBe('warn');
  });

  test('the remaining items map straight to actions', async () => {
    const { actions, calls } = spyActions();
    for (const id of ['create', 'board', 'project', 'refresh', 'quit']) await item(id).run(actions);
    expect(calls.map((c) => c.action)).toEqual(['createIssue', 'goToBoard', 'switchProject', 'refresh', 'quit']);
  });

  test('help opens the command viewer', async () => {
    const { actions } = spyActions();
    await item('help').run(actions);
    expect(getSnapshot().viewerOpen).toBe(true);
    expect(getSnapshot().viewerTitle).toBe('Commands');
  });
});

describe('leftLayout', () => {
  const items = MENU.length;

  function totalRows(termRows: number, listVisible: boolean, inputLines: number): number {
    const { menuVisible, logRows } = leftLayout(termRows, items, listVisible, inputLines);
    return menuVisible + 3 + (logRows > 0 ? 1 + logRows + 3 : 0) + 1 + paletteRows(termRows, listVisible) + INPUT_CHROME_ROWS + inputLines;
  }

  test('a tall terminal shows every item and gives the log the rest', () => {
    const { menuVisible, logRows } = leftLayout(50, items, false, 1);
    expect(menuVisible).toBe(items);
    expect(logRows).toBeGreaterThan(5);
    expect(totalRows(50, false, 1)).toBe(contentRows(50));
  });

  test('a short terminal keeps a minimal log and scrolls the menu', () => {
    const { menuVisible, logRows } = leftLayout(26, items, false, 1);
    expect(logRows).toBe(2);
    expect(menuVisible).toBeGreaterThanOrEqual(3);
    expect(menuVisible).toBeLessThan(items);
    expect(totalRows(26, false, 1)).toBe(contentRows(26));
  });

  test('at the minimum height the log disappears and the menu still fits', () => {
    const { menuVisible, logRows } = leftLayout(MIN_MAIN_ROWS, items, false, 1);
    expect(logRows).toBe(0);
    expect(menuVisible).toBeGreaterThanOrEqual(1);
    expect(totalRows(MIN_MAIN_ROWS, false, 1)).toBeLessThanOrEqual(contentRows(MIN_MAIN_ROWS));
  });

  test('the command list and a wrapped prompt borrow rows from the log, never from the frame', () => {
    const plain = leftLayout(40, items, false, 1);
    const withList = leftLayout(40, items, true, 3);
    expect(withList.logRows).toBeLessThan(plain.logRows);
    expect(totalRows(40, true, 3)).toBe(contentRows(40));
  });
});
