import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, symbols } from '../theme.js';

export interface HeaderProps {
  subtitle?: string;
}

/** Brand header shared by the main and board screens; exactly HEADER_ROWS tall. */
export function Header({ subtitle }: HeaderProps) {
  return (
    <Box flexDirection="column">
      <Text color={COLORS.brand} bold>
        {symbols.diamond} JIRA
      </Text>
      <Text color={COLORS.dimmed} wrap="truncate">
        {subtitle || ' '}
      </Text>
    </Box>
  );
}
