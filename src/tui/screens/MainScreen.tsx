import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS } from '../theme.js';
import { getSnapshot, subscribe, tuiStore, type MainFocus, type TranscriptEntry } from '../store.js';
import { completeCommand, executeLine, matchCommands, type TuiActions } from '../commands.js';
import { historyLines, recordLine } from '../input-history.js';
import { MENU } from '../menu.js';
import { Header } from '../components/Header.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { IssuePanel } from '../components/IssuePanel.js';
import { MenuPane } from '../components/MenuPane.js';
import { StatusBar } from '../components/StatusBar.js';
import {
  columnWidths,
  inputLineBudget,
  inputLineCount,
  issuePanelRows,
  leftLayout,
  visibleCommandCount,
  MIN_MAIN_ROWS,
} from '../layout.js';

const KIND_COLOR: Record<TranscriptEntry['kind'], string> = {
  info: COLORS.white,
  warn: COLORS.yellow,
  error: COLORS.red,
  command: COLORS.dimmed,
  result: COLORS.green,
};

interface LogRow {
  key: string;
  text: string;
  color?: string;
  indent: boolean;
}

/** One object per rendered line, newest last. */
function toRows(entries: TranscriptEntry[]): LogRow[] {
  const rows: LogRow[] = [];
  for (const entry of entries) {
    rows.push({ key: `${entry.id}:text`, text: entry.text, color: KIND_COLOR[entry.kind], indent: false });
    entry.detail?.split('\n').forEach((line, j) => {
      rows.push({ key: `${entry.id}:d${j}`, text: line, color: COLORS.dimmed, indent: true });
    });
  }
  return rows;
}

function Log({ rows, budget }: { rows: LogRow[]; budget: number }) {
  return (
    <Box
      flexDirection="column"
      marginTop={1}
      height={budget + 3}
      overflow="hidden"
      borderStyle="round"
      borderColor={COLORS.muted}
      paddingX={1}
    >
      <Text color={COLORS.dimmed} bold>
        Log
      </Text>
      {rows.length === 0 ? (
        <Text color={COLORS.dimmed}>Results and errors show here.</Text>
      ) : (
        rows.map((row) => (
          <Box key={row.key} marginLeft={row.indent ? 2 : 0}>
            <Text color={row.color} wrap="truncate">
              {row.text || ' '}
            </Text>
          </Box>
        ))
      )}
    </Box>
  );
}

export interface MainScreenProps {
  actions: TuiActions;
}

