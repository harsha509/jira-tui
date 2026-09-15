import { describe, expect, test } from 'vitest';
import { assigneeItems, groupAssignees } from '../src/tui/assignee.js';
import type { JiraUser } from '../src/jira/types.js';

const ASHA: JiraUser = { accountId: 'a1', displayName: 'Asha R', emailAddress: 'a@x.com' };
const BHARGAV: JiraUser = { accountId: 'b1', displayName: 'Bhargav T' };
const CHANDRA: JiraUser = { accountId: 'c1', displayName: 'Chandra M', emailAddress: 'c@x.com' };
const USERS = [ASHA, BHARGAV, CHANDRA];

const shape = (project = 'A2A', team = new Set(['a1', 'b1']), users = USERS) =>
  assigneeItems(users, team, project, 'me@x.com').map((i) => `${i.separator ? '--' : ''}${i.label}`);

describe('assigneeItems', () => {
  test('team members come first, everyone else in the project below, each under its own rule', () => {
    expect(shape()).toEqual(['me', 'unassign', '--Team', 'Asha R', 'Bhargav T', '--Everyone in A2A', 'Chandra M']);
  });

  test('a team member Jira hides the email of is still grouped, by accountId', () => {
    const items = assigneeItems(USERS, new Set(['b1']), 'A2A');
    expect(items.map((i) => i.label)).toEqual(['me', 'unassign', 'Team', 'Bhargav T', 'Everyone in A2A', 'Asha R', 'Chandra M']);
    expect(items.find((i) => i.label === 'Bhargav T')?.hint).toBeUndefined();
  });

  test('no team match leaves the plain list — no rules, nobody hidden', () => {
    expect(shape('A2A', new Set())).toEqual(['me', 'unassign', 'Asha R', 'Bhargav T', 'Chandra M']);
  });

  test('a team that covers everyone assignable skips the second rule', () => {
    expect(shape('A2A', new Set(['a1', 'b1', 'c1']))).toEqual(['me', 'unassign', '--Team', 'Asha R', 'Bhargav T', 'Chandra M']);
  });

  test('an empty assignable list is still just me / unassign', () => {
    expect(shape('A2A', new Set(['a1']), [])).toEqual(['me', 'unassign']);
  });

  test('groupAssignees keeps Jira order within each group', () => {
    const { team, everyone } = groupAssignees(USERS, new Set(['c1', 'a1']));
    expect(team.map((u) => u.accountId)).toEqual(['a1', 'c1']);
    expect(everyone.map((u) => u.accountId)).toEqual(['b1']);
  });
});
