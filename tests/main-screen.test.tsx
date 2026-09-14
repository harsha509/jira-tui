import { beforeEach, describe, expect, test } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { MainScreen } from '../src/tui/screens/MainScreen.js';
import { CommandPalette } from '../src/tui/components/CommandPalette.js';
import { OutputDialog, wrapLine } from '../src/tui/components/OutputDialog.js';
import { tuiStore } from '../src/tui/store.js';
import { resetHistory } from '../src/tui/input-history.js';
import type { TuiActions } from '../src/tui/commands.js';
import type { Issue } from '../src/jira/types.js';

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const ESC = String.fromCharCode(27);
const ENTER = '\r';
const TAB = '\t';
const SHIFT_TAB = `${ESC}[Z`;
const DOWN = `${ESC}[B`;
const RIGHT = `${ESC}[C`;
const LEFT = `${ESC}[D`;
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

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

function issue(key: string, summary: string): Issue {
  return { key, summary, status: 'In Dev', assignee: 'Sri', type: 'Bug', priority: null, updated: '2026-09-11T11:06:10.144+0530' };
}

function plain(frame: string | undefined): string {
  return (frame ?? '').replace(ANSI, '');
}

beforeEach(() => {
  tuiStore.reset();
  resetHistory();
  tuiStore.setProject('A2A', null);
  tuiStore.goTo('main');
});

describe('MainScreen', () => {
  test('shows the filters with a cursor, the prompt, the ticket panel and the detail strip', () => {
    const { actions } = spyActions();
    const { lastFrame } = render(<MainScreen actions={actions} />);
    const frame = plain(lastFrame());
    expect(frame).toContain('Filters');
    expect(frame).toContain('❯ ○ My tickets');
    expect(frame).toContain('Tickets');
    expect(frame).toContain('/command, ticket no, or text');
    expect(frame).toContain('Select a ticket to see its details here.');
  });

  test('↑↓ move the cursor over selectable rows and Enter applies a filter, then the cursor moves to the tickets', async () => {
    tuiStore.setIssuesLoading({ label: 'all open tickets', jql: 'x' });
    tuiStore.setIssues([issue('A2A-1', 'First'), issue('A2A-2', 'Second')]);
    const { actions, calls } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write(DOWN);
    await settle();
    stdin.write(DOWN);
    await settle();
    expect(plain(lastFrame())).toContain('❯ ● All open');
    stdin.write(DOWN);
    await settle();
    expect(plain(lastFrame())).toContain('❯ ● All statuses');
    stdin.write(DOWN);
    await settle();
    expect(plain(lastFrame())).toContain('❯ ○ In Dev');
    stdin.write(ENTER);
    await settle();
    expect(calls).toEqual([]);
    expect(plain(lastFrame())).toContain('enter actions');
    expect(plain(lastFrame())).toContain('all open tickets · In Dev · 2 tickets');
    expect(plain(lastFrame())).toContain('A2A-1');
  });

  test('→ moves into the tickets and ← comes back to the filters; the detail strip follows the cursor', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First'), issue('A2A-2', 'Second')]);
    const { actions } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write(RIGHT);
    await settle();
    expect(plain(lastFrame())).toContain('↑↓ · enter actions');
    stdin.write(DOWN);
    await settle();
    expect(plain(lastFrame())).toMatch(/A2A-2 .*\n.*Second/);
    stdin.write(LEFT);
    await settle();
    expect(plain(lastFrame())).not.toContain('↑↓ · enter actions');
    expect(plain(lastFrame())).toContain('↑↓ · enter');
  });

  test('typing a ticket number and Enter views it', async () => {
    const { actions, calls } = spyActions();
    const { stdin } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write('92');
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(calls).toEqual([{ action: 'viewIssue', args: ['A2A-92'] }]);
  });

  test('tab completes a unique command prefix', async () => {
    const { actions } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write('/vi');
    await settle();
    stdin.write(TAB);
    await settle();
    expect(plain(lastFrame())).toContain('/view ');
  });

  test('an unknown command is reported under the prompt', async () => {
    const { actions } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write('/nope');
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(plain(lastFrame())).toContain('Unknown command: /nope');
  });

  test('shift+tab focuses the issue list; arrows move and Enter opens the action menu', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First'), issue('A2A-2', 'Second')]);
    const { actions, calls } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    expect(plain(lastFrame())).toContain('A2A-1');
    stdin.write(SHIFT_TAB);
    await settle();
    expect(plain(lastFrame())).toContain('↑↓ · enter actions');
    stdin.write(DOWN);
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(calls).toEqual([{ action: 'ticketMenu', args: ['A2A-2'] }]);
  });

  test('letter shortcuts in the issue list act on the selection', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First')]);
    const { actions, calls } = spyActions();
    const { stdin } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write(SHIFT_TAB);
    await settle();
    for (const letter of ['v', 'm', 'a', 'c', 'o']) {
      stdin.write(letter);
      await settle();
    }
    expect(calls).toEqual([
      { action: 'viewIssue', args: ['A2A-1'] },
      { action: 'moveIssue', args: ['A2A-1'] },
      { action: 'assignIssue', args: ['A2A-1'] },
      { action: 'commentIssue', args: ['A2A-1'] },
      { action: 'openInBrowser', args: ['A2A-1'] },
    ]);
  });

  test('other letters in the issue list jump back to the prompt with that letter', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First')]);
    const { actions, calls } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write(SHIFT_TAB);
    await settle();
    stdin.write('/');
    await settle();
    expect(calls).toEqual([]);
    expect(plain(lastFrame())).toContain('❯ /');
  });

  test('esc steps back: clears the prompt, then to the menu, then to the scope picker', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First')]);
    const { actions, calls } = spyActions();
    const { stdin, lastFrame } = render(<MainScreen actions={actions} />);
    await settle();
    stdin.write('abc');
    await settle();
    expect(plain(lastFrame())).toContain('❯ abc');
    stdin.write(ESC);
    await settle();
    expect(plain(lastFrame())).not.toContain('❯ abc');
    stdin.write(ESC);
    await settle();
    expect(plain(lastFrame())).toContain('Filters                  ↑↓ · enter');
    stdin.write(RIGHT);
    await settle();
    stdin.write(ESC);
    await settle();
    expect(plain(lastFrame())).toContain('Filters                  ↑↓ · enter');
    expect(calls).toEqual([]);
    stdin.write(ESC);
    await settle();
    expect(calls).toEqual([{ action: 'goToWelcome', args: [] }]);
  });

  test('the focused pane survives the screen being replaced by a dialog', async () => {
    tuiStore.setIssues([issue('A2A-1', 'First')]);
    const { actions } = spyActions();
    const first = render(<MainScreen actions={actions} />);
    await settle();
    first.stdin.write(SHIFT_TAB);
    await settle();
    expect(plain(first.lastFrame())).toContain('↑↓ · enter actions');
    first.unmount();
    const second = render(<MainScreen actions={actions} />);
    await settle();
    expect(plain(second.lastFrame())).toContain('↑↓ · enter actions');
  });

  test('renders every issue row within the panel', () => {
    tuiStore.setIssues([issue('A2A-1', 'First'), issue('A2A-2', 'Second'), issue('A2A-3', 'Third')]);
    const { actions } = spyActions();
    const { lastFrame } = render(<MainScreen actions={actions} />);
    const frame = plain(lastFrame());
    expect(frame).toContain('A2A-3');
    expect(frame).toContain('3 tickets');
  });
});

