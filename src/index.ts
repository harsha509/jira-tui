import { execFile } from 'node:child_process';
import React from 'react';
import { render } from 'ink';
import { loadConfig, type JiraConfig } from './config.js';
import { JiraClient } from './jira/client.js';
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
function createActions(client: JiraClient, config: JiraConfig, unmount: () => void): TuiActions {
  let quitting = false;

  async function loadIssues(query: IssueQuery): Promise<void> {
    tuiStore.setIssuesLoading(query);
    await guarded(`Loading ${query.label}`, async () => {
      const issues = await client.search(query.jql);
      tuiStore.setIssues(issues);
      tuiStore.log('result', `${issues.length} issue${issues.length === 1 ? '' : 's'} — ${query.label}`);
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

  const actions: TuiActions = {
    async selectScope(scope: Scope) {
      if (scope === 'team' && !config.teamJql) {
        tuiStore.setStatusMessage('JIRA_TEAM is not set — export a JQL fragment or comma-separated emails.');
        return;
      }
      tuiStore.setScope(scope);
      tuiStore.goTo('main');
      await loadIssues(scopeQuery(scope));
    },
    loadIssues,
    refresh,
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
        const created = await client.createIssue({ project: config.project, type: pickedType, summary: pickedSummary });
        tuiStore.log('result', `Created ${created.key}`, `${pickedType}: ${pickedSummary}\n${client.issueUrl(created.key)}`);
        await refresh();
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
  };
  return actions;
}

async function main(): Promise<void> {
  const { config, problems } = loadConfig();
  if (!config) {
    process.stderr.write(`jira-tui cannot start:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
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
    .catch((err) => tuiStore.setStatusMessage(`JIRA login failed: ${describe(err)}`));

  await instance.waitUntilExit();
  await actions.quit();
  process.exit(0);
}

void main().catch((err) => {
  leaveAltScreen();
  process.stderr.write(`${describe(err)}\n`);
  process.exit(1);
});
