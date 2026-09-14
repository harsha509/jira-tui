import React from 'react';
import { Box, Text } from 'ink';
import type { Issue } from '../../jira/types.js';
import { COLORS, statusColor, symbols } from '../theme.js';
import { pad, truncate } from '../issue-format.js';
import { windowFor } from '../useLayout.js';

export interface IssuePanelProps {
  issues: Issue[];
  label: string;
  loading: boolean;
  error: string | null;
  selected: number;
  focused: boolean;
  width: number;
  visibleRows: number;
}

/** Right-hand column: the current issue list, windowed around the selection. */
export function IssuePanel({ issues, label, loading, error, selected, focused, width, visibleRows }: IssuePanelProps) {
  const inner = Math.max(10, width - 4);
  const { items, start } = windowFor(issues, selected, visibleRows);
  const showAssignee = inner >= 60;
  const summaryWidth = inner - 2 - 9 - 13 - (showAssignee ? 15 : 0);

  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle="round"
      borderColor={focused ? COLORS.brand : COLORS.muted}
      paddingX={1}
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text color={focused ? COLORS.brand : COLORS.dimmed} bold wrap="truncate">
          Issues
        </Text>
        <Text color={COLORS.dimmed} wrap="truncate">
          {focused ? '↑↓ · enter actions · esc back' : issues.length > 0 ? '⇧tab to select' : ''}
        </Text>
      </Box>
      <Text color={COLORS.dimmed} wrap="truncate">
        {loading ? 'Loading…' : `${label || 'no query'} · ${issues.length} issue${issues.length === 1 ? '' : 's'}`}
      </Text>
      {error ? (
        <Text color={COLORS.red} wrap="truncate">
          {error}
        </Text>
      ) : issues.length === 0 && !loading ? (
        <Text color={COLORS.dimmed}>Nothing here — /list, /jql or type text to search.</Text>
      ) : (
        items.map((issue, i) => {
          const index = start + i;
          const isSelected = index === selected;
          const highlight = isSelected && focused;
          return (
            <Text key={issue.key} wrap="truncate" bold={highlight}>
              <Text color={isSelected ? COLORS.brand : COLORS.dimmed}>{isSelected ? `${symbols.prompt} ` : '  '}</Text>
              <Text color={highlight ? COLORS.brand : COLORS.white}>{pad(issue.key, 8)} </Text>
              <Text color={statusColor(issue.status)}>{pad(issue.status, 12)} </Text>
              {showAssignee ? <Text color={COLORS.label}>{pad(issue.assignee ?? '—', 14)} </Text> : null}
              <Text color={highlight ? COLORS.brand : COLORS.white}>{truncate(issue.summary, summaryWidth)}</Text>
            </Text>
          );
        })
      )}
    </Box>
  );
}
