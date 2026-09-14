import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS, statusColor } from '../theme.js';
import { getSnapshot, subscribe } from '../store.js';
import type { TuiActions } from '../commands.js';
import { Header } from '../components/Header.js';
import { StatusBar } from '../components/StatusBar.js';
import { groupByStatus, issueRow } from '../issue-format.js';
import { useAvailableRows } from '../useLayout.js';
import { CHROME_COLS, FRAME_ROWS, HEADER_ROWS, STATUS_BAR_ROWS } from '../layout.js';

export interface BoardScreenProps {
  actions: TuiActions;
}

interface BoardRow {
  key: string;
  text: string;
  color: string;
  bold: boolean;
}

/** The current list grouped by status in board column order. */
export function BoardScreen({ actions }: BoardScreenProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const cols = stdout.columns || 80;
  const viewport = useAvailableRows(FRAME_ROWS + HEADER_ROWS + STATUS_BAR_ROWS + 2);
  const [offset, setOffset] = useState(0);
  const width = Math.max(20, cols - CHROME_COLS - 2);

  const boardRows = useMemo<BoardRow[]>(() => {
    const out: BoardRow[] = [];
    for (const group of groupByStatus(ui.issues)) {
      if (out.length) out.push({ key: `gap:${group.status}`, text: '', color: COLORS.dimmed, bold: false });
      out.push({ key: `h:${group.status}`, text: `${group.status} (${group.issues.length})`, color: statusColor(group.status), bold: true });
      for (const issue of group.issues) {
        out.push({ key: issue.key, text: `  ${issueRow(issue, width - 2)}`, color: COLORS.white, bold: false });
      }
    }
    return out;
  }, [ui.issues, width]);

  const maxOffset = Math.max(0, boardRows.length - viewport);
  const clamped = Math.min(offset, maxOffset);
  const visible = boardRows.slice(clamped, clamped + viewport);

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl && !key.meta) void actions.quit();
    else if (input === 'r') void actions.refresh();
    else if (key.upArrow) setOffset((o) => Math.max(0, o - 1));
    else if (key.downArrow) setOffset((o) => Math.min(maxOffset, o + 1));
    else if (key.pageUp) setOffset((o) => Math.max(0, o - viewport));
    else if (key.pageDown) setOffset((o) => Math.min(maxOffset, o + viewport));
    else if (key.escape || key.return) actions.goToMain();
  });

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
        <Header subtitle={`Board · ${ui.query?.label ?? 'no list loaded'} · ${ui.issues.length} issues`} />
        <Box flexDirection="column" marginTop={1} height={viewport} overflow="hidden">
          {ui.issuesLoading ? (
            <Text color={COLORS.dimmed}>Loading…</Text>
          ) : ui.issuesError ? (
            <Text color={COLORS.red}>{ui.issuesError}</Text>
          ) : boardRows.length === 0 ? (
            <Text color={COLORS.dimmed}>Nothing to show — load a list first (/list).</Text>
          ) : (
            visible.map((row) => (
              <Text key={row.key} color={row.color} bold={row.bold} wrap="truncate">
                {row.text || ' '}
              </Text>
            ))
          )}
        </Box>
      </Box>
      <StatusBar
        breadcrumb="Board"
        hints={[maxOffset > 0 ? `↑↓ scroll (${clamped + 1}/${boardRows.length})` : '', 'r refresh', 'esc back', 'q quit'].filter(Boolean)}
        message={ui.statusMessage}
      />
    </Box>
  );
}
