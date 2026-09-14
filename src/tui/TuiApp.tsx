import React, { useSyncExternalStore } from 'react';
import { Box, useInput } from 'ink';
import { getSnapshot, subscribe, tuiStore } from './store.js';
import type { TuiActions } from './commands.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { MainScreen } from './screens/MainScreen.js';
import { BoardScreen } from './screens/BoardScreen.js';
import { OutputDialog, type DialogKey } from './components/OutputDialog.js';
import { SelectDialog } from './components/SelectDialog.js';
import { TextPromptDialog } from './components/TextPromptDialog.js';

export interface TuiAppProps {
  actions: TuiActions;
}

/** Action keys offered while a ticket is open in the viewer; each closes the viewer first so the result is fresh. */
function viewerKeys(key: string, actions: TuiActions): DialogKey[] {
  const run = (fn: () => unknown) => () => {
    tuiStore.closeViewer();
    void fn();
  };
  return [
    { key: 'm', label: 'move', run: run(() => actions.moveIssue(key)) },
    { key: 'a', label: 'assign', run: run(() => actions.assignIssue(key)) },
    { key: 'c', label: 'comment', run: run(() => actions.commentIssue(key)) },
    { key: 'o', label: 'open', run: () => actions.openInBrowser(key) },
  ];
}

/** Root router: a modal or the viewer replaces the screen so key handlers never compete. */
export function TuiApp({ actions }: TuiAppProps) {
  const ui = useSyncExternalStore(subscribe, getSnapshot);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') void actions.quit();
  });

  if (ui.modal) {
    const modal = ui.modal;
    return (
      <Box flexDirection="column" paddingX={1}>
        {modal.kind === 'select' ? (
          <SelectDialog
            title={modal.title}
            subtitle={modal.subtitle}
            items={modal.items}
            onSelect={modal.onSelect}
            onCancel={modal.onCancel}
          />
        ) : (
          <TextPromptDialog
            title={modal.title}
            subtitle={modal.subtitle}
            placeholder={modal.placeholder}
            initial={modal.initial}
            onSubmit={modal.onSubmit}
            onCancel={modal.onCancel}
          />
        )}
      </Box>
    );
  }

  if (ui.viewerOpen) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <OutputDialog
          title={ui.viewerTitle}
          subtitle={ui.viewerSubtitle}
          lines={ui.viewerLines}
          status={ui.viewerStatus}
          keys={ui.viewerIssueKey ? viewerKeys(ui.viewerIssueKey, actions) : []}
          onClose={() => tuiStore.closeViewer()}
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {ui.screen === 'welcome' && <WelcomeScreen actions={actions} />}
      {ui.screen === 'main' && <MainScreen actions={actions} />}
      {ui.screen === 'board' && <BoardScreen actions={actions} />}
    </Box>
  );
}
