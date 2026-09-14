import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export interface JiraConfig {
  server: string;
  login: string;
  token: string;
  project: string;
  boardId: string | null;
  /** JQL fragment selecting the team's issues; null when JIRA_TEAM is unset. */
  teamJql: string | null;
}

export interface JiraCliValues {
  server?: string;
  login?: string;
  project?: string;
  boardId?: string;
}

/** Where jira-cli keeps the server/login/project the TUI reuses. */
export function defaultJiraCliConfigPath(home = homedir()): string {
  return path.join(home, '.config', '.jira', '.config.yml');
}

/** Pull server, login, project key and board id out of jira-cli's YAML without a YAML parser. */
export function readJiraCliConfig(yaml: string): JiraCliValues {
  const pick = (re: RegExp): string | undefined => yaml.match(re)?.[1]?.trim();
  return {
    server: pick(/^server:\s*(\S+)/m),
    login: pick(/^login:\s*(\S+)/m),
    project: pick(/^project:\s*\n\s+key:\s*(\S+)/m),
    boardId: pick(/^board:\s*\n\s+id:\s*(\d+)/m),
  };
}

/** JIRA_TEAM is either a JQL fragment or comma-separated emails. */
export function teamJqlFrom(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/[()=]/.test(value)) return value;
  const emails = value
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => `"${e}"`);
  return emails.length ? `assignee in (${emails.join(',')})` : null;
}

function readFileOrEmpty(file: string): string {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

/** Env wins over jira-cli's config; the token comes only from JIRA_API_TOKEN. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  jiraCliConfigPath = defaultJiraCliConfigPath()
): { config: JiraConfig | null; problems: string[] } {
  const fromCli = readJiraCliConfig(readFileOrEmpty(jiraCliConfigPath));
  const token = env.JIRA_API_TOKEN?.trim() ?? '';
  const server = (env.JIRA_SERVER ?? fromCli.server ?? '').replace(/\/+$/, '');
  const login = env.JIRA_LOGIN ?? fromCli.login ?? '';
  const project = env.JIRA_PROJECT ?? fromCli.project ?? '';

  const problems: string[] = [];
  if (!token) problems.push('JIRA_API_TOKEN is not set (an Atlassian API token)');
  if (!server) problems.push(`JIRA_SERVER is not set and ${jiraCliConfigPath} has no server`);
  if (!login) problems.push(`JIRA_LOGIN is not set and ${jiraCliConfigPath} has no login`);
  if (!project) problems.push(`JIRA_PROJECT is not set and ${jiraCliConfigPath} has no project key`);
  if (problems.length) return { config: null, problems };

  return {
    config: {
      server,
      login,
      token,
      project,
      boardId: env.JIRA_BOARD_ID ?? fromCli.boardId ?? null,
      teamJql: teamJqlFrom(env.JIRA_TEAM),
    },
    problems,
  };
}
