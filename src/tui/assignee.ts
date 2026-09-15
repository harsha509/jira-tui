import type { JiraUser } from '../jira/types.js';
import type { SelectItem } from './store.js';

export interface AssigneeGroups {
  /** Assignable users whose accountId is in `teamIds`, in the order Jira returned them. */
  team: JiraUser[];
  everyone: JiraUser[];
}

function row(user: JiraUser): SelectItem {
  return { id: user.accountId, label: user.displayName, hint: user.emailAddress || undefined };
}

/** Split the assignable users into team members and the rest. */
export function groupAssignees(users: JiraUser[], teamIds: Set<string>): AssigneeGroups {
  return {
    team: users.filter((u) => teamIds.has(u.accountId)),
    everyone: users.filter((u) => !teamIds.has(u.accountId)),
  };
}

/** me / unassign, then team members, then everyone else in `project`; the group rules appear only when a team matched. */
export function assigneeItems(users: JiraUser[], teamIds: Set<string>, project: string, login?: string): SelectItem[] {
  const { team, everyone } = groupAssignees(users, teamIds);
  const items: SelectItem[] = [
    { id: 'me', label: 'me', hint: login },
    { id: 'none', label: 'unassign' },
  ];
  if (team.length === 0) return [...items, ...everyone.map(row)];
  items.push({ id: 'sep:team', label: 'Team', separator: true }, ...team.map(row));
  if (everyone.length > 0) {
    items.push({ id: 'sep:everyone', label: `Everyone in ${project}`, separator: true }, ...everyone.map(row));
  }
  return items;
}
