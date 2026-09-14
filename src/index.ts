import { execFile } from 'node:child_process';
import React from 'react';
import { render } from 'ink';
import { loadConfig, projectFromArgs, teamJqlFrom, type JiraConfig } from './config.js';
import { loadBoard } from './jira/board.js';
import { JiraClient, SEARCH_MAX } from './jira/client.js';
import type { Scope } from './jira/jql.js';
import type { JiraUser } from './jira/types.js';
import { ISSUE_TYPES, scopeQuery, type TuiActions } from './tui/commands.js';
import { issueDetailLines, matchTransition } from './tui/issue-format.js';
import { askSelect, askText } from './tui/modal.js';
import { getSnapshot, tuiStore, type IssueQuery } from './tui/store.js';
import { TuiApp } from './tui/TuiApp.js';

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function enterAltScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?1049h\x1b[?25l');
}

function leaveAltScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?25h\x1b[?1049l');
}

function summaryOf(key: string): string | undefined {
  return getSnapshot().issues.find((i) => i.key === key)?.summary;
}

/** Runs `work` with a busy message and logs any failure as `${what} failed`. */
async function guarded(what: string, work: () => Promise<void>): Promise<void> {
  tuiStore.setBusy(`${what}…`);
  try {
    await work();
  } catch (err) {
    tuiStore.log('error', `${what} failed`, describe(err));
  } finally {
    tuiStore.setBusy('');
  }
}

