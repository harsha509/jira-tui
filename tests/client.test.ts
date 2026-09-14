import { describe, expect, test } from 'vitest';
import { JiraApiError, JiraClient } from '../src/jira/client.js';

interface Reply {
  status?: number;
  body?: unknown;
  raw?: string;
}

function fakeFetch(handler: (url: string, init: RequestInit) => Reply) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const reply = handler(url, init ?? {});
    const status = reply.status ?? 200;
    const text = reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body));
    return new Response(text || null, { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function client(handler: (url: string, init: RequestInit) => Reply) {
  const { fetchImpl, calls } = fakeFetch(handler);
  return {
    jira: new JiraClient({ server: 'https://x.atlassian.net/', login: 'me@x.com', token: 'tok', fetchImpl }),
    calls,
  };
}

function rawIssue(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    fields: {
      summary: `Summary ${key}`,
      status: { name: 'In Dev' },
      assignee: { displayName: 'Sri' },
      issuetype: { name: 'Bug' },
      priority: { name: 'Medium' },
      updated: '2026-09-11T11:06:10.144+0530',
      ...overrides,
    },
  };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string>)[name];
}

describe('auth and transport', () => {
  test('sends basic auth built from login:token and strips the trailing slash', async () => {
    const { jira, calls } = client(() => ({ body: { accountId: '1', displayName: 'Sri' } }));
    await expect(jira.me()).resolves.toEqual({ accountId: '1', displayName: 'Sri' });
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/myself');
    expect(headerOf(calls[0].init, 'Authorization')).toBe(`Basic ${Buffer.from('me@x.com:tok').toString('base64')}`);
    expect(headerOf(calls[0].init, 'Accept')).toBe('application/json');
    expect(jira.issueUrl('A2A-1')).toBe('https://x.atlassian.net/browse/A2A-1');
  });

  test('a non-2xx reply becomes a JiraApiError carrying JIRA messages', async () => {
    const { jira } = client(() => ({
      status: 404,
      body: { errorMessages: ['Issue does not exist or you do not have permission to see it.'], errors: {} },
    }));
    const err = await jira.getIssue('A2A-999999').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JiraApiError);
    expect((err as JiraApiError).status).toBe(404);
    expect((err as JiraApiError).message).toBe('Issue does not exist or you do not have permission to see it.');
  });

  test('field errors are reported too, and a non-JSON error body still names the request', async () => {
    const fieldErr = client(() => ({ status: 400, body: { errorMessages: [], errors: { summary: 'required' } } }));
    await expect(fieldErr.jira.createIssue({ project: 'A2A', type: 'Bug', summary: '' })).rejects.toThrow('required');
    const html = client(() => ({ status: 502, raw: '<html>bad gateway</html>' }));
    await expect(html.jira.me()).rejects.toThrow('HTTP 502 from GET /rest/api/3/myself');
  });

  test('a network failure propagates as-is', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const jira = new JiraClient({ server: 'https://x', login: 'a', token: 'b', fetchImpl });
    await expect(jira.me()).rejects.toThrow('ECONNRESET');
  });
});

