import React, { useState, useSyncExternalStore } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { SCOPES, type Scope } from '../../jira/jql.js';
import { COLORS, symbols } from '../theme.js';
import type { TuiActions } from '../commands.js';
import { StatusBar } from '../components/StatusBar.js';
import { Wordmark } from '../components/Wordmark.js';
import { getSnapshot, subscribe } from '../store.js';

const WELCOME_LABELS: Record<Scope, string> = {
  mine: 'Open my board',
  team: 'Open team board',
  all: 'Open all tickets',
};

export interface WelcomeScreenProps {
  actions: TuiActions;
}

/** Splash: wordmark plus the scope picker (mine / team / all), like AppClaw's platform picker. */
export function WelcomeScreen({ actions }: WelcomeScreenProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);
  const [index, setIndex] = useState(SCOPES.indexOf(ui.scope));
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;

  useInput((input, key) => {
    if (input === 'q' && !key.ctrl && !key.meta) {
      void actions.quit();
      return;
    }
    if (input === 'p' && !key.ctrl && !key.meta) {
      void actions.switchProject();
      return;
    }
    if (key.upArrow) setIndex((i) => (i > 0 ? i - 1 : SCOPES.length - 1));
    else if (key.downArrow) setIndex((i) => (i < SCOPES.length - 1 ? i + 1 : 0));
    else if (key.return) void actions.selectScope(SCOPES[index]);
  });

  function label(scope: Scope): string {
    const text = WELCOME_LABELS[scope];
    return scope === 'team' && !ui.teamJql ? `${text} (asks for emails)` : text;
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Box
        flexDirection="column"
        flexGrow={1}
        justifyContent="center"
        alignItems="center"
        borderStyle="round"
        borderColor={COLORS.brand}
        paddingX={2}
        paddingY={1}
      >
        <Wordmark />
        <Box marginTop={1}>
          <Text color={COLORS.dimmed}>
            {ui.project} {symbols.dot} {ui.board ? ui.board.name : 'looking up board…'} {symbols.dot}{' '}
            {ui.me ? ui.me.displayName : 'connecting…'}
          </Text>
        </Box>
        <Box marginTop={2}>
          <Text color={COLORS.dimmed}>Where do you want to start?</Text>
        </Box>
        <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor={COLORS.muted} paddingX={4} paddingY={1}>
          {SCOPES.map((scope, i) => (
            <Box key={scope} marginBottom={i < SCOPES.length - 1 ? 1 : 0}>
              <Text color={i === index ? COLORS.brand : COLORS.white} bold={i === index}>
                {i === index ? `${symbols.prompt}  ` : '   '}
                {label(scope).padEnd(30)}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
      <StatusBar breadcrumb="Welcome" hints={['↑↓ select', 'enter confirm', 'p project', 'q quit']} message={ui.statusMessage} />
    </Box>
  );
}
