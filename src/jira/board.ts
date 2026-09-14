import type { BoardColumnConfig, BoardSummary, JiraClient, ProjectStatus } from './client.js';

export interface BoardColumn {
  name: string;
  /** Status names shown in this column. */
  statuses: string[];
}

export interface BoardInfo {
  id: number;
  name: string;
  columns: BoardColumn[];
  /** Statuses on the board whose category is not "done": what the ticket list loads. */
  openStatuses: string[];
}

/** Columns with their status ids resolved to names; a column mapping no known status is dropped (JIRA hides it too). */
export function buildColumns(columns: BoardColumnConfig[], statuses: ProjectStatus[]): BoardColumn[] {
  const byId = new Map(statuses.map((s) => [s.id, s.name]));
  return columns
    .map((c) => ({ name: c.name, statuses: c.statusIds.map((id) => byId.get(id)).filter((n): n is string => !!n) }))
    .filter((c) => c.statuses.length > 0);
}

export function openStatusesOf(columns: BoardColumn[], statuses: ProjectStatus[]): string[] {
  const done = new Set(statuses.filter((s) => s.category === 'done').map((s) => s.name));
  return columns.flatMap((c) => c.statuses).filter((name) => !done.has(name));
}

/** The configured board if it belongs to the project, else the project's own (simple) board, else the first one. */
export function chooseBoard(boards: BoardSummary[], preferredId: string | null): BoardSummary | undefined {
  const preferred = preferredId ? boards.find((b) => String(b.id) === preferredId) : undefined;
  return preferred ?? boards.find((b) => b.type === 'simple') ?? boards[0];
}

/** Resolve the board for `project` and read its columns; null when the project has no board. */
export async function loadBoard(client: JiraClient, project: string, preferredId: string | null): Promise<BoardInfo | null> {
  const board = chooseBoard(await client.boardsForProject(project), preferredId);
  if (!board) return null;
  const [config, statuses] = await Promise.all([client.boardConfig(board.id), client.projectStatuses(project)]);
  const columns = buildColumns(config.columns, statuses);
  return { id: board.id, name: config.name || board.name, columns, openStatuses: openStatusesOf(columns, statuses) };
}
