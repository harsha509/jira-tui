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

export type ConfigSource = 'flag' | 'env' | 'jira-cli' | 'none';

export interface ConfigSources {
  token: ConfigSource;
  server: ConfigSource;
  login: ConfigSource;
  project: ConfigSource;
  boardId: ConfigSource;
  team: ConfigSource;
}

export interface ConfigOverrides {
  project?: string;
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

/** Inverse of teamJqlFrom: the emails behind an assignee clause, or the fragment unchanged. */
export function teamSpecFrom(teamJql: string | null): string {
  const inner = teamJql?.match(/^assignee in \((.*)\)$/)?.[1];
  if (inner === undefined) return teamJql ?? '';
  return inner
    .split(',')
    .map((e) => e.trim().replace(/^"|"$/g, ''))
    .join(', ');
}

const EMAIL = /^[^\s"'()]+@[^\s"'()]+$/;

/** The addresses in a team spec, lowercased; empty for a JQL fragment that is not a plain list. */
export function teamEmailsFrom(teamJql: string | null): string[] {
  return teamSpecFrom(teamJql)
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL.test(e));
}

/** `--project KEY` or `--project=KEY` from the command line. */
export function projectFromArgs(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' || argv[i] === '-p') return argv[i + 1]?.trim().toUpperCase() || undefined;
    if (argv[i].startsWith('--project=')) return argv[i].slice('--project='.length).trim().toUpperCase() || undefined;
  }
  return undefined;
}

function readFileOrEmpty(file: string): string {
  try {
    return readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function pick(
  flag: string | undefined,
  env: string | undefined,
  cli: string | undefined
): { value: string; source: ConfigSource } {
  if (flag) return { value: flag, source: 'flag' };
  if (env) return { value: env, source: 'env' };
  if (cli) return { value: cli, source: 'jira-cli' };
  return { value: '', source: 'none' };
}

/** Flag wins over env, env over jira-cli's config; the token comes only from JIRA_API_TOKEN. */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  jiraCliConfigPath = defaultJiraCliConfigPath(),
  overrides: ConfigOverrides = {}
): { config: JiraConfig | null; problems: string[]; sources: ConfigSources } {
  const fromCli = readJiraCliConfig(readFileOrEmpty(jiraCliConfigPath));
  const token = env.JIRA_API_TOKEN?.trim() ?? '';
  const server = pick(undefined, env.JIRA_SERVER, fromCli.server);
  const login = pick(undefined, env.JIRA_LOGIN, fromCli.login);
  const project = pick(overrides.project, env.JIRA_PROJECT, fromCli.project);
  const boardId = pick(undefined, env.JIRA_BOARD_ID, fromCli.boardId);
  const teamJql = teamJqlFrom(env.JIRA_TEAM);
  const sources: ConfigSources = {
    token: token ? 'env' : 'none',
    server: server.source,
    login: login.source,
    project: project.source,
    boardId: boardId.source,
    team: teamJql ? 'env' : 'none',
  };

  const problems: string[] = [];
  if (!token) problems.push('JIRA_API_TOKEN is not set (an Atlassian API token)');
  if (!server.value) problems.push(`JIRA_SERVER is not set and ${jiraCliConfigPath} has no server`);
  if (!login.value) problems.push(`JIRA_LOGIN is not set and ${jiraCliConfigPath} has no login`);
  if (!project.value) problems.push(`JIRA_PROJECT is not set and ${jiraCliConfigPath} has no project key`);
  if (problems.length) return { config: null, problems, sources };

  return {
    config: {
      server: server.value.replace(/\/+$/, ''),
      login: login.value,
      token,
      project: project.value,
      boardId: boardId.value || null,
      teamJql,
    },
    problems,
    sources,
  };
}
