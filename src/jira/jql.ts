export type Scope = 'mine' | 'team' | 'all';

export const SCOPES: Scope[] = ['mine', 'team', 'all'];

export const SCOPE_LABELS: Record<Scope, string> = {
  mine: 'my open tickets',
  team: 'team open tickets',
  all: 'all open tickets',
};

export function escapeJql(text: string): string {
  return text.replace(/["\\]/g, '\\$&');
}

/** `status in (...)` for the board's open statuses, or `status != Done` when no board is known. */
export function openStatusClause(openStatuses: string[]): string {
  if (openStatuses.length === 0) return 'status != Done';
  return `status in (${openStatuses.map((s) => `"${escapeJql(s)}"`).join(', ')})`;
}

/** Open issues of the project, narrowed to me or the team. */
export function scopeJql(scope: Scope, project: string, teamJql: string | null, openStatuses: string[] = []): string {
  const who =
    scope === 'mine'
      ? ' AND assignee = currentUser()'
      : scope === 'team' && teamJql
        ? ` AND (${teamJql})`
        : '';
  return `project = ${project} AND ${openStatusClause(openStatuses)}${who} ORDER BY updated DESC`;
}

export function searchJql(project: string, text: string): string {
  return `project = ${project} AND summary ~ "${escapeJql(text)}" ORDER BY updated DESC`;
}