/** Wires TuiActions to the JIRA client; omitted arguments are asked for with a picker or prompt. */
export function createActions(client: JiraClient, config: JiraConfig, unmount: () => void): TuiActions {
  let quitting = false;

  async function loadIssues(query: IssueQuery): Promise<void> {
    tuiStore.setIssuesLoading(query);
    await guarded(`Loading ${query.label}`, async () => {
      const issues = await client.search(query.jql);
      tuiStore.setIssues(issues);
      const capped = issues.length >= SEARCH_MAX ? ` (first ${SEARCH_MAX} only — narrow the query)` : '';
      tuiStore.log('result', `${issues.length} issue${issues.length === 1 ? '' : 's'} — ${query.label}${capped}`);
    }).catch(() => undefined);
    if (getSnapshot().issuesLoading) tuiStore.setIssuesError('load failed — see transcript');
  }

  async function refresh(): Promise<void> {
    const { query } = getSnapshot();
    if (!query) {
      tuiStore.log('warn', 'Nothing to refresh — load a list first.');
      return;
    }
    await loadIssues(query);
  }

  /** Board columns decide the list's statuses; a project without a board falls back to status != Done. */
  async function loadProjectBoard(project: string): Promise<void> {
    try {
      const board = await loadBoard(client, project, project === config.project ? config.boardId : null);
      tuiStore.setBoard(board);
      if (board) {
        tuiStore.log('info', `${board.name}: ${board.columns.length} columns`, `Loading: ${board.openStatuses.join(', ')}`);
      } else {
        tuiStore.log('warn', `${project} has no board — listing status != Done`);
      }
    } catch (err) {
      tuiStore.setBoard(null);
      tuiStore.log('warn', `Could not read the board for ${project} — listing status != Done`, describe(err));
    }
  }

  async function currentUser(): Promise<JiraUser> {
    const me = getSnapshot().me ?? (await client.me());
    tuiStore.setMe(me);
    return me;
  }

  /** "me", "none", or an email/name looked up in JIRA → { accountId, label }. */
  async function resolveAssignee(who: string): Promise<{ accountId: string | null; label: string }> {
    const want = who.trim();
    if (/^(none|unassign)$/i.test(want)) return { accountId: null, label: 'nobody' };
    if (/^me$/i.test(want)) {
      const me = await currentUser();
      return { accountId: me.accountId, label: me.displayName };
    }
    const users = await client.findUsers(want);
    const user = users.find((u) => u.emailAddress?.toLowerCase() === want.toLowerCase()) ?? users[0];
    if (!user) throw new Error(`No JIRA user matches "${want}"`);
    return { accountId: user.accountId, label: user.displayName };
  }

  async function pickAssignee(key: string): Promise<{ accountId: string | null; label: string } | null> {
    const users = await client.assignableUsers(key);
    const pick = await askSelect({
      title: `Assign ${key}`,
      subtitle: summaryOf(key),
      items: [
        { id: 'me', label: 'me', hint: config.login },
        { id: 'none', label: 'unassign' },
        ...users.map((u) => ({ id: u.accountId, label: u.displayName, hint: u.emailAddress || undefined })),
      ],
    });
    if (!pick) return null;
    if (pick.id === 'me' || pick.id === 'none') return resolveAssignee(pick.id);
    return { accountId: pick.id, label: pick.label };
  }

  /** Team scope without JIRA_TEAM: ask once for the emails and keep them for the session. */
  async function ensureTeam(): Promise<boolean> {
    if (getSnapshot().teamJql) return true;
    const typed = await askText({
      title: 'Who is on your team?',
      subtitle: 'Comma-separated emails (or a JQL fragment). Set JIRA_TEAM to skip this.',
      placeholder: 'a@example.com, b@example.com',
    });
    const teamJql = teamJqlFrom(typed ?? undefined);
    if (!teamJql) return false;
    tuiStore.setProject(getSnapshot().project, teamJql);
    tuiStore.log('info', 'Team set for this session', `${teamJql}\nExport JIRA_TEAM in your shell to make it permanent.`);
    return true;
  }

  const actions: TuiActions = {
    async selectScope(scope: Scope) {
      if (scope === 'team' && !(await ensureTeam())) return;
      tuiStore.setScope(scope);
      tuiStore.goTo('main');
      await loadIssues(scopeQuery(scope));
    },
    loadIssues,
    refresh,
    async setTeam(spec: string) {
      const teamJql = teamJqlFrom(spec);
      if (!teamJql) {
        tuiStore.setPaletteError('Usage: /team a@x.com,b@x.com  (or a JQL fragment)');
        return;
      }
      tuiStore.setProject(getSnapshot().project, teamJql);
      tuiStore.log('info', 'Team set for this session', `${teamJql}\nExport JIRA_TEAM in your shell to make it permanent.`);
    },
    async ticketMenu(key: string) {
      const choice = await askSelect({
        title: key,
        subtitle: summaryOf(key),
        items: [
          { id: 'view', label: 'View', hint: 'details, description, comments' },
          { id: 'move', label: 'Move status', hint: 'pick a transition' },
          { id: 'assign', label: 'Assign', hint: 'me, unassign, or a user' },
          { id: 'comment', label: 'Comment', hint: 'add a comment' },
          { id: 'open', label: 'Open in browser' },
        ],
      });
      if (!choice) return;
      if (choice.id === 'view') await actions.viewIssue(key);
      else if (choice.id === 'move') await actions.moveIssue(key);
      else if (choice.id === 'assign') await actions.assignIssue(key);
      else if (choice.id === 'comment') await actions.commentIssue(key);
      else actions.openInBrowser(key);
    },
    async viewIssue(key: string) {
      await guarded(`Fetching ${key}`, async () => {
        const issue = await client.getIssue(key);
        tuiStore.log('command', `${issue.key}  ${issue.summary}`);
        tuiStore.showViewer({
          title: `${issue.key}  ${issue.summary}`,
          subtitle: `${issue.type} · ${issue.status} · ${issue.assignee ?? 'Unassigned'}`,
          lines: issueDetailLines(issue, client.issueUrl(issue.key)),
          issueKey: issue.key,
        });
      });
    },
    async moveIssue(key: string, target?: string) {
      await guarded(`Moving ${key}`, async () => {
        const transitions = await client.transitions(key);
        let match = target ? matchTransition(transitions, target) : undefined;
        if (target && !match) tuiStore.log('warn', `${key}: no transition to "${target}" — pick one`);
        if (!match) {
          const pick = await askSelect({
            title: `Move ${key}`,
            subtitle: summaryOf(key),
            items: transitions.map((t) => ({ id: t.id, label: t.to, hint: t.name !== t.to ? `via ${t.name}` : undefined })),
          });
          if (!pick) return;
          match = transitions.find((t) => t.id === pick.id);
        }
        if (!match) return;
        await client.transition(key, match.id);
        tuiStore.log('result', `${key} → ${match.to}`);
        await refresh();
      });
    },
    async assignIssue(key: string, who?: string) {
      await guarded(`Assigning ${key}`, async () => {
        const assignee = who ? await resolveAssignee(who) : await pickAssignee(key);
        if (!assignee) return;
        await client.assign(key, assignee.accountId);
        tuiStore.log('result', assignee.accountId ? `${key} assigned to ${assignee.label}` : `${key} unassigned`);
        await refresh();
      });
    },
    async commentIssue(key: string, text?: string) {
      await guarded(`Commenting on ${key}`, async () => {
        const body = text ?? (await askText({ title: `Comment on ${key}`, subtitle: summaryOf(key), placeholder: 'Your comment' }));
        if (!body) return;
        await client.addComment(key, body);
        tuiStore.log('result', `Comment added to ${key}`, body);
      });
    },
    async createIssue(type?: string, summary?: string) {
      await guarded('Creating ticket', async () => {
        const pickedType =
          type ?? (await askSelect({ title: 'Create ticket', subtitle: 'Issue type', items: ISSUE_TYPES.map((t) => ({ id: t, label: t })) }))?.id;
        if (!pickedType) return;
        const pickedSummary = summary ?? (await askText({ title: `New ${pickedType}`, placeholder: 'Summary' }));
        if (!pickedSummary) return;
        const project = getSnapshot().project;
        const created = await client.createIssue({ project, type: pickedType, summary: pickedSummary });
        tuiStore.log('result', `Created ${created.key}`, `${pickedType}: ${pickedSummary}\n${client.issueUrl(created.key)}`);
        await refresh();
      });
    },
    async switchProject(key?: string) {
      await guarded('Switching project', async () => {
        let target = key;
        if (!target) {
          const projects = await client.projects();
          const pick = await askSelect({
            title: 'Switch project',
            subtitle: `${projects.length} projects — type to filter`,
            items: projects.map((p) => ({ id: p.key, label: p.key, hint: p.name })),
          });
          if (!pick) return;
          target = pick.id;
        }
        const project = await client.project(target);
        tuiStore.setProject(project.key, getSnapshot().teamJql);
        tuiStore.log('info', `Project: ${project.key} — ${project.name}`);
        await loadProjectBoard(project.key);
        tuiStore.goTo('main');
        await loadIssues(scopeQuery(getSnapshot().scope));
      });
    },
    openInBrowser(key: string) {
      const url = client.issueUrl(key);
      execFile(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], (err) => {
        if (err) tuiStore.log('error', `Could not open ${url}`, describe(err));
      });
      tuiStore.setStatusMessage(`Opened ${url}`);
    },
    goToBoard() {
      tuiStore.goTo('board');
    },
    goToMain() {
      tuiStore.goTo('main');
    },
    goToWelcome() {
      tuiStore.goTo('welcome');
    },
    async quit() {
      if (quitting) return;
      quitting = true;
      unmount();
      leaveAltScreen();
    },
    loadProjectBoard,
  };
  return actions;
}