describe('search', () => {
  test('follows nextPageToken until the last page and maps fields', async () => {
    const { jira, calls } = client((url) =>
      url.includes('nextPageToken=abc')
        ? { body: { issues: [rawIssue('A2A-3', { assignee: null, priority: null })], isLast: true } }
        : { body: { issues: [rawIssue('A2A-1'), rawIssue('A2A-2')], isLast: false, nextPageToken: 'abc' } }
    );
    const issues = await jira.search('project = A2A');
    expect(issues.map((i) => i.key)).toEqual(['A2A-1', 'A2A-2', 'A2A-3']);
    expect(issues[2]).toEqual({
      key: 'A2A-3',
      summary: 'Summary A2A-3',
      status: 'In Dev',
      assignee: null,
      type: 'Bug',
      priority: null,
      updated: '2026-09-11T11:06:10.144+0530',
    });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('/rest/api/3/search/jql?jql=project+%3D+A2A');
    expect(calls[1].url).toContain('nextPageToken=abc');
  });

  test('the default cap is 500, fetched in pages of 100', async () => {
    let page = 0;
    const { jira, calls } = client(() => {
      page++;
      return { body: { issues: Array.from({ length: 100 }, (_, i) => rawIssue(`A2A-${page * 100 + i}`)), isLast: false, nextPageToken: `p${page}` } };
    });
    const issues = await jira.search('project = A2A');
    expect(issues).toHaveLength(500);
    expect(calls).toHaveLength(5);
    expect(calls[0].url).toContain('maxResults=100');
  });

  test('stops at max even when more pages exist', async () => {
    const { jira, calls } = client(() => ({
      body: { issues: [rawIssue('A2A-1')], isLast: false, nextPageToken: 'more' },
    }));
    const issues = await jira.search('project = A2A', 1);
    expect(issues).toHaveLength(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('maxResults=1');
  });

  test('an empty page ends the loop even if the server claims there is more', async () => {
    const { jira, calls } = client(() => ({ body: { issues: [], isLast: false, nextPageToken: 'loop' } }));
    await expect(jira.search('project = A2A')).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

describe('issue reads and writes', () => {
  test('getIssue flattens ADF description, comments, labels and parent', async () => {
    const { jira, calls } = client(() => ({
      body: rawIssue('A2A-90', {
        reporter: { displayName: 'Rep' },
        created: '2026-09-10T10:00:00.000+0530',
        labels: ['UI-fix'],
        parent: { key: 'A2A-1' },
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Broken' }] }],
        },
        comment: {
          comments: [
            {
              author: { displayName: 'Sai' },
              created: '2026-09-11T10:00:00.000+0530',
              body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'On it' }] }] },
            },
            { created: '2026-09-11T11:00:00.000+0530', body: null },
          ],
        },
      }),
    }));
    const issue = await jira.getIssue('A2A-90');
    expect(calls[0].url).toContain('/rest/api/3/issue/A2A-90?fields=');
    expect(issue.description).toBe('Broken');
    expect(issue.labels).toEqual(['UI-fix']);
    expect(issue.parent).toBe('A2A-1');
    expect(issue.reporter).toBe('Rep');
    expect(issue.comments).toEqual([
      { author: 'Sai', created: '2026-09-11T10:00:00.000+0530', body: 'On it' },
      { author: 'Unknown', created: '2026-09-11T11:00:00.000+0530', body: '' },
    ]);
  });

  test('transitions are flattened to id/name/to and a move posts the id', async () => {
    const { jira, calls } = client((url, init) =>
      init.method === 'POST'
        ? { status: 204 }
        : { body: { transitions: [{ id: '3', name: 'Dev Done', to: { name: 'IN Review' } }] } }
    );
    await expect(jira.transitions('A2A-90')).resolves.toEqual([{ id: '3', name: 'Dev Done', to: 'IN Review' }]);
    await jira.transition('A2A-90', '3');
    expect(calls[1].url).toBe('https://x.atlassian.net/rest/api/3/issue/A2A-90/transitions');
    expect(calls[1].init.method).toBe('POST');
    expect(headerOf(calls[1].init, 'Content-Type')).toBe('application/json');
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ transition: { id: '3' } });
  });

  test('assign PUTs the accountId and null unassigns', async () => {
    const { jira, calls } = client(() => ({ status: 204 }));
    await jira.assign('A2A-90', 'acc-1');
    await jira.assign('A2A-90', null);
    expect(calls[0].init.method).toBe('PUT');
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/issue/A2A-90/assignee');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ accountId: 'acc-1' });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ accountId: null });
  });

  test('addComment wraps the text as an ADF document', async () => {
    const { jira, calls } = client(() => ({ status: 201, body: { id: '1' } }));
    await jira.addComment('A2A-90', 'line one\nline two');
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/issue/A2A-90/comment');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      body: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
        ],
      },
    });
  });

  test('createIssue sends project, summary and issue type by name', async () => {
    const { jira, calls } = client(() => ({ status: 201, body: { key: 'A2A-100' } }));
    await expect(jira.createIssue({ project: 'A2A', type: 'Bug', summary: 'Boom' })).resolves.toEqual({ key: 'A2A-100' });
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/issue');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      fields: { project: { key: 'A2A' }, summary: 'Boom', issuetype: { name: 'Bug' } },
    });
  });

  test('assignableUsers asks for the issue and a page of 100', async () => {
    const { jira, calls } = client(() => ({ body: [{ accountId: 'a', displayName: 'A' }] }));
    await expect(jira.assignableUsers('A2A-90')).resolves.toEqual([{ accountId: 'a', displayName: 'A' }]);
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/user/assignable/search?issueKey=A2A-90&maxResults=100');
  });

  test('project, projects (paged with startAt), statuses (deduped), boards and board config', async () => {
    const { jira, calls } = client((url) => {
      if (url.includes('/project/search?startAt=0')) return { body: { values: [{ key: 'A', name: 'Alpha' }], isLast: false } };
      if (url.includes('/project/search?startAt=1')) return { body: { values: [{ key: 'B', name: 'Beta', style: 'next-gen' }], isLast: true } };
      if (url.includes('/project/A2A/statuses'))
        return {
          body: [
            { statuses: [{ id: '1', name: 'To Do', statusCategory: { key: 'new' } }] },
            { statuses: [{ id: '1', name: 'To Do', statusCategory: { key: 'new' } }, { id: '4', name: 'Done', statusCategory: { key: 'done' } }] },
          ],
        };
      if (url.includes('/rest/api/3/project/A2A')) return { body: { key: 'A2A', name: 'A2A', style: 'next-gen' } };
      if (url.includes('/rest/agile/1.0/board?')) return { body: { values: [{ id: 4672, name: 'A2A board', type: 'simple' }] } };
      if (url.includes('/rest/agile/1.0/board/4672/configuration'))
        return { body: { name: 'A2A board', columnConfig: { columns: [{ name: 'To Do', statuses: [{ id: '1' }, { id: '2' }] }] } } };
      return { status: 404, body: {} };
    });
    await expect(jira.project('A2A')).resolves.toEqual({ key: 'A2A', name: 'A2A', style: 'next-gen' });
    await expect(jira.projects()).resolves.toEqual([{ key: 'A', name: 'Alpha', style: undefined }, { key: 'B', name: 'Beta', style: 'next-gen' }]);
    await expect(jira.projectStatuses('A2A')).resolves.toEqual([
      { id: '1', name: 'To Do', category: 'new' },
      { id: '4', name: 'Done', category: 'done' },
    ]);
    await expect(jira.boardsForProject('A2A')).resolves.toEqual([{ id: 4672, name: 'A2A board', type: 'simple' }]);
    await expect(jira.boardConfig(4672)).resolves.toEqual({ name: 'A2A board', columns: [{ name: 'To Do', statusIds: ['1', '2'] }] });
    expect(calls.some((c) => c.url.endsWith('/rest/agile/1.0/board?projectKeyOrId=A2A&maxResults=50'))).toBe(true);
  });

  test('projects stops on an empty page even if isLast is false', async () => {
    const { jira, calls } = client(() => ({ body: { values: [], isLast: false } }));
    await expect(jira.projects()).resolves.toEqual([]);
    expect(calls).toHaveLength(1);
  });

  test('findUsers URL-encodes the query', async () => {
    const { jira, calls } = client(() => ({ body: [] }));
    await jira.findUsers('sai krishna@x.com');
    expect(calls[0].url).toBe('https://x.atlassian.net/rest/api/3/user/search?query=sai+krishna%40x.com');
  });
});
