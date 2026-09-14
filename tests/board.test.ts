import { describe, expect, test } from 'vitest';
import { buildColumns, chooseBoard, loadBoard, openStatusesOf } from '../src/jira/board.js';
import type { JiraClient, ProjectStatus } from '../src/jira/client.js';
import { openStatusClause, scopeJql } from '../src/jira/jql.js';
import { boardGroups } from '../src/tui/issue-format.js';
import type { Issue } from '../src/jira/types.js';

const STATUSES: ProjectStatus[] = [
  { id: '1', name: 'To Do', category: 'new' },
  { id: '2', name: 'In Dev', category: 'indeterminate' },
  { id: '3', name: 'IN Review', category: 'indeterminate' },
  { id: '4', name: 'Done', category: 'done' },
];

const CONFIG_COLUMNS = [
  { name: 'To Do', statusIds: ['1'] },
  { name: 'In Progress', statusIds: ['999'] },
  { name: 'Done', statusIds: ['4'] },
  { name: 'Review', statusIds: ['3', '2'] },
];

function issue(key: string, status: string): Issue {
  return { key, status, summary: key, assignee: null, type: 'Bug', priority: null, updated: '2026-09-11T11:06:10.144+0530' };
}

describe('buildColumns', () => {
  test('resolves status ids to names in board order and drops columns with no known status', () => {
    expect(buildColumns(CONFIG_COLUMNS, STATUSES)).toEqual([
      { name: 'To Do', statuses: ['To Do'] },
      { name: 'Done', statuses: ['Done'] },
      { name: 'Review', statuses: ['IN Review', 'In Dev'] },
    ]);
  });

  test('is empty when nothing maps', () => {
    expect(buildColumns(CONFIG_COLUMNS, [])).toEqual([]);
  });
});

describe('openStatusesOf', () => {
  test('keeps board statuses whose category is not done, in column order', () => {
    const columns = buildColumns(CONFIG_COLUMNS, STATUSES);
    expect(openStatusesOf(columns, STATUSES)).toEqual(['To Do', 'IN Review', 'In Dev']);
  });
});

describe('chooseBoard', () => {
  const boards = [
    { id: 4668, name: 'Kanban', type: 'kanban' },
    { id: 4672, name: 'A2A board', type: 'simple' },
  ];

  test('prefers the configured id, then the simple board, then the first', () => {
    expect(chooseBoard(boards, '4668')?.id).toBe(4668);
    expect(chooseBoard(boards, null)?.id).toBe(4672);
    expect(chooseBoard(boards, '1')?.id).toBe(4672);
    expect(chooseBoard([boards[0]], null)?.id).toBe(4668);
    expect(chooseBoard([], '4672')).toBeUndefined();
  });
});

describe('loadBoard', () => {
  function fakeClient(boards: Array<{ id: number; name: string; type: string }>) {
    const calls: string[] = [];
    const client = {
      boardsForProject: async (p: string) => {
        calls.push(`boards ${p}`);
        return boards;
      },
      boardConfig: async (id: number) => {
        calls.push(`config ${id}`);
        return { name: 'Cfg name', columns: CONFIG_COLUMNS };
      },
      projectStatuses: async (p: string) => {
        calls.push(`statuses ${p}`);
        return STATUSES;
      },
    } as unknown as JiraClient;
    return { client, calls };
  }

  test('reads the chosen board and computes columns and open statuses', async () => {
    const { client, calls } = fakeClient([{ id: 7, name: 'B', type: 'simple' }]);
    await expect(loadBoard(client, 'A2A', null)).resolves.toEqual({
      id: 7,
      name: 'Cfg name',
      columns: buildColumns(CONFIG_COLUMNS, STATUSES),
      openStatuses: ['To Do', 'IN Review', 'In Dev'],
    });
    expect(calls).toEqual(['boards A2A', 'config 7', 'statuses A2A']);
  });

  test('resolves null when the project has no board, without further calls', async () => {
    const { client, calls } = fakeClient([]);
    await expect(loadBoard(client, 'A2A', null)).resolves.toBeNull();
    expect(calls).toEqual(['boards A2A']);
  });

  test('propagates an API failure', async () => {
    const client = {
      boardsForProject: async () => {
        throw new Error('403');
      },
    } as unknown as JiraClient;
    await expect(loadBoard(client, 'A2A', null)).rejects.toThrow('403');
  });
});

describe('status clause in JQL', () => {
  test('lists the board statuses, escaped, or falls back to != Done', () => {
    expect(openStatusClause([])).toBe('status != Done');
    expect(openStatusClause(['To Do', 'ready "x"'])).toBe('status in ("To Do", "ready \\"x\\"")');
    expect(scopeJql('mine', 'A2A', null, ['To Do', 'In Dev'])).toBe(
      'project = A2A AND status in ("To Do", "In Dev") AND assignee = currentUser() ORDER BY updated DESC'
    );
    expect(scopeJql('all', 'A2A', null)).toBe('project = A2A AND status != Done ORDER BY updated DESC');
  });
});

describe('boardGroups', () => {
  test('one group per column in board order, empty columns kept, leftovers grouped after', () => {
    const columns = buildColumns(CONFIG_COLUMNS, STATUSES);
    const groups = boardGroups(
      [issue('A2A-1', 'in dev'), issue('A2A-2', 'To Do'), issue('A2A-3', 'Mystery'), issue('A2A-4', 'IN Review')],
      columns
    );
    expect(groups.map((g) => [g.status, g.issues.map((i) => i.key)])).toEqual([
      ['To Do', ['A2A-2']],
      ['Done', []],
      ['Review', ['A2A-1', 'A2A-4']],
      ['Mystery', ['A2A-3']],
    ]);
  });

  test('no columns means plain status grouping', () => {
    expect(boardGroups([issue('A2A-1', 'To Do')], []).map((g) => g.status)).toEqual(['To Do']);
  });
});
