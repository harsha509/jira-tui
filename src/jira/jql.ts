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

/** Each plain word of 2+ characters gets a trailing wildcard so "architec" finds "architecture". */
export function searchTerms(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => (/^[\p{L}\p{N}_-]{2,}$/u.test(word) ? `${word}*` : word))
    .join(' ');
}

/** Summary search with partial-word matching; `key`, when given, is matched too so a ticket number finds its ticket. */
export function searchJql(project: string, text: string, key: string | null = null): string {
  const summary = `summary ~ "${escapeJql(searchTerms(text))}"`;
  const where = key ? `(${summary} OR key = ${key})` : summary;
  return `project = ${project} AND ${where} ORDER BY updated DESC`;
}
