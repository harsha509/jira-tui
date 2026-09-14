import { defaultJiraCliConfigPath, loadConfig, projectFromArgs, type ConfigSource } from './config.js';
import { loadBoard } from './jira/board.js';
import { JiraClient } from './jira/client.js';

export interface DoctorDeps {
  env?: NodeJS.ProcessEnv;
  configPath?: string;
  fetchImpl?: typeof fetch;
  write?: (line: string) => void;
}

const SOURCE_LABEL: Record<ConfigSource, string> = {
  flag: '--project flag',
  env: 'environment',
  'jira-cli': '~/.config/.jira/.config.yml',
  none: 'not set',
};

function mask(token: string): string {
  return token.length <= 4 ? '••••' : `${'•'.repeat(8)}${token.slice(-4)}`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** `jira-tui doctor [--project KEY]`: print where each setting comes from and check login, project and board. Returns the exit code. */
export async function runDoctor(argv: string[], deps: DoctorDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const write = deps.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const configPath = deps.configPath ?? defaultJiraCliConfigPath();
  const { config, problems, sources } = loadConfig(env, configPath, { project: projectFromArgs(argv) });

  write('jira-tui doctor');
  write('');
  write('Settings');
  const row = (name: string, value: string, source: ConfigSource) =>
    write(`  ${name.padEnd(9)} ${value.padEnd(40)} ${SOURCE_LABEL[source]}`);
  row('token', env.JIRA_API_TOKEN?.trim() ? mask(env.JIRA_API_TOKEN.trim()) : '(unset)', sources.token);
  row('server', env.JIRA_SERVER ?? config?.server ?? '(unset)', sources.server);
  row('login', env.JIRA_LOGIN ?? config?.login ?? '(unset)', sources.login);
  row('project', config?.project ?? env.JIRA_PROJECT ?? '(unset)', sources.project);
  row('board', config?.boardId ?? env.JIRA_BOARD_ID ?? '(auto: first board of the project)', sources.boardId);
  row('team', config?.teamJql ?? '(unset — "team" scope unavailable)', sources.team);
  write('');

  if (!config) {
    write('Problems');
    for (const p of problems) write(`  ✗ ${p}`);
    write('');
    write(`Set the variables above in your shell, or configure jira-cli (${configPath}).`);
    return 1;
  }

  write('Checks');
  const client = new JiraClient({ ...config, fetchImpl: deps.fetchImpl });
  let failed = false;
  try {
    const me = await client.me();
    write(`  ✓ login     ${me.displayName} (${me.emailAddress ?? config.login})`);
  } catch (err) {
    failed = true;
    write(`  ✗ login     ${describe(err)}`);
    write('');
    write('Fix the token or server first; the remaining checks need a working login.');
    return 1;
  }
  try {
    const project = await client.project(config.project);
    write(`  ✓ project   ${project.key} — ${project.name}${project.style ? ` (${project.style})` : ''}`);
  } catch (err) {
    failed = true;
    write(`  ✗ project   ${config.project}: ${describe(err)}`);
  }
  try {
    const board = await loadBoard(client, config.project, config.boardId);
    if (board) {
      write(`  ✓ board     ${board.name} (#${board.id}), ${board.columns.length} columns: ${board.columns.map((c) => c.name).join(' | ')}`);
      write(`  ✓ statuses  loading ${board.openStatuses.length} open: ${board.openStatuses.join(', ')}`);
    } else {
      write(`  ! board     ${config.project} has no board — lists fall back to status != Done`);
    }
  } catch (err) {
    write(`  ! board     ${describe(err)} — lists fall back to status != Done`);
  }
  write('');
  write(failed ? 'Some checks failed.' : 'All good — run jira-tui.');
  return failed ? 1 : 0;
}
