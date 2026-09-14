import { searchJql } from '../jira/jql.js';
import { COMMANDS, type TuiActions } from './commands.js';
import { resolveIssueKey } from './issue-format.js';
import { askText } from './modal.js';
import { getSnapshot, tuiStore } from './store.js';

export interface MenuItem {
  id: string;
  label: string;
  hint: string;
  /** After running, move the cursor into the ticket pane when it has rows. */
  focusIssues?: boolean;
  run(actions: TuiActions): Promise<void> | void;
}

/** The left pane's options, in display order. */
export const MENU: MenuItem[] = [
  {
    id: 'mine',
    label: 'My open tickets',
    hint: 'assigned to me',
    focusIssues: true,
    run: (actions) => actions.selectScope('mine'),
  },
  {
    id: 'team',
    label: 'Team open tickets',
    hint: 'JIRA_TEAM or /team',
    focusIssues: true,
    run: (actions) => actions.selectScope('team'),
  },
  {
    id: 'all',
    label: 'All open tickets',
    hint: 'every board status',
    focusIssues: true,
    run: (actions) => actions.selectScope('all'),
  },
  {
    id: 'search',
    label: 'Search tickets…',
    hint: 'by summary text',
    focusIssues: true,
    run: async (actions) => {
      const text = await askText({ title: 'Search tickets', placeholder: 'words in the summary' });
      if (!text) return;
      await actions.loadIssues({ label: `search "${text}"`, jql: searchJql(getSnapshot().project, text) });
    },
  },
  {
    id: 'ticket',
    label: 'Open a ticket…',
    hint: 'by number or key',
    run: async (actions) => {
      const typed = await askText({ title: 'Open ticket', placeholder: `number (92) or key (${getSnapshot().project || 'ABC'}-92)` });
      if (!typed) return;
      const key = resolveIssueKey(typed, getSnapshot().project);
      if (!key) {
        tuiStore.log('warn', `"${typed}" is not a ticket number or key`);
        return;
      }
      await actions.ticketMenu(key);
    },
  },
  {
    id: 'create',
    label: 'Create ticket…',
    hint: 'type, then summary',
    run: (actions) => actions.createIssue(),
  },
  {
    id: 'board',
    label: 'Board view',
    hint: 'current list by column',
    run: (actions) => actions.goToBoard(),
  },
  {
    id: 'project',
    label: 'Switch project…',
    hint: 'pick any project',
    focusIssues: true,
    run: (actions) => actions.switchProject(),
  },
  {
    id: 'refresh',
    label: 'Refresh list',
    hint: 'reload the current query',
    focusIssues: true,
    run: (actions) => actions.refresh(),
  },
  {
    id: 'help',
    label: 'Help',
    hint: 'keys and /commands',
    run: (actions) => COMMANDS.find((c) => c.id === 'help')!.run(actions, ''),
  },
  {
    id: 'quit',
    label: 'Quit',
    hint: 'ctrl+c also works',
    run: (actions) => actions.quit(),
  },
];