/** Main window: menu, log and slash prompt on the left; the ticket list on the right. */
export function MainScreen({ actions }: MainScreenProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);
  const [value, setValue] = useState('');
  const focus = ui.mainFocus;
  const menuIndex = Math.min(ui.menuIndex, MENU.length - 1);
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;

  function setFocus(next: MainFocus): void {
    tuiStore.setMainFocus(next);
  }

  function setMenuIndex(next: number): void {
    tuiStore.setMenuIndex(Math.max(0, Math.min(MENU.length - 1, next)));
  }

  const widths = columnWidths(cols);
  const maxCommands = visibleCommandCount(rows);
  const listVisible = focus === 'prompt' && value.trimStart().startsWith('/') && maxCommands >= 3;
  const inputLines = inputLineCount(value, widths.left, inputLineBudget(rows));
  const { menuVisible, logRows } = leftLayout(rows, MENU.length, listVisible, inputLines);

  const history = historyLines();
  const [historyIndex, setHistoryIndex] = useState(0);
  const draftRef = useRef('');

  function recallHistory(direction: -1 | 1): void {
    if (history.length === 0) return;
    const next = Math.min(history.length, Math.max(0, historyIndex - direction));
    if (next === historyIndex) return;
    if (historyIndex === 0) draftRef.current = value;
    setHistoryIndex(next);
    setValue(next === 0 ? draftRef.current : history[history.length - next]);
  }

  const allRows = useMemo(() => toRows(ui.transcript), [ui.transcript]);
  const logTail = allRows.slice(Math.max(0, allRows.length - logRows));

  /** Run a menu item; when it produced a list, hand the cursor to the ticket pane. */
  async function runMenuItem(index: number): Promise<void> {
    const item = MENU[index];
    if (!item || ui.running) return;
    tuiStore.setRunning(true);
    try {
      await item.run(actions);
    } catch (err) {
      tuiStore.log('error', err instanceof Error ? err.message : String(err));
    } finally {
      tuiStore.setRunning(false);
    }
    if (item.focusIssues && getSnapshot().issues.length > 0 && getSnapshot().screen === 'main') setFocus('issues');
  }

  /** Bare-letter shortcuts while the issue list has focus. */
  function issueShortcut(input: string, key: string): boolean {
    const run: Record<string, () => unknown> = {
      v: () => actions.viewIssue(key),
      m: () => actions.moveIssue(key),
      a: () => actions.assignIssue(key),
      c: () => actions.commentIssue(key),
      o: () => actions.openInBrowser(key),
    };
    const action = run[input];
    if (!action) return false;
    void action();
    return true;
  }

  function jumpToPrompt(seed: string): void {
    setFocus('prompt');
    setValue((v) => v + seed);
  }

  useInput((input, key) => {
    if (key.tab && key.shift) {
      setFocus(focus === 'menu' ? (ui.issues.length > 0 ? 'issues' : 'prompt') : focus === 'issues' ? 'prompt' : 'menu');
      return;
    }
    if (focus === 'menu') {
      if (key.upArrow) setMenuIndex(menuIndex > 0 ? menuIndex - 1 : MENU.length - 1);
      else if (key.downArrow) setMenuIndex(menuIndex < MENU.length - 1 ? menuIndex + 1 : 0);
      else if (key.return) void runMenuItem(menuIndex);
      else if (key.rightArrow && ui.issues.length > 0) setFocus('issues');
      else if (key.escape) actions.goToWelcome();
      else if (input && !key.ctrl && !key.meta && !key.tab && input !== ' ') jumpToPrompt(input);
      return;
    }
    if (focus === 'issues') {
      const selected = ui.issues[ui.issuesSelected];
      if (key.upArrow) tuiStore.setIssuesSelected(ui.issuesSelected - 1);
      else if (key.downArrow) tuiStore.setIssuesSelected(ui.issuesSelected + 1);
      else if (key.pageUp) tuiStore.setIssuesSelected(ui.issuesSelected - issuePanelRows(rows));
      else if (key.pageDown) tuiStore.setIssuesSelected(ui.issuesSelected + issuePanelRows(rows));
      else if (key.return && selected) void actions.ticketMenu(selected.key);
      else if (key.escape || key.leftArrow) setFocus('menu');
      else if (selected && !key.ctrl && !key.meta && issueShortcut(input, selected.key)) return;
      else if (input && !key.ctrl && !key.meta && !key.tab && input !== ' ') jumpToPrompt(input);
      return;
    }
    if (key.escape) {
      if (value) {
        setValue('');
        tuiStore.setPaletteError(null);
      } else {
        setFocus('menu');
      }
      return;
    }
    if (key.tab) {
      const completed = completeCommand(value);
      if (completed) {
        setValue(completed);
        tuiStore.setPaletteError(null);
        return;
      }
      const partial = value.trim();
      if (!partial.startsWith('/') || partial.includes(' ')) return;
      const matches = matchCommands(partial);
      tuiStore.setPaletteError(
        matches.length === 0
          ? `No command matches ${partial}`
          : matches.length === 1
            ? `${matches[0].name} — already complete`
            : matches.map((m) => m.name).join('  ')
      );
      return;
    }
    if (key.upArrow) recallHistory(-1);
    else if (key.downArrow) recallHistory(1);
  });

  function updateQuery(next: string): void {
    setValue(next);
    if (historyIndex !== 0) setHistoryIndex(0);
    if (ui.paletteError) tuiStore.setPaletteError(null);
  }

  async function submit(raw: string): Promise<void> {
    if (ui.running) return;
    setValue('');
    recordLine(raw);
    setHistoryIndex(0);
    draftRef.current = '';
    tuiStore.setRunning(true);
    try {
      await executeLine(raw, actions);
    } catch (err) {
      tuiStore.log('error', err instanceof Error ? err.message : String(err));
    } finally {
      tuiStore.setRunning(false);
    }
  }

  if (rows < MIN_MAIN_ROWS) {
    return (
      <Box flexDirection="column" height={rows} justifyContent="center" alignItems="center">
        <Text color={COLORS.yellow} bold>
          Terminal too small
        </Text>
        <Text color={COLORS.dimmed}>
          {rows} rows available, {MIN_MAIN_ROWS} needed — resize and it redraws.
        </Text>
      </Box>
    );
  }

  const subtitle = `${ui.project}${ui.board ? ` · ${ui.board.name}` : ''} · ${ui.me?.displayName ?? '…'} · ${ui.query?.label ?? 'no list loaded'}`;
  const hints =
    focus === 'menu'
      ? ['↑↓ move', 'enter select', '→ tickets', 'type / for commands', 'esc scope', 'ctrl+c quit']
      : focus === 'issues'
        ? ['↑↓ move', 'enter actions', 'v view', 'm move', 'a assign', 'c comment', 'o open', '← menu']
        : ['enter run', 'tab complete', '↑↓ history', 'esc menu', 'ctrl+c quit'];

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
        <Header subtitle={subtitle} />
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" width={widths.left} marginRight={1}>
            <MenuPane items={MENU} selected={menuIndex} focused={focus === 'menu'} visibleRows={menuVisible} width={widths.left} />
            {logRows > 0 ? <Log rows={logTail} budget={logRows} /> : null}
            <CommandPalette
              width={widths.left}
              maxCommands={maxCommands}
              query={value}
              onQueryChange={updateQuery}
              onSubmit={submit}
              disabled={ui.running}
              error={ui.paletteError}
              busyText={ui.busyMessage}
              focused={focus === 'prompt'}
              placeholder="/command, ticket no, or text"
              listVisible={listVisible}
              maxInputLines={inputLineBudget(rows)}
            />
          </Box>
          <IssuePanel
            issues={ui.issues}
            label={ui.query?.label ?? ''}
            loading={ui.issuesLoading}
            error={ui.issuesError}
            selected={ui.issuesSelected}
            focused={focus === 'issues'}
            width={widths.right}
            visibleRows={issuePanelRows(rows)}
          />
        </Box>
      </Box>
      <StatusBar breadcrumb={focus === 'issues' ? 'Tickets' : focus === 'prompt' ? 'Prompt' : 'Menu'} hints={hints} message={ui.statusMessage} />
    </Box>
  );
}