async function main(): Promise<void> {
  const { config, problems } = loadConfig(process.env, undefined, { project: projectFromArgs(process.argv.slice(2)) });
  if (!config) {
    process.stderr.write(`jira-tui cannot start:\n${problems.map((p) => `  - ${p}`).join('\n')}\nRun: jira-tui doctor\n`);
    process.exit(1);
  }
  const client = new JiraClient(config);
  tuiStore.setProject(config.project, config.teamJql);

  enterAltScreen();
  let instance: ReturnType<typeof render> | null = null;
  const actions = createActions(client, config, () => instance?.unmount());
  instance = render(React.createElement(TuiApp, { actions }), { patchConsole: true, exitOnCtrlC: false });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => void actions.quit());
  }

  client
    .me()
    .then((me) => {
      tuiStore.setMe(me);
      tuiStore.setStatusMessage(`${config.server} · signed in as ${me.displayName}`);
    })
    .catch((err) => tuiStore.setStatusMessage(`JIRA login failed: ${describe(err)} — run jira-tui doctor`));
  void actions.loadProjectBoard(config.project);

  await instance.waitUntilExit();
  await actions.quit();
  process.exit(0);
}

if (process.env.JIRA_TUI_NO_MAIN !== '1') {
  void main().catch((err) => {
    leaveAltScreen();
    process.stderr.write(`${describe(err)}\n`);
    process.exit(1);
  });
}
