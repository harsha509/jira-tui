import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { COLORS, symbols } from '../theme.js';

const BANNER = [
  '     ██ ██ ██████   █████ ',
  '     ██ ██ ██   ██ ██   ██',
  '     ██ ██ ██████  ███████',
  '██   ██ ██ ██   ██ ██   ██',
  ' █████  ██ ██   ██ ██   ██',
];

export const BANNER_MIN_COLUMNS = 26 + 8;

/** Block-letter wordmark; falls back to one line on narrow terminals. */
export function Wordmark() {
  const { stdout } = useStdout();
  const columns = stdout.columns || 80;
  if (columns < BANNER_MIN_COLUMNS) {
    return (
      <Text color={COLORS.brand} bold>
        {symbols.diamond} JIRA
      </Text>
    );
  }
  return (
    <Box flexDirection="column" alignItems="center">
      {BANNER.map((line, i) => (
        <Text key={i} color={COLORS.brand} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}
