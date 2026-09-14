import React from 'react';
import { Box, Text } from 'ink';
import { PromptInput } from './PromptInput.js';
import { COLORS, symbols } from '../theme.js';
import { matchCommands } from '../commands.js';
import { inputLineCount } from '../layout.js';

export interface CommandPaletteProps {
  width: number;
  maxCommands: number;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled: boolean;
  error?: string | null;
  busyText?: string;
  focused: boolean;
  placeholder: string;
  /** The command list is shown only while the line starts with `/`. */
  listVisible: boolean;
  maxInputLines: number;
}

const NAME_COLUMN_WIDTH = 12;

/** Filtered command list (while typing `/`) above the prompt; every row truncates so the height stays budgeted. */
export function CommandPalette({
  width,
  maxCommands,
  query,
  onQueryChange,
  onSubmit,
  disabled,
  error,
  busyText,
  focused,
  placeholder,
  listVisible,
  maxInputLines,
}: CommandPaletteProps) {
  const inputLines = inputLineCount(query, width, maxInputLines);
  const commandBudget = Math.max(1, maxCommands - (inputLines - 1));
  const matched = matchCommands(query);
  const commands = matched.slice(0, commandBudget);
  const hidden = matched.length - commands.length;

  return (
    <Box flexDirection="column" width={width} marginTop={1}>
      {listVisible ? (
        <Box flexDirection="column" borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
          <Text color={COLORS.brand} bold wrap="truncate">
            Command palette — type to filter, Enter to run
          </Text>
          <Box flexDirection="column" marginTop={1} height={commandBudget + 1} overflow="hidden">
            {commands.length === 0 ? (
              <Text color={COLORS.dimmed} wrap="truncate">
                No matching commands
              </Text>
            ) : (
              commands.map((c) => (
                <Text key={c.id} wrap="truncate">
                  <Text color={COLORS.step} bold>
                    {c.name.padEnd(NAME_COLUMN_WIDTH)}
                  </Text>
                  <Text color={COLORS.dimmed}>{c.summary}</Text>
                </Text>
              ))
            )}
            {Array.from({ length: Math.max(0, commandBudget - Math.max(commands.length, 1)) }).map((_, i) => (
              <Text key={`pad-${i}`}> </Text>
            ))}
            <Text color={COLORS.dimmed} wrap="truncate">
              {hidden > 0 ? `… +${hidden} more — keep typing to filter` : ' '}
            </Text>
          </Box>
        </Box>
      ) : null}

      <Box width={width} paddingX={1}>
        <Text color={COLORS.yellow} wrap="truncate">
          {error || ' '}
        </Text>
      </Box>

      <Box
        borderStyle="round"
        borderColor={focused ? COLORS.brand : COLORS.muted}
        paddingX={1}
        height={inputLines + 2}
        overflow="hidden"
      >
        <Text color={focused ? COLORS.brand : COLORS.dimmed} bold>
          {symbols.prompt}{' '}
        </Text>
        {disabled ? (
          <Text color={COLORS.dimmed} wrap="truncate">
            {busyText || 'working…'}
          </Text>
        ) : (
          <PromptInput
            focus={focused}
            showCursor={focused}
            value={query}
            onChange={onQueryChange}
            onSubmit={onSubmit}
            placeholder={placeholder}
          />
        )}
      </Box>
    </Box>
  );
}
