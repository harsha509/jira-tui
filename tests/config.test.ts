import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadConfig, projectFromArgs, readJiraCliConfig, teamJqlFrom } from '../src/config.js';

const SAMPLE_YAML = `auth_type: basic
board:
    id: 4672
    name: A2A board
    type: simple
installation: Cloud
issue:
    fields:
        custom:
            - name: Reach
              key: customfield_11960
    types:
        - id: "15571"
          name: Bug
login: you@example.com
project:
    key: A2A
    type: next-gen
server: https://example.atlassian.net
timezone: Asia/Kolkata
`;

describe('readJiraCliConfig', () => {
  test('picks server, login, project key and board id out of jira-cli YAML', () => {
    expect(readJiraCliConfig(SAMPLE_YAML)).toEqual({
      server: 'https://example.atlassian.net',
      login: 'you@example.com',
      project: 'A2A',
      boardId: '4672',
    });
  });

  test('missing keys are undefined rather than mis-matched from nested blocks', () => {
    expect(readJiraCliConfig('issue:\n    fields:\n        server: nope\n')).toEqual({
      server: undefined,
      login: undefined,
      project: undefined,
      boardId: undefined,
    });
  });
});

describe('teamJqlFrom', () => {
  test('a JQL fragment passes through untouched', () => {
    const jql = 'assignee in ("a@x.com","b@x.com")';
    expect(teamJqlFrom(jql)).toBe(jql);
  });

  test('comma-separated emails become an assignee clause', () => {
    expect(teamJqlFrom('a@x.com, b@x.com,,')).toBe('assignee in ("a@x.com","b@x.com")');
  });

  test('unset or blank is null', () => {
    expect(teamJqlFrom(undefined)).toBeNull();
    expect(teamJqlFrom('   ')).toBeNull();
    expect(teamJqlFrom(',')).toBeNull();
  });
});

describe('loadConfig', () => {
  function yamlFile(contents: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'jira-tui-'));
    const file = path.join(dir, '.config.yml');
    writeFileSync(file, contents);
    return file;
  }

  test('fills server/login/project from jira-cli and the token from the env', () => {
    const { config, problems } = loadConfig({ JIRA_API_TOKEN: 'tok' }, yamlFile(SAMPLE_YAML));
    expect(problems).toEqual([]);
    expect(config).toEqual({
      server: 'https://example.atlassian.net',
      login: 'you@example.com',
      token: 'tok',
      project: 'A2A',
      boardId: '4672',
      teamJql: null,
    });
  });

  test('env overrides jira-cli and trailing slashes are stripped', () => {
    const { config } = loadConfig(
      {
        JIRA_API_TOKEN: 'tok',
        JIRA_SERVER: 'https://other.atlassian.net/',
        JIRA_LOGIN: 'x@y.com',
        JIRA_PROJECT: 'ZZ',
        JIRA_BOARD_ID: '1',
        JIRA_TEAM: 'a@y.com',
      },
      yamlFile(SAMPLE_YAML)
    );
    expect(config).toEqual({
      server: 'https://other.atlassian.net',
      login: 'x@y.com',
      token: 'tok',
      project: 'ZZ',
      boardId: '1',
      teamJql: 'assignee in ("a@y.com")',
    });
  });

  test('reports where each value came from, and a --project override wins', () => {
    const { config, sources } = loadConfig({ JIRA_API_TOKEN: 'tok', JIRA_LOGIN: 'x@y.com' }, yamlFile(SAMPLE_YAML), { project: 'ZZ' });
    expect(config?.project).toBe('ZZ');
    expect(config?.login).toBe('x@y.com');
    expect(sources).toEqual({ token: 'env', server: 'jira-cli', login: 'env', project: 'flag', boardId: 'jira-cli', team: 'none' });
  });

  test('projectFromArgs accepts --project KEY, --project=KEY and -p, upper-casing the key', () => {
    expect(projectFromArgs(['--project', 'abc'])).toBe('ABC');
    expect(projectFromArgs(['--project=abc'])).toBe('ABC');
    expect(projectFromArgs(['-p', 'abc'])).toBe('ABC');
    expect(projectFromArgs(['--project'])).toBeUndefined();
    expect(projectFromArgs([])).toBeUndefined();
  });

  test('a missing token or config file yields problems and no config', () => {
    const missingFile = path.join(tmpdir(), 'does-not-exist', '.config.yml');
    const { config, problems } = loadConfig({}, missingFile);
    expect(config).toBeNull();
    expect(problems).toHaveLength(4);
    expect(problems[0]).toContain('JIRA_API_TOKEN');
    expect(problems[1]).toContain(missingFile);
  });

  test('a blank token counts as missing', () => {
    const { config, problems } = loadConfig({ JIRA_API_TOKEN: '   ' }, yamlFile(SAMPLE_YAML));
    expect(config).toBeNull();
    expect(problems).toEqual(['JIRA_API_TOKEN is not set (an Atlassian API token)']);
  });
});
