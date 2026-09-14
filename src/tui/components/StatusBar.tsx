import React from 'react';
import { Box, Text } from 'ink';
import { COLORS } from '../theme.js';

export interface StatusBarProps {
  breadcrumb: string;
  hints: string[];
  message?: string;
}

/** Fixed bottom bar, always STATUS_BAR_ROWS tall; hints truncate from the right so order them by priority. */
export function StatusBar({ breadcrumb, hints, message }: StatusBarProps) {
  return (
    <Box flexDirection="column" marginTop={1} borderStyle="single" borderColor={COLORS.muted} paddingX={1}>
      <Box justifyContent="space-between">
        <Box flexShrink={0} marginRight={2}>
          <Text color={COLORS.brand} bold wrap="truncate">
            {breadcrumb}
          </Text>
        </Box>
        <Text color={COLORS.dimmed} wrap="truncate">
          {hints.join('  ·  ')}
        </Text>
      </Box>
      <Text color={COLORS.step} wrap="truncate">
        {message || ' '}
      </Text>
    </Box>
  );
}
