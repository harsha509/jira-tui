import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, symbols } from '../theme.js';
import type { MenuItem } from '../menu.js';
import { windowFor } from '../useLayout.js';

export interface MenuPaneProps {
  items: MenuItem[];
  selected: number;
  focused: boolean;
  visibleRows: number;
  width: number;
}

const LABEL_WIDTH = 20;

/** Left pane: the option list with a ❯ cursor; windowed when the terminal is short. */
export function MenuPane({ items, selected, focused, visibleRows, width }: MenuPaneProps) {
  const { items: visible, start } = windowFor(items, selected, visibleRows);
  const showHints = width >= LABEL_WIDTH + 20;
  return (
    <Box
      flexDirection="column"
      width={width}
      height={visibleRows + 3}
      overflow="hidden"
      borderStyle="round"
      borderColor={focused ? COLORS.brand : COLORS.muted}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text color={focused ? COLORS.brand : COLORS.dimmed} bold>
          Menu
        </Text>
        <Text color={COLORS.dimmed} wrap="truncate">
          {focused ? '↑↓ · enter' : items.length > visibleRows ? `${selected + 1}/${items.length}` : ''}
        </Text>
      </Box>
      {visible.map((item, i) => {
        const isSelected = start + i === selected;
        const highlight = isSelected && focused;
        return (
          <Text key={item.id} wrap="truncate" bold={highlight}>
            <Text color={isSelected ? COLORS.brand : COLORS.dimmed}>{isSelected ? `${symbols.prompt} ` : '  '}</Text>
            <Text color={highlight ? COLORS.brand : COLORS.white}>{item.label.padEnd(LABEL_WIDTH)}</Text>
            {showHints ? <Text color={COLORS.dimmed}>{item.hint}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}
