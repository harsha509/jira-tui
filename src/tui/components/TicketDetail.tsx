import React from 'react';
import { Box, Text } from 'ink';
import type { Issue } from '../../jira/types.js';
import { COLORS, statusColor, symbols } from '../theme.js';
import { relativeTime, truncate } from '../issue-format.js';

export interface TicketDetailProps {
  issue: Issue | undefined;
  width: number;
  focused: boolean;
}

/** Strip under the ticket list: what the cursor is on and what Enter will do with it; always DETAIL_ROWS tall. */
export function TicketDetail({ issue, width, focused }: TicketDetailProps) {
  const inner = Math.max(10, width - 4);
  return (
    <Box flexDirection="column" width={width} height={6} overflow="hidden" borderStyle="round" borderColor={COLORS.muted} paddingX={1}>
      {issue ? (
        <>
          <Text wrap="truncate">
            <Text color={COLORS.brand} bold>
              {issue.key}
            </Text>
            <Text color={COLORS.dimmed}>
              {' '}
              {symbols.dot} {issue.type} {symbols.dot} {issue.priority ?? 'no priority'} {symbols.dot} updated {relativeTime(issue.updated)}
            </Text>
          </Text>
          <Text color={COLORS.white} wrap="truncate">
            {truncate(issue.summary, inner)}
          </Text>
          <Text wrap="truncate">
            <Text color={statusColor(issue.status)}>{issue.status}</Text>
            <Text color={COLORS.dimmed}>
              {' '}
              {symbols.dot} {issue.assignee ?? 'Unassigned'}
            </Text>
          </Text>
          <Text color={focused ? COLORS.step : COLORS.dimmed} wrap="truncate">
            enter actions · v view · m move status · a assign · c comment · o open
          </Text>
        </>
      ) : (
        <Text color={COLORS.dimmed}>Select a ticket to see its details here.</Text>
      )}
    </Box>
  );
}
