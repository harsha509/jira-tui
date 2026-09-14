import { beforeEach, describe, expect, test } from 'vitest';
import { completeCommand, executeLine, matchCommands, type TuiActions } from '../src/tui/commands.js';
import { getSnapshot, tuiStore } from '../src/tui/store.js';
import type { Issue } from '../src/jira/types.js';

function issue(key: string): Issue {
  return { key, summary: `Summary ${key}`, status: 'In Dev', assignee: null, type: 'Bug', priority: null, updated: '2026-09-11T11:06:10.144+0530' };
}

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

beforeEach(() => {
  tuiStore.reset();
  tuiStore.setProject('A2A', null);
});

describe('plain lines', () => {
  test('a bare number views PROJECT-n', async () => {
    const { actions, calls } = spyActions();
    await executeLine('92', actions);
    expect(calls).toEqual([{ action: 'viewIssue', args: ['A2A-92'] }]);
  });

  test('a full key is upper-cased and viewed', async () => {
    const { actions, calls } = spyActions();
    await executeLine('a2a-7', actions);
    expect(calls).toEqual([{ action: 'viewIssue', args: ['A2A-7'] }]);
  });

  test('anything else searches summaries', async () => {
    const { actions, calls } = spyActions();
    await executeLine('login button', actions);
    expect(calls).toEqual([
      {
        action: 'loadIssues',
        args: [
          {
            label: 'search "login button"',
            jql: 'project = A2A AND summary ~ "login button" ORDER BY updated DESC',
          },
        ],
      },
    ]);
  });

  test('quotes and backslashes in search text are escaped', async () => {
    const { actions, calls } = spyActions();
    await executeLine('say "hi" \\ bye', actions);
    const query = calls[0].args[0] as { jql: string };
    expect(query.jql).toContain('summary ~ "say \\"hi\\" \\\\ bye"');
  });

  test('an empty line does nothing', async () => {
    const { actions, calls } = spyActions();
    await executeLine('   ', actions);
    expect(calls).toEqual([]);
  });
});

