import { adfToText, textToAdf, type AdfNode } from './adf.js';
import type { CreateIssueInput, Issue, IssueDetail, JiraUser, Transition } from './types.js';

export class JiraApiError extends Error {
  constructor(
    readonly status: number,
    readonly messages: string[],
    method: string,
    path: string
  ) {
    super(messages.length ? messages.join('; ') : `HTTP ${status} from ${method} ${path}`);
    this.name = 'JiraApiError';
  }
}

export interface JiraClientOptions {
  server: string;
  login: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export interface BoardSummary {
  id: number;
  name: string;
  type: string;
}

export interface BoardColumnConfig {
  name: string;
  statusIds: string[];
}

export interface BoardConfig {
  name: string;
  columns: BoardColumnConfig[];
}

export interface ProjectStatus {
  id: string;
  name: string;
  /** JIRA status category key: new | indeterminate | done. */
  category: string;
}

export interface ProjectSummary {
  key: string;
  name: string;
  style?: string;
}

interface Named {
  name: string;
}

interface RawComment {
  author?: { displayName?: string };
  created: string;
  body?: AdfNode | null;
}

interface RawFields {
  summary: string;
  status: Named;
  assignee: { displayName: string } | null;
  issuetype: Named;
  priority: Named | null;
  updated: string;
  reporter?: { displayName: string } | null;
  created?: string;
  description?: AdfNode | null;
  labels?: string[];
  comment?: { comments?: RawComment[] };
  parent?: { key: string } | null;
}

interface RawIssue {
  key: string;
  fields: RawFields;
}

interface SearchPage {
  issues: RawIssue[];
  isLast?: boolean;
  nextPageToken?: string;
}

interface RawTransition {
  id: string;
  name: string;
  to: Named;
}

interface RawBoardConfig {
  name: string;
  columnConfig: { columns: Array<{ name: string; statuses: Array<{ id: string }> }> };
}

interface RawProjectStatuses {
  statuses: Array<{ id: string; name: string; statusCategory?: { key?: string } }>;
}

interface Paged<T> {
  values: T[];
  isLast?: boolean;
}

const LIST_FIELDS = 'summary,status,assignee,issuetype,priority,updated';
const DETAIL_FIELDS = `${LIST_FIELDS},reporter,created,description,labels,comment,parent`;
const PAGE_SIZE = 100;
/** Default cap for a list; the caller is told when it is hit. */
export const SEARCH_MAX = 500;

function toIssue(raw: RawIssue): Issue {
  const f = raw.fields;
  return {
    key: raw.key,
    summary: f.summary,
    status: f.status.name,
    assignee: f.assignee?.displayName ?? null,
    type: f.issuetype.name,
    priority: f.priority?.name ?? null,
    updated: f.updated,
  };
}

function toIssueDetail(raw: RawIssue): IssueDetail {
  const f = raw.fields;
  return {
    ...toIssue(raw),
    reporter: f.reporter?.displayName ?? null,
    created: f.created ?? f.updated,
    description: adfToText(f.description),
    labels: f.labels ?? [],
    parent: f.parent?.key ?? null,
    comments: (f.comment?.comments ?? []).map((c) => ({
      author: c.author?.displayName ?? 'Unknown',
      created: c.created,
      body: adfToText(c.body),
    })),
  };
}

async function errorMessages(response: Response): Promise<string[]> {
  try {
    const body = (await response.json()) as { errorMessages?: string[]; errors?: Record<string, string> };
    return [...(body.errorMessages ?? []), ...Object.values(body.errors ?? {})];
  } catch {
    return [];
  }
}

/** Thin JIRA Cloud REST v3 (+ Agile 1.0) client authenticated with login + API token. */
export class JiraClient {
  private readonly server: string;
  private readonly authHeader: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraClientOptions) {
    this.server = options.server.replace(/\/+$/, '');
    this.authHeader = `Basic ${Buffer.from(`${options.login}:${options.token}`).toString('base64')}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  issueUrl(key: string): string {
    return `${this.server}/browse/${key}`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Authorization: this.authHeader, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.fetchImpl(`${this.server}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new JiraApiError(response.status, await errorMessages(response), method, path);
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  me(): Promise<JiraUser> {
    return this.request<JiraUser>('GET', '/rest/api/3/myself');
  }

  /** Runs `jql` and follows nextPageToken until `max` issues or the last page. */
  async search(jql: string, max = SEARCH_MAX): Promise<Issue[]> {
    const issues: Issue[] = [];
    let nextPageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        jql,
        fields: LIST_FIELDS,
        maxResults: String(Math.min(PAGE_SIZE, max - issues.length)),
      });
      if (nextPageToken) params.set('nextPageToken', nextPageToken);
      const page = await this.request<SearchPage>('GET', `/rest/api/3/search/jql?${params}`);
      if (page.issues.length === 0) break;
      issues.push(...page.issues.map(toIssue));
      nextPageToken = page.isLast ? undefined : page.nextPageToken;
    } while (nextPageToken && issues.length < max);
    return issues;
  }

  async getIssue(key: string): Promise<IssueDetail> {
    const raw = await this.request<RawIssue>('GET', `/rest/api/3/issue/${key}?fields=${DETAIL_FIELDS}`);
    return toIssueDetail(raw);
  }

  async transitions(key: string): Promise<Transition[]> {
    const body = await this.request<{ transitions: RawTransition[] }>('GET', `/rest/api/3/issue/${key}/transitions`);
    return body.transitions.map((t) => ({ id: t.id, name: t.name, to: t.to.name }));
  }

  async transition(key: string, transitionId: string): Promise<void> {
    await this.request<void>('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: transitionId } });
  }

  /** `accountId` null unassigns. */
  async assign(key: string, accountId: string | null): Promise<void> {
    await this.request<void>('PUT', `/rest/api/3/issue/${key}/assignee`, { accountId });
  }

  async addComment(key: string, text: string): Promise<void> {
    await this.request<void>('POST', `/rest/api/3/issue/${key}/comment`, { body: textToAdf(text) });
  }

  async createIssue(input: CreateIssueInput): Promise<{ key: string }> {
    const fields: Record<string, unknown> = {
      project: { key: input.project },
      summary: input.summary,
      issuetype: { name: input.type },
    };
    if (input.description) fields.description = textToAdf(input.description);
    return this.request<{ key: string }>('POST', '/rest/api/3/issue', { fields });
  }

  /** Users JIRA allows as assignee of `issueKey` (up to 100). */
  assignableUsers(issueKey: string): Promise<JiraUser[]> {
    const params = new URLSearchParams({ issueKey, maxResults: '100' });
    return this.request<JiraUser[]>('GET', `/rest/api/3/user/assignable/search?${params}`);
  }

  findUsers(query: string): Promise<JiraUser[]> {
    const params = new URLSearchParams({ query });
    return this.request<JiraUser[]>('GET', `/rest/api/3/user/search?${params}`);
  }

  async project(key: string): Promise<ProjectSummary> {
    const raw = await this.request<{ key: string; name: string; style?: string }>('GET', `/rest/api/3/project/${key}`);
    return { key: raw.key, name: raw.name, style: raw.style };
  }

  /** Every project visible to the user, paged with startAt up to `max`. */
  async projects(max = SEARCH_MAX): Promise<ProjectSummary[]> {
    const out: ProjectSummary[] = [];
    let isLast = false;
    while (!isLast && out.length < max) {
      const params = new URLSearchParams({ startAt: String(out.length), maxResults: String(PAGE_SIZE) });
      const page = await this.request<Paged<{ key: string; name: string; style?: string }>>(
        'GET',
        `/rest/api/3/project/search?${params}`
      );
      if (page.values.length === 0) break;
      out.push(...page.values.map((p) => ({ key: p.key, name: p.name, style: p.style })));
      isLast = page.isLast ?? true;
    }
    return out;
  }

  /** Distinct statuses across the project's issue types, with their category. */
  async projectStatuses(project: string): Promise<ProjectStatus[]> {
    const raw = await this.request<RawProjectStatuses[]>('GET', `/rest/api/3/project/${project}/statuses`);
    const byId = new Map<string, ProjectStatus>();
    for (const type of raw) {
      for (const s of type.statuses) {
        if (!byId.has(s.id)) byId.set(s.id, { id: s.id, name: s.name, category: s.statusCategory?.key ?? 'indeterminate' });
      }
    }
    return [...byId.values()];
  }

  async boardsForProject(project: string): Promise<BoardSummary[]> {
    const params = new URLSearchParams({ projectKeyOrId: project, maxResults: '50' });
    const page = await this.request<Paged<BoardSummary>>('GET', `/rest/agile/1.0/board?${params}`);
    return page.values.map((b) => ({ id: b.id, name: b.name, type: b.type }));
  }

  /** Column names and the status ids mapped to each, in the board's displayed order. */
  async boardConfig(boardId: number): Promise<BoardConfig> {
    const raw = await this.request<RawBoardConfig>('GET', `/rest/agile/1.0/board/${boardId}/configuration`);
    return {
      name: raw.name,
      columns: raw.columnConfig.columns.map((c) => ({ name: c.name, statusIds: c.statuses.map((s) => s.id) })),
    };
  }
}
