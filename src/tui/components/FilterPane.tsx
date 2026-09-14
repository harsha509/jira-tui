import React from 'react';
import { Box, Text } from 'ink';
import { COLORS, statusColor, symbols } from '../theme.js';
import type { FilterItem } from '../filters.js';
import { windowFor } from '../useLayout.js';

export interface FilterPaneProps {
  items: FilterItem[];
  selected: number;
  focused: boolean;
  visibleRows: number;
  width: number;
}

/** Left pane: scope, status and action rows with a ❯ cursor; the active scope/status carries a ● mark. */
export function FilterPane({ items, selected, focused, visibleRows, width }: FilterPaneProps) {
  const { items: visible, start } = windowFor(items, selected, visibleRows);
  const inner = Math.max(10, width - 4);
  const countWidth = 5;
  const labelWidth = Math.max(8, inner - 4 - countWidth);
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
          Filters
        </Text>
        <Text color={COLORS.dimmed} wrap="truncate">
          {focused ? '↑↓ · enter' : '← to change'}
        </Text>
      </Box>
      {visible.map((item, i) => {
        const index = start + i;
        if (item.kind === 'heading') {
          return (
            <Text key={item.id} color={COLORS.dimmed} wrap="truncate">
              {`── ${item.label} `.padEnd(inner, '─')}
            </Text>
          );
        }
        const isSelected = index === selected;
        const highlight = isSelected && focused;
        const mark = item.kind === 'action' ? ' ' : item.active ? '●' : '○';
        const labelColor = highlight ? COLORS.brand : item.kind === 'status' && item.active ? statusColor(item.label) : COLORS.white;
        return (
          <Text key={item.id} wrap="truncate" bold={highlight}>
            <Text color={isSelected ? COLORS.brand : COLORS.dimmed}>{isSelected ? `${symbols.prompt} ` : '  '}</Text>
            <Text color={item.active ? COLORS.brand : COLORS.dimmed}>{mark} </Text>
            <Text color={labelColor}>{item.label.slice(0, labelWidth).padEnd(labelWidth)}</Text>
            <Text color={COLORS.dimmed}>{item.count === undefined ? ''.padStart(countWidth) : String(item.count).padStart(countWidth)}</Text>
          </Text>
        );
      })}
    </Box>
  );
}