describe('CommandPalette', () => {
  function palette(overrides: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
    return (
      <CommandPalette
        width={50}
        maxCommands={8}
        query="/"
        onQueryChange={() => {}}
        onSubmit={() => {}}
        disabled={false}
        error={null}
        focused
        placeholder="Type"
        listVisible
        maxInputLines={4}
        {...overrides}
      />
    );
  }

  function rowsOf(element: React.ReactElement): string[] {
    const { lastFrame } = render(element);
    return plain(lastFrame()).replace(/\n$/, '').split('\n');
  }

  test('lists commands filtered by the query', () => {
    const rows = rowsOf(palette({ query: '/mo' }));
    expect(rows.join('\n')).toContain('/move');
    expect(rows.join('\n')).not.toContain('/assign');
  });

  test('the row count does not change with the query, the error, or the list', () => {
    const quiet = rowsOf(palette()).length;
    expect(rowsOf(palette({ query: '/zzz' })).length).toBe(quiet);
    expect(rowsOf(palette({ error: 'Unknown command' })).length).toBe(quiet);
    expect(rowsOf(palette({ listVisible: false })).length).toBe(quiet - 8 - 5);
  });

  test('a very long line is clipped at the input budget', () => {
    const one = rowsOf(palette({ listVisible: false, query: '' })).length;
    expect(rowsOf(palette({ listVisible: false, query: 'x'.repeat(5000) })).length).toBe(one + 3);
  });
});

describe('OutputDialog', () => {
  test('wrapLine keeps a hanging indent and breaks unbreakable words', () => {
    expect(wrapLine('  alpha beta gamma', 12)).toEqual(['  alpha', '    beta', '    gamma']);
    expect(wrapLine('x'.repeat(25), 10)).toEqual(['xxxxxxxx', '  xxxxxxxx', '  xxxxxxxx', '  x']);
    expect(wrapLine('', 10)).toEqual(['']);
  });

  test('shows the body and advertises only the keys it was given', () => {
    const { lastFrame } = render(<OutputDialog title="A2A-1  Hello" lines={['Status:    In Dev']} onClose={() => {}} />);
    expect(plain(lastFrame())).toContain('Status:    In Dev');
    expect(plain(lastFrame())).not.toContain('o open');
    const keyed = render(
      <OutputDialog title="t" lines={[]} keys={[{ key: 'o', label: 'open', run: () => {} }]} onClose={() => {}} />
    );
    expect(plain(keyed.lastFrame())).toContain('o open');
  });

  test('a listed key runs its action; esc closes; an unlisted letter does nothing', async () => {
    let closed = 0;
    let opened = 0;
    const { stdin } = render(
      <OutputDialog title="t" lines={['x']} keys={[{ key: 'o', label: 'open', run: () => opened++ }]} onClose={() => closed++} />
    );
    await settle();
    stdin.write('o');
    await settle();
    stdin.write('z');
    await settle();
    stdin.write(ESC);
    await settle();
    expect(opened).toBe(1);
    expect(closed).toBe(1);
  });
});
