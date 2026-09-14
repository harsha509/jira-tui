import { describe, expect, test } from 'vitest';
import {
  groupByStatus,
  issueDetailLines,
  issueRow,
  matchTransition,
  relativeTime,
  resolveIssueKey,
  truncate,
} from '../src/tui/issue-format.js';
import type { Issue, IssueDetail } from '../src/jira/types.js';

function issue(key: string, status: string, summary = `Summary ${key}`, assignee: string | null = 'Sri'): Issue {
  return { key, status, summary, assignee, type: 'Bug', priority: null, updated: '2026-09-11T11:06:10.144+0530' };
}

describe('resolveIssueKey', () => {
  test('bare numbers get the project prefix', () => {
    expect(resolveIssueKey('92', 'A2A')).toBe('A2A-92');
    expect(resolveIssueKey(' 12 ', 'A2A')).toBe('A2A-12');
  });

  test('full keys pass through upper-cased', () => {
    expect(resolveIssueKey('a2a-92', 'A2A')).toBe('A2A-92');
    expect(resolveIssueKey('OTHER-5', 'A2A')).toBe('OTHER-5');
  });

  test('anything else is not a key', () => {
    for (const bad of ['', 'hello', '12abc', 'A2A-', '-5', 'A2A 5']) {
      expect(resolveIssueKey(bad, 'A2A')).toBeNull();
    }
  });
});

describe('groupByStatus', () => {
  test('orders groups by board column order, unknown statuses last alphabetically', () => {
    const groups = groupByStatus([
      issue('A2A-1', 'Done'),
      issue('A2A-2', 'zeta'),
      issue('A2A-3', 'IN Review'),
      issue('A2A-4', 'To Do'),
      issue('A2A-5', 'alpha'),
      issue('A2A-6', 'in dev'),
    ]);
    expect(groups.map((g) => g.status)).toEqual(['To Do', 'in dev', 'IN Review', 'Done', 'alpha', 'zeta']);
  });

  test('merges case variants of the same status', () => {
    const groups = groupByStatus([issue('A2A-1', 'In Dev'), issue('A2A-2', 'in dev')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].issues.map((i) => i.key)).toEqual(['A2A-1', 'A2A-2']);
  });

  test('is empty for no issues', () => {
    expect(groupByStatus([])).toEqual([]);
  });
});

describe('matchTransition', () => {
  const transitions = [
    { id: '11', name: 'To Do', to: 'To Do' },
    { id: '31', name: 'Done', to: 'Done' },
    { id: '3', name: 'Dev Done', to: 'IN Review' },
  ];

  test('matches the target status regardless of case', () => {
    expect(matchTransition(transitions, 'in review')?.id).toBe('3');
  });

  test('falls back to the transition name, then a prefix of either', () => {
    expect(matchTransition(transitions, 'dev done')?.id).toBe('3');
    expect(matchTransition(transitions, 'to')?.id).toBe('11');
    expect(matchTransition(transitions, 'dev')?.id).toBe('3');
  });

  test('prefers an exact status over a prefix of another', () => {
    expect(matchTransition(transitions, 'done')?.id).toBe('31');
  });

  test('no match and empty targets return undefined', () => {
    expect(matchTransition(transitions, 'review')).toBeUndefined();
    expect(matchTransition(transitions, '')).toBeUndefined();
    expect(matchTransition([], 'done')).toBeUndefined();
  });
});

describe('relativeTime', () => {
  test('parses JIRA offsets without a colon', () => {
    const now = Date.parse('2026-09-11T05:36:10.144Z') + 2 * 60_000;
    expect(relativeTime('2026-09-11T11:06:10.144+0530', now)).toBe('2m ago');
  });

  test('scales to hours and days, and never goes negative', () => {
    const base = Date.parse('2026-09-11T00:00:00Z');
    expect(relativeTime('2026-09-10T21:00:00Z', base)).toBe('3h ago');
    expect(relativeTime('2026-09-01T00:00:00Z', base)).toBe('10d ago');
    expect(relativeTime('2026-09-11T00:05:00Z', base)).toBe('0m ago');
  });

  test('returns unparseable input untouched', () => {
    expect(relativeTime('not a date')).toBe('not a date');
  });
});

describe('rows and truncation', () => {
  test('truncate keeps within width and marks the cut', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
    expect(truncate('abc', 1)).toBe('…');
    expect(truncate('abc', 0)).toBe('');
  });

  test('issueRow fits the width and drops the assignee when narrow', () => {
    const long = issue('A2A-1234', 'ready for deployment', 'x'.repeat(200), 'Somebody Longnamed');
    const wide = issueRow(long, 80);
    const narrow = issueRow(long, 50);
    expect(wide.length).toBeLessThanOrEqual(80);
    expect(narrow.length).toBeLessThanOrEqual(50);
    expect(wide).toContain('Somebody Long');
    expect(narrow).not.toContain('Somebody');
    expect(issueRow(issue('A2A-1', 'To Do', 'S', null), 80)).toContain('—');
  });

  test('issueDetailLines lists the fields, description and comments', () => {
    const detail: IssueDetail = {
      ...issue('A2A-90', 'In Dev'),
      reporter: 'Rep',
      created: '2026-09-11T11:06:10.144+0530',
      description: 'Broken\nbadly',
      labels: ['UI-fix', 'bug'],
      parent: 'A2A-1',
      comments: [{ author: 'Sai', created: '2026-09-11T11:06:10.144+0530', body: 'On it\nnow' }],
    };
    const lines = issueDetailLines(detail, 'https://x/browse/A2A-90');
    expect(lines[0]).toBe('Type:      Bug  (parent A2A-1)');
    expect(lines).toContain('Labels:    UI-fix, bug');
    expect(lines).toContain('URL:       https://x/browse/A2A-90');
    expect(lines).toContain('Broken');
    expect(lines).toContain('badly');
    expect(lines).toContain('Comments (1)');
    expect(lines).toContain('  On it');
    expect(lines).toContain('  now');
    expect(lines.some((l) => l.startsWith('Sai ·'))).toBe(true);
  });

  test('issueDetailLines says so when there is no description or comments', () => {
    const detail: IssueDetail = {
      ...issue('A2A-90', 'In Dev'),
      reporter: null,
      created: '2026-09-11T11:06:10.144+0530',
      description: '',
      labels: [],
      parent: null,
      comments: [],
    };
    const lines = issueDetailLines(detail, 'u');
    expect(lines).toContain('(no description)');
    expect(lines.some((l) => l.startsWith('Comments'))).toBe(false);
  });
});
