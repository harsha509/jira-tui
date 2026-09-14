import React, { useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS, symbols } from '../theme.js';
import { PromptInput } from './PromptInput.js';

export interface TextPromptDialogProps {
  title: string;
  subtitle?: string;
  placeholder?: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** One-line text modal: Enter submits (empty is ignored), Esc cancels. */
export function TextPromptDialog({ title, subtitle, placeholder, initial = '', onSubmit, onCancel }: TextPromptDialogProps) {
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  const columns = stdout.columns || 80;
  const [value, setValue] = useState(initial);
  const width = Math.min(columns - 6, 90);

  useInput((_input, key) => {
    if (key.escape) onCancel();
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
        <Box marginTop={1} borderStyle="round" borderColor={COLORS.brand} paddingX={1}>
          <Text color={COLORS.brand} bold>
            {symbols.prompt}{' '}
          </Text>
          <PromptInput
            value={value}
            onChange={setValue}
            onSubmit={(v) => {
              if (v.trim()) onSubmit(v);
            }}
            placeholder={placeholder ?? ''}
          />
        </Box>
        <Box marginTop={1}>
          <Text color={COLORS.dimmed}>enter submit · esc back</Text>
        </Box>
      </Box>
    </Box>
  );
}
