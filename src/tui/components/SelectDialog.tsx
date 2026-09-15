import React, { useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS, symbols } from '../theme.js';
import type { SelectItem } from '../store.js';
import { windowFor } from '../useLayout.js';

export interface SelectDialogProps {
  title: string;
  subtitle?: string;
  items: SelectItem[];
  onSelect: (item: SelectItem) => void;
  onCancel: () => void;
}

/** Items whose label or hint contains every word of `filter`, case-insensitively; separators drop out. */
export function filterItems(items: SelectItem[], filter: string): SelectItem[] {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    if (item.separator) return false;
    const haystack = `${item.label} ${item.hint ?? ''}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** Next selectable index from `from`, skipping separators; `from` when there is none that way. */
function step(items: SelectItem[], from: number, direction: 1 | -1): number {
  for (let i = from + direction; i >= 0 && i < items.length; i += direction) {
    if (!items[i].separator) return i;
  }
  return from;
}

/** `index` clamped into range and moved off a separator. */
export function selectableIndex(items: SelectItem[], index: number): number {
  const start = Math.max(0, Math.min(index, items.length - 1));
  if (!items[start]?.separator) return start;
  const forward = step(items, start, 1);
  return forward === start ? step(items, start, -1) : forward;
}

/** Pick-list modal: ↑↓ move, typing filters, Enter selects, Esc cancels. */
export function SelectDialog({ title, subtitle, items, onSelect, onCancel }: SelectDialogProps) {
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const columns = stdout.columns || 80;
  const [filter, setFilter] = useState('');
  const [index, setIndex] = useState(0);

  const filtered = useMemo(() => filterItems(items, filter), [items, filter]);
  const selected = selectableIndex(filtered, index);
  const viewport = Math.max(3, rows - 9 - (subtitle ? 1 : 0));
  const { items: visible, start } = windowFor(filtered, selected, viewport);
  const width = Math.min(columns - 6, 90);
  const labelWidth = Math.min(40, Math.max(12, ...items.filter((i) => !i.separator).map((i) => i.label.length)));

  useInput((input, key) => {
    if (key.escape) onCancel();
    else if (key.return) {
      const item = filtered[selected];
      if (item && !item.separator) onSelect(item);
    } else if (key.upArrow) setIndex(step(filtered, selected, -1));
    else if (key.downArrow) setIndex(step(filtered, selected, 1));
    else if (key.pageUp) setIndex(selectableIndex(filtered, selected - viewport));
    else if (key.pageDown) setIndex(selectableIndex(filtered, selected + viewport));
    else if (key.backspace || key.delete) {
      setFilter((f) => f.slice(0, -1));
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta && !key.tab) {
      setFilter((f) => f + input);
      setIndex(0);
    }
  });

  return (
    <Box height={rows} justifyContent="center" alignItems="center">
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.brand} paddingX={2} paddingY={1} width={width}>
        <Text color={COLORS.brand} bold wrap="truncate">
          {title}
        </Text>
        {subtitle ? (
          <Text color={COLORS.dimmed} wrap="truncate">
            {subtitle}
          </Text>
        ) : null}
        <Box marginTop={1}>
          <Text color={COLORS.dimmed}>filter: </Text>
          <Text color={COLORS.white}>{filter || ' '}</Text>
        </Box>
        <Box flexDirection="column" marginTop={1} height={viewport} overflow="hidden">
          {filtered.length === 0 ? (
            <Text color={COLORS.dimmed}>No matches</Text>
          ) : (
            visible.map((item, i) => {
              const isSelected = start + i === selected;
              if (item.separator) {
                return (
                  <Text key={item.id} color={COLORS.dimmed} wrap="truncate">
                    {`── ${item.label} `.padEnd(Math.max(12, width - 6), '─')}
                  </Text>
                );
              }
              return (
                <Text key={item.id} wrap="truncate" color={isSelected ? COLORS.brand : COLORS.white} bold={isSelected}>
                  {isSelected ? `${symbols.prompt} ` : '  '}
                  {item.label.padEnd(labelWidth)}
                  {item.hint ? <Text color={COLORS.dimmed}>  {item.hint}</Text> : null}
                </Text>
              );
            })
          )}
        </Box>
        <Box marginTop={1}>
          <Text color={COLORS.dimmed}>
            {filtered.length > viewport ? `${selected + 1}/${filtered.length} · ` : ''}
            ↑↓ move · type to filter · enter select · esc back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
