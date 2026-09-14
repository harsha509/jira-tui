import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS } from '../theme.js';
import { getSnapshot, subscribe, tuiStore, type TranscriptEntry } from '../store.js';
import { completeCommand, executeLine, matchCommands, type TuiActions } from '../commands.js';
import { historyLines, recordLine } from '../input-history.js';
import { Header } from '../components/Header.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { IssuePanel } from '../components/IssuePanel.js';
import { StatusBar } from '../components/StatusBar.js';
import {
  columnWidths,
  inputLineBudget,
  inputLineCount,
  issuePanelRows,
  transcriptRows,
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

interface TranscriptRow {
  key: string;
  text: string;
  color?: string;
  indent: boolean;
}

type Focus = 'input' | 'issues' | 'transcript';

/** Module scope: dialogs unmount the screen, and the pane you were in must survive that. */
let rememberedFocus: Focus = 'input';

export function resetMainFocus(): void {
  rememberedFocus = 'input';
}

/** One object per rendered line so scrolling counts rows, not entries. */
function toRows(entries: TranscriptEntry[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];
  for (const entry of entries) {
    rows.push({ key: `${entry.id}:text`, text: entry.text, color: KIND_COLOR[entry.kind], indent: false });
    entry.detail?.split('\n').forEach((line, j) => {
      rows.push({ key: `${entry.id}:d${j}`, text: line, color: COLORS.dimmed, indent: true });
    });
  }
  return rows;
}

function Transcript({
  rows,
  budget,
  scrolledBy,
  total,
  focused,
}: {
  rows: TranscriptRow[];
  budget: number;
  scrolledBy: number;
  total: number;
  focused: boolean;
}) {
  const scrollable = total > budget;
  return (
    <Box
      flexDirection="column"
      height={budget + 3}
      overflow="hidden"
      borderStyle="round"
      borderColor={focused ? COLORS.brand : COLORS.muted}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={focused ? COLORS.brand : COLORS.dimmed} bold>
          Transcript
        </Text>
        <Text color={scrolledBy > 0 ? COLORS.yellow : COLORS.dimmed} wrap="truncate">
          {focused ? (scrolledBy > 0 ? `↑${scrolledBy} · ↑↓ scroll · esc back` : '↑↓ scroll · esc back') : scrollable ? '⇧tab to scroll' : ''}
        </Text>
      </Box>
      {rows.length === 0 ? (
        <Text color={COLORS.dimmed}>Nothing yet — type a ticket number, some text, or /help.</Text>
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

/** Main window: transcript + command palette/prompt on the left, the issue list on the right. */
export function MainScreen({ actions }: MainScreenProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);
  const [value, setValue] = useState('');
  const [focus, setFocusState] = useState<Focus>(rememberedFocus);
  const { stdout } = useStdout();

  function setFocus(next: Focus): void {
    rememberedFocus = next;
    setFocusState(next);
  }
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;

  const widths = columnWidths(cols);
  const maxCommands = visibleCommandCount(rows);
  const listVisible = value.trimStart().startsWith('/') && maxCommands >= 3;
  const inputLines = inputLineCount(value, widths.left, inputLineBudget(rows));
  const transcriptBudget = transcriptRows(rows, listVisible, inputLines);

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
  const [scrolledBy, setScrolledBy] = useState(0);
  const maxScroll = Math.max(0, allRows.length - transcriptBudget);
  const scroll = Math.min(scrolledBy, maxScroll);
  const visibleRows = allRows.slice(maxScroll - scroll, maxScroll - scroll + transcriptBudget);

  const previousRowCount = useRef(allRows.length);
  useEffect(() => {
    const added = allRows.length - previousRowCount.current;
    previousRowCount.current = allRows.length;
    if (added > 0 && scrolledBy > 0) setScrolledBy((o) => o + added);
  }, [allRows.length, scrolledBy]);

  function nextFocus(current: Focus): Focus {
    if (current === 'input') return ui.issues.length > 0 ? 'issues' : maxScroll > 0 ? 'transcript' : 'input';
    if (current === 'issues') return maxScroll > 0 ? 'transcript' : 'input';
    return 'input';
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

  useInput((input, key) => {
    const page = Math.max(1, transcriptBudget - 1);
    if (key.tab && key.shift) {
      setFocus(nextFocus(focus));
      return;
    }
    if (focus === 'issues') {
      const selected = ui.issues[ui.issuesSelected];
      if (key.upArrow) tuiStore.setIssuesSelected(ui.issuesSelected - 1);
      else if (key.downArrow) tuiStore.setIssuesSelected(ui.issuesSelected + 1);
      else if (key.pageUp) tuiStore.setIssuesSelected(ui.issuesSelected - issuePanelRows(rows));
      else if (key.pageDown) tuiStore.setIssuesSelected(ui.issuesSelected + issuePanelRows(rows));
      else if (key.return && selected) void actions.ticketMenu(selected.key);
      else if (key.escape) setFocus('input');
      else if (selected && !key.ctrl && !key.meta && issueShortcut(input, selected.key)) return;
      else if (input && !key.ctrl && !key.meta && !key.tab) {
        setFocus('input');
        setValue((v) => v + input);
      }
      return;
    }
    if (focus === 'transcript') {
      if (key.upArrow) setScrolledBy((o) => Math.min(maxScroll, o + 1));
      else if (key.downArrow) setScrolledBy((o) => Math.max(0, o - 1));
      else if (key.pageUp) setScrolledBy((o) => Math.min(maxScroll, o + page));
      else if (key.pageDown) setScrolledBy((o) => Math.max(0, o - page));
      else if (key.return || key.escape) setFocus('input');
      else if (input && !key.ctrl && !key.meta && !key.tab) {
        setFocus('input');
        setValue((v) => v + input);
      }
      return;
    }
    if (key.escape) {
      if (value) {
        setValue('');
        tuiStore.setPaletteError(null);
      } else if (ui.issues.length > 0) {
        setFocus('issues');
      } else {
        actions.goToWelcome();
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
    else if (key.pageUp) setScrolledBy((o) => Math.min(maxScroll, o + page));
    else if (key.pageDown) setScrolledBy((o) => Math.max(0, o - page));
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
    setScrolledBy(0);
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

  const subtitle = `${ui.project} · ${ui.me?.displayName ?? '…'} · ${ui.query?.label ?? 'no list loaded'}`;
  const hints =
    focus === 'input'
      ? ['/help', 'esc tickets', '⇧tab panes', 'tab complete', '↑↓ history', 'ctrl+c quit']
      : focus === 'issues'
        ? ['enter actions', 'v view', 'm move', 'a assign', 'c comment', 'o open', 'esc prompt']
        : ['↑↓ scroll', 'esc prompt', 'ctrl+c quit'];

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
        <Header subtitle={subtitle} />
        <Box flexDirection="row" flexGrow={1}>
          <Box flexDirection="column" width={widths.left} marginRight={1}>
            <Transcript
              rows={visibleRows}
              budget={transcriptBudget}
              scrolledBy={scroll}
              total={allRows.length}
              focused={focus === 'transcript'}
            />
            <CommandPalette
              width={widths.left}
              maxCommands={maxCommands}
              query={value}
              onQueryChange={updateQuery}
              onSubmit={submit}
              disabled={ui.running}
              error={ui.paletteError}
              busyText={ui.busyMessage}
              focused={focus === 'input'}
              placeholder="Ticket no, text, or /help"
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
      <StatusBar breadcrumb={focus === 'issues' ? 'Tickets' : 'Main'} hints={hints} message={ui.statusMessage} />
    </Box>
  );
}
