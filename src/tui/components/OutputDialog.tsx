import React, { useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS } from '../theme.js';
import type { ViewerStatus } from '../store.js';

export interface DialogKey {
  key: string;
  label: string;
  run: () => void;
}

export interface OutputDialogProps {
  title: string;
  subtitle?: string;
  lines: string[];
  status?: ViewerStatus;
  /** Extra single-key actions advertised in the footer (e.g. `m move`). */
  keys?: DialogKey[];
  onClose: () => void;
}

/** Word-wrap one line into `width` columns with a hanging indent, so one entry is one terminal row. */
export function wrapLine(line: string, width: number): string[] {
  const indent = /^ */.exec(line)?.[0].length ?? 0;
  const body = line.slice(indent);
  if (!body) return [line];
  const hang = Math.min(indent + 2, Math.max(0, width - 8));
  const inner = Math.max(1, width - hang);
  const rows: string[] = [];
  let current = '';
  for (const word of body.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= inner) {
      current = candidate;
      continue;
    }
    if (current) rows.push(current);
    current = word;
    while (current.length > inner) {
      rows.push(current.slice(0, inner));
      current = current.slice(inner);
    }
  }
  rows.push(current);
  return rows.map((row, i) => ' '.repeat(i === 0 ? indent : hang) + row);
}

/** Scrollable modal for output too long for the transcript: ticket views and /help. */
export function OutputDialog({ title, subtitle, lines, status, keys = [], onClose }: OutputDialogProps) {
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const columns = stdout.columns || 80;
  const [offset, setOffset] = useState(0);

  const width = Math.min(columns - 6, 110);
  const contentWidth = Math.max(1, width - 6);
  const statusLines = status ? status.text.split('\n').length : 0;
  const chrome = 2 + 2 + 1 + (subtitle ? 1 : 0) + 1 + (statusLines ? statusLines + 1 : 0) + 2;
  const viewport = Math.max(3, rows - chrome);

  const displayLines = useMemo(() => lines.flatMap((line) => wrapLine(line, contentWidth)), [lines, contentWidth]);
  const maxOffset = Math.max(0, displayLines.length - viewport);
  const clamped = Math.min(offset, maxOffset);
  const visible = displayLines.slice(clamped, clamped + viewport);

  useInput((input, key) => {
    const action = keys.find((k) => k.key === input);
    if (key.upArrow) setOffset((o) => Math.max(0, o - 1));
    else if (key.downArrow) setOffset((o) => Math.min(maxOffset, o + 1));
    else if (key.pageUp) setOffset((o) => Math.max(0, o - viewport));
    else if (key.pageDown) setOffset((o) => Math.min(maxOffset, o + viewport));
    else if (action && !key.ctrl && !key.meta) action.run();
    else if (key.escape || input === 'q' || key.return) onClose();
  });

  const footer = [
    maxOffset > 0 ? `↑↓ scroll (${clamped + 1}-${clamped + visible.length}/${displayLines.length})` : '',
    ...keys.map((k) => `${k.key} ${k.label}`),
    'esc close',
  ].filter(Boolean);

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
        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 ? (
            <Text color={COLORS.dimmed}>(no output)</Text>
          ) : (
            visible.map((line, i) => <Text key={clamped + i}>{line || ' '}</Text>)
          )}
        </Box>
        {status ? (
          <Box marginTop={1}>
            <Text color={status.color}>{status.text}</Text>
          </Box>
        ) : null}
        <Box marginTop={1}>
          <Text color={COLORS.dimmed} wrap="truncate">
            {footer.join(' · ')}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
