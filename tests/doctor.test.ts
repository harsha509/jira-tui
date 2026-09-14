import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { runDoctor } from '../src/doctor.js';

const YAML = 'login: you@example.com\nproject:\n    key: A2A\nserver: https://example.atlassian.net\nboard:\n    id: 4672\n';

function yamlFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'jira-tui-doctor-'));
  const file = path.join(dir, '.config.yml');
  writeFileSync(file, YAML);
  return file;
}

type Route = (url: string) => { status?: number; body: unknown };

function fetchFor(route: Route): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const { status = 200, body } = route(String(input));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
}

const happy: Route = (url) => {
  if (url.includes('/myself')) return { body: { accountId: '1', displayName: 'Sri', emailAddress: 'you@example.com' } };
  if (url.includes('/rest/api/3/project/A2A/statuses'))
    return { body: [{ statuses: [{ id: '1', name: 'To Do', statusCategory: { key: 'new' } }, { id: '4', name: 'Done', statusCategory: { key: 'done' } }] }] };
  if (url.includes('/rest/api/3/project/A2A')) return { body: { key: 'A2A', name: 'A2A', style: 'next-gen' } };
  if (url.includes('/rest/agile/1.0/board/4672/configuration'))
    return { body: { name: 'A2A board', columnConfig: { columns: [{ name: 'To Do', statuses: [{ id: '1' }] }, { name: 'Done', statuses: [{ id: '4' }] }] } } };
  if (url.includes('/rest/agile/1.0/board?')) return { body: { values: [{ id: 4672, name: 'A2A board', type: 'simple' }] } };
  return { status: 404, body: { errorMessages: [`no route for ${url}`] } };
};

function run(argv: string[], env: NodeJS.ProcessEnv, route: Route) {
  const lines: string[] = [];
  return runDoctor(argv, { env, configPath: yamlFile(), fetchImpl: fetchFor(route), write: (l) => lines.push(l) }).then((code) => ({
    code,
    out: lines.join('\n'),
  }));
}

describe('jira-tui doctor', () => {
  test('reports sources, masks the token, and passes every check', async () => {
    const { code, out } = await run([], { JIRA_API_TOKEN: 'secret-token-A1CE' }, happy);
    expect(code).toBe(0);
    expect(out).not.toContain('secret-token');
    expect(out).toContain('••••••••A1CE');
    expect(out).toContain('~/.config/.jira/.config.yml');
    expect(out).toContain('✓ login     Sri');
    expect(out).toContain('✓ project   A2A — A2A (next-gen)');
    expect(out).toContain('✓ board     A2A board (#4672), 2 columns: To Do | Done');
    expect(out).toContain('✓ statuses  loading 1 open: To Do');
    expect(out).toContain('All good');
  });

  test('a missing token lists the problem and exits 1 without calling JIRA', async () => {
    let called = 0;
    const { code, out } = await run([], {}, (url) => {
      called++;
      return happy(url);
    });
    expect(code).toBe(1);
    expect(called).toBe(0);
    expect(out).toContain('✗ JIRA_API_TOKEN is not set');
  });

  test('a failed login stops the remaining checks', async () => {
    const { code, out } = await run([], { JIRA_API_TOKEN: 't' }, (url) =>
      url.includes('/myself') ? { status: 401, body: { errorMessages: ['Unauthorized'] } } : happy(url)
    );
    expect(code).toBe(1);
    expect(out).toContain('✗ login     Unauthorized');
    expect(out).not.toContain('✓ project');
  });

  test('--project overrides the configured project and a bad key fails the project check', async () => {
    const { code, out } = await run(['--project', 'nope'], { JIRA_API_TOKEN: 't' }, (url) => {
      if (url.includes('/rest/api/3/project/NOPE')) return { status: 404, body: { errorMessages: ["No project could be found with key 'NOPE'."] } };
      if (url.includes('projectKeyOrId=NOPE')) return { body: { values: [] } };
      return happy(url);
    });
    expect(code).toBe(1);
    expect(out).toContain('project   NOPE');
    expect(out).toContain('--project flag');
    expect(out).toContain("✗ project   NOPE: No project could be found with key 'NOPE'.");
    expect(out).toContain('! board     NOPE has no board');
  });
});