describe('slash commands', () => {
  test('/move resolves the key and passes the target', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/move 92 In Dev', actions);
    expect(calls).toEqual([{ action: 'moveIssue', args: ['A2A-92', 'In Dev'] }]);
  });

  test('/move strips surrounding quotes from the target', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/move A2A-92 "ready for qa"', actions);
    expect(calls).toEqual([{ action: 'moveIssue', args: ['A2A-92', 'ready for qa'] }]);
  });

  test('/move without a target asks the action to open a picker', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/move 92', actions);
    expect(calls).toEqual([{ action: 'moveIssue', args: ['A2A-92', undefined] }]);
  });

  test('/assign without a person opens a picker, and accepts me/none/email', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/assign 92', actions);
    await executeLine('/assign 92 me', actions);
    await executeLine('/assign 92 none', actions);
    await executeLine('/assign 92 sai@x.com', actions);
    expect(calls).toEqual([
      { action: 'assignIssue', args: ['A2A-92', undefined] },
      { action: 'assignIssue', args: ['A2A-92', 'me'] },
      { action: 'assignIssue', args: ['A2A-92', 'none'] },
      { action: 'assignIssue', args: ['A2A-92', 'sai@x.com'] },
    ]);
  });

  test('/comment without text opens a prompt', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/comment 92 hello world', actions);
    await executeLine('/comment 92', actions);
    expect(calls).toEqual([
      { action: 'commentIssue', args: ['A2A-92', 'hello world'] },
      { action: 'commentIssue', args: ['A2A-92', undefined] },
    ]);
  });

  test('/create is guided for whatever is missing', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/create bug Login fails on Safari', actions);
    await executeLine('/create task', actions);
    await executeLine('/create', actions);
    await executeLine('/create fix the widget', actions);
    expect(calls).toEqual([
      { action: 'createIssue', args: ['Bug', 'Login fails on Safari'] },
      { action: 'createIssue', args: ['Task', undefined] },
      { action: 'createIssue', args: [undefined, undefined] },
      { action: 'createIssue', args: [undefined, 'fix the widget'] },
    ]);
  });

  test('without a key, ticket commands act on the selected ticket', async () => {
    tuiStore.setIssues([issue('A2A-5'), issue('A2A-6')]);
    tuiStore.setIssuesSelected(1);
    const { actions, calls } = spyActions();
    await executeLine('/move In Dev', actions);
    await executeLine('/assign me', actions);
    await executeLine('/comment looks good', actions);
    await executeLine('/view', actions);
    await executeLine('/ticket', actions);
    await executeLine('/open', actions);
    expect(calls).toEqual([
      { action: 'moveIssue', args: ['A2A-6', 'In Dev'] },
      { action: 'assignIssue', args: ['A2A-6', 'me'] },
      { action: 'commentIssue', args: ['A2A-6', 'looks good'] },
      { action: 'viewIssue', args: ['A2A-6'] },
      { action: 'ticketMenu', args: ['A2A-6'] },
      { action: 'openInBrowser', args: ['A2A-6'] },
    ]);
  });

  test('without a key or a selection, ticket commands explain themselves', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/move In Dev', actions);
    expect(calls).toEqual([]);
    expect(getSnapshot().paletteError).toBe('Usage: /move [key] [status] — or select a ticket in the list first');
    await executeLine('/view hello', actions);
    expect(calls).toEqual([]);
    expect(getSnapshot().paletteError).toBe('Usage: /view [key] — or select a ticket in the list first');
  });

  test('/view with text after a key is a usage error', async () => {
    tuiStore.setIssues([issue('A2A-5')]);
    const { actions, calls } = spyActions();
    await executeLine('/view 5 extra', actions);
    expect(calls).toEqual([]);
    expect(getSnapshot().paletteError).toMatch(/^Usage: \/view/);
  });

  test('/list team builds the scoped JQL and records the scope', async () => {
    tuiStore.setProject('A2A', 'assignee in ("a@x.com","b@x.com")');
    const { actions, calls } = spyActions();
    await executeLine('/list team', actions);
    expect(getSnapshot().scope).toBe('team');
    expect(calls).toEqual([
      {
        action: 'loadIssues',
        args: [
          {
            label: 'team open tickets',
            jql: 'project = A2A AND status != Done AND (assignee in ("a@x.com","b@x.com")) ORDER BY updated DESC',
          },
        ],
      },
    ]);
  });

  test('/list uses the board statuses once a board is known', async () => {
    tuiStore.setBoard({ id: 1, name: 'B', columns: [], openStatuses: ['To Do', 'In Dev'] });
    const { actions, calls } = spyActions();
    await executeLine('/list all', actions);
    expect((calls[0].args[0] as { jql: string }).jql).toBe('project = A2A AND status in ("To Do", "In Dev") ORDER BY updated DESC');
  });

  test('/project switches by key, opens a picker without one, and rejects junk', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/project abc', actions);
    await executeLine('/project', actions);
    await executeLine('/project a b', actions);
    expect(calls).toEqual([
      { action: 'switchProject', args: ['ABC'] },
      { action: 'switchProject', args: [undefined] },
    ]);
    expect(getSnapshot().paletteError).toBe('Usage: /project [KEY]');
  });

  test('/team sets the team for the session; bare /team reports it', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/team a@x.com, b@x.com', actions);
    expect(calls).toEqual([{ action: 'setTeam', args: ['a@x.com, b@x.com'] }]);
    await executeLine('/team', actions);
    expect(calls).toHaveLength(1);
    expect(getSnapshot().transcript.at(-1)?.text).toBe('No team set');
  });

  test('/list with a bad scope is a usage error', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/list nope', actions);
    expect(calls).toEqual([]);
    expect(getSnapshot().paletteError).toBe('Usage: /list mine | team | all');
  });

  test('/jql passes the query through verbatim', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/jql assignee = currentUser() AND status = "In Dev"', actions);
    expect(calls).toEqual([
      {
        action: 'loadIssues',
        args: [
          {
            label: 'jql: assignee = currentUser() AND status = "In Dev"',
            jql: 'assignee = currentUser() AND status = "In Dev"',
          },
        ],
      },
    ]);
  });

  test('an unknown command is reported inline', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/frobnicate now', actions);
    expect(calls).toEqual([]);
    expect(getSnapshot().paletteError).toBe('Unknown command: /frobnicate — try /help');
  });

  test('a unique prefix and an alias both dispatch', async () => {
    const { actions, calls } = spyActions();
    await executeLine('/bo', actions);
    await executeLine('/q', actions);
    expect(calls).toEqual([
      { action: 'goToBoard', args: [] },
      { action: 'quit', args: [] },
    ]);
  });

  test('/help opens the viewer with every command', async () => {
    const { actions } = spyActions();
    await executeLine('/help', actions);
    const { viewerOpen, viewerLines } = getSnapshot();
    expect(viewerOpen).toBe(true);
    for (const name of ['/list', '/move', '/assign', '/comment', '/create', '/board', '/quit']) {
      expect(viewerLines.some((line) => line.startsWith(name))).toBe(true);
    }
  });
});

describe('completion', () => {
  test('a unique prefix completes with a trailing space', () => {
    expect(completeCommand('/vi')).toBe('/view ');
    expect(completeCommand('/sc')).toBe('/scope ');
  });

  test('an ambiguous prefix completes only as far as every match agrees', () => {
    expect(completeCommand('/s')).toBeNull();
    expect(completeCommand('/cl')).toBe('/clear-log ');
  });

  test('arguments and non-commands are left alone', () => {
    expect(completeCommand('/view 9')).toBeNull();
    expect(completeCommand('92')).toBeNull();
    expect(completeCommand('/zzz')).toBeNull();
  });

  test('matchCommands filters by name or alias prefix', () => {
    expect(matchCommands('/c').map((c) => c.name)).toEqual(['/comment', '/create', '/clear-log']);
    expect(matchCommands('/t').map((c) => c.name)).toEqual(['/ticket', '/team']);
    expect(matchCommands('/ls').map((c) => c.name)).toEqual(['/list']);
    expect(matchCommands('/').length).toBeGreaterThan(10);
  });
});
