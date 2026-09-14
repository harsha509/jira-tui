import type { BoardColumn } from '../jira/board.js';
import type { Issue, IssueDetail, Transition } from '../jira/types.js';

/** Fallback column order when no board is known; unknown statuses sort after these. */
export const STATUS_ORDER = [
  'To Do',
  'In Dev',
  'In qa',
  'IN Review',
  'ready for qa',
  'ready for prod qa',
  'On Stage',
  'ready for deployment',
  'on prod',
  'In Progress',
  'Main',
  'Done',
];

export interface BoardGroup {
  status: string;
  issues: Issue[];
}

export function statusRank(status: string, order: string[] = STATUS_ORDER): number {
  const index = order.findIndex((s) => s.toLowerCase() === status.toLowerCase());
  return index === -1 ? order.length : index;
}

export function groupByStatus(issues: Issue[], order: string[] = STATUS_ORDER): BoardGroup[] {
  const groups = new Map<string, BoardGroup>();
  for (const issue of issues) {
    const id = issue.status.toLowerCase();
    const group = groups.get(id) ?? { status: issue.status, issues: [] };
    group.issues.push(issue);
    groups.set(id, group);
  }
  return [...groups.values()].sort(
    (a, b) => statusRank(a.status, order) - statusRank(b.status, order) || a.status.localeCompare(b.status)
  );
}

/** One group per board column (empty ones included, in board order); issues in no column are grouped by status after. */
export function boardGroups(issues: Issue[], columns: BoardColumn[]): BoardGroup[] {
  const groups = columns.map((c) => ({ status: c.name, issues: [] as Issue[] }));
  const columnOf = new Map<string, BoardGroup>();
  columns.forEach((c, i) => c.statuses.forEach((s) => columnOf.set(s.toLowerCase(), groups[i])));
  const leftovers: Issue[] = [];
  for (const issue of issues) {
    const group = columnOf.get(issue.status.toLowerCase());
    if (group) group.issues.push(issue);
    else leftovers.push(issue);
  }
  return [...groups, ...groupByStatus(leftovers)];
}

export function truncate(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  return width === 1 ? '…' : `${text.slice(0, width - 1)}…`;
}

export function pad(text: string, width: number): string {
  return truncate(text, width).padEnd(width);
}

/** `KEY status assignee summary` fitted to `width` columns; assignee is dropped when narrow. */
export function issueRow(issue: Issue, width: number): string {
  const assignee = width >= 60 ? `${pad(issue.assignee ?? '—', 14)} ` : '';
  const head = `${pad(issue.key, 8)} ${pad(issue.status, 12)} ${assignee}`;
  return `${head}${truncate(issue.summary, width - head.length)}`;
}

/** Bare number → PROJECT-n; a full key is upper-cased; anything else is null. */
export function resolveIssueKey(arg: string, project: string): string | null {
  const value = arg.trim();
  if (/^\d+$/.test(value)) return `${project}-${value}`;
  if (/^[a-z][a-z0-9]*-\d+$/i.test(value)) return value.toUpperCase();
  return null;
}

/** Match by target status first, then transition name, then a prefix of either. */
export function matchTransition(transitions: Transition[], target: string): Transition | undefined {
  const want = target.trim().toLowerCase();
  if (!want) return undefined;
  return (
    transitions.find((t) => t.to.toLowerCase() === want) ??
    transitions.find((t) => t.name.toLowerCase() === want) ??
    transitions.find((t) => t.to.toLowerCase().startsWith(want) || t.name.toLowerCase().startsWith(want))
  );
}

/** "12m ago" / "3h ago" / "2d ago"; JIRA's +0530 offsets are normalised for Date.parse. */
export function relativeTime(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  if (Number.isNaN(ms)) return iso;
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function issueDetailLines(issue: IssueDetail, url: string): string[] {
  const lines = [
    `Type:      ${issue.type}${issue.parent ? `  (parent ${issue.parent})` : ''}`,
    `Status:    ${issue.status}`,
    `Priority:  ${issue.priority ?? '—'}`,
    `Assignee:  ${issue.assignee ?? 'Unassigned'}`,
    `Reporter:  ${issue.reporter ?? '—'}`,
    `Labels:    ${issue.labels.length ? issue.labels.join(', ') : '—'}`,
    `Created:   ${relativeTime(issue.created)}   Updated: ${relativeTime(issue.updated)}`,
    `URL:       ${url}`,
    '',
    ...(issue.description ? issue.description.split('\n') : ['(no description)']),
  ];
  if (issue.comments.length) {
    lines.push('', `Comments (${issue.comments.length})`);
    for (const comment of issue.comments) {
      lines.push('', `${comment.author} ${'·'} ${relativeTime(comment.created)}`);
      lines.push(...comment.body.split('\n').map((line) => `  ${line}`));
    }
  }
  return lines;
}
