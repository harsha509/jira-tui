import React, { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS } from '../theme.js';
import { getSnapshot, subscribe, tuiStore, visibleIssues, type MainFocus, type TranscriptEntry } from '../store.js';
import { completeCommand, executeLine, matchCommands, type TuiActions } from '../commands.js';
import { historyLines, recordLine } from '../input-history.js';
import { buildFilterItems, clampIndex, stepIndex } from '../filters.js';
import { Header } from '../components/Header.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { FilterPane } from '../components/FilterPane.js';
import { IssuePanel } from '../components/IssuePanel.js';
import { StatusBar } from '../components/StatusBar.js';
import { TicketDetail } from '../components/TicketDetail.js';
import {
  columnWidths,
  filterRows,
  inputLineBudget,
  inputLineCount,
  ticketRows,
  visibleCommandCount,
  MIN_MAIN_ROWS,
} from '../layout.js';

const KIND_PREFIX: Record<TranscriptEntry['kind'], string> = {
  info: '',
  warn: '! ',
  error: '✗ ',
  command: '',
  result: '✓ ',
};

export interface MainScreenProps {
  actions: TuiActions;
}

/** Main window: filters on the left (pick once), tickets + the selected ticket's details and actions on the right. */
export function MainScreen({ actions }: MainScreenProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);
  const [value, setValue] = useState('');
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;

  const items = useMemo(() => buildFilterItems(ui), [ui]);
  const tickets = useMemo(() => visibleIssues(ui), [ui]);
  const focus = ui.mainFocus;
  const filterIndex = clampIndex(items, ui.menuIndex);
  const selectedTicket = tickets[ui.issuesSelected];

  function setFocus(next: MainFocus): void {
    tuiStore.setMainFocus(next);
  }

  const widths = columnWidths(cols);
  const maxCommands = visibleCommandCount(rows);
  const listVisible = focus === 'prompt' && value.trimStart().startsWith('/') && maxCommands >= 3;
  const inputLines = inputLineCount(value, widths.left, inputLineBudget(rows));
  const filterVisible = filterRows(rows, listVisible, inputLines);
  const listRows = ticketRows(rows);

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

  /** Run the filter under the cursor; the cursor stays on the left until → or ⇧tab moves it. */
  async function runFilter(index: number): Promise<void> {
    const item = items[index];
    if (!item?.run || ui.running) return;
    tuiStore.setRunning(true);
    try {
      await item.run(actions);
    } catch (err) {
      tuiStore.log('error', err instanceof Error ? err.message : String(err));
    } finally {
      tuiStore.setRunning(false);
    }
  }

  /** Bare-letter shortcuts while the ticket list has focus. */
  function ticketShortcut(input: string, key: string): boolean {
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
      setFocus(focus === 'menu' ? (tickets.length > 0 ? 'issues' : 'prompt') : focus === 'issues' ? 'prompt' : 'menu');
      return;
    }
    if (focus === 'menu') {
      if (key.upArrow) tuiStore.setMenuIndex(stepIndex(items, filterIndex, -1));
      else if (key.downArrow) tuiStore.setMenuIndex(stepIndex(items, filterIndex, 1));
      else if (key.return) void runFilter(filterIndex);
      else if (key.rightArrow && tickets.length > 0) setFocus('issues');
      else if (key.escape) actions.goToWelcome();
      else if (input && !key.ctrl && !key.meta && !key.tab && input !== ' ') jumpToPrompt(input);
      return;
    }
    if (focus === 'issues') {
      if (key.upArrow) tuiStore.setIssuesSelected(ui.issuesSelected - 1);
      else if (key.downArrow) tuiStore.setIssuesSelected(ui.issuesSelected + 1);
      else if (key.pageUp) tuiStore.setIssuesSelected(ui.issuesSelected - listRows);
      else if (key.pageDown) tuiStore.setIssuesSelected(ui.issuesSelected + listRows);
      else if (key.return && selectedTicket) void actions.ticketMenu(selectedTicket.key);
      else if (key.escape || key.leftArrow) setFocus('menu');
      else if (selectedTicket && !key.ctrl && !key.meta && ticketShortcut(input, selectedTicket.key)) return;
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

  const subtitle = `${ui.project}${ui.board ? ` · ${ui.board.name}` : ''} · ${ui.me?.displayName ?? '…'}`;
  const listLabel = `${ui.query?.label ?? 'no list loaded'}${ui.statusFilter ? ` · ${ui.statusFilter}` : ''}`;
  const lastLog = ui.transcript[ui.transcript.length - 1];
  const message = lastLog ? `${KIND_PREFIX[lastLog.kind]}${lastLog.text}` : ui.statusMessage;
  const hints =
    focus === 'menu'
      ? ['↑↓ move', 'enter apply', '→ tickets', 'type / for commands', 'esc start page', 'ctrl+c quit']
      : focus === 'issues'
        ? ['↑↓ move', 'enter actions', 'v view', 'm move', 'a assign', 'c comment', 'o open', '← filters']
        : ['enter run', 'tab complete', '↑↓ history', 'esc filters', 'ctrl+c quit'];

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
        <Header subtitle={subtitle} />
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" width={widths.left} marginRight={1}>
            <FilterPane items={items} selected={filterIndex} focused={focus === 'menu'} visibleRows={filterVisible} width={widths.left} />
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
          <Box flexDirection="column" width={widths.right}>
            <Box height={listRows + 4}>
              <IssuePanel
                issues={tickets}
                label={listLabel}
                loading={ui.issuesLoading}
                error={ui.issuesError}
                selected={ui.issuesSelected}
                focused={focus === 'issues'}
                width={widths.right}
                visibleRows={listRows}
              />
            </Box>
            <Box marginTop={1}>
              <TicketDetail issue={selectedTicket} width={widths.right} focused={focus === 'issues'} />
            </Box>
          </Box>
        </Box>
      </Box>
      <StatusBar breadcrumb={focus === 'issues' ? 'Tickets' : focus === 'prompt' ? 'Prompt' : 'Filters'} hints={hints} message={message} />
    </Box>
  );
}
