const MAX_ENTRIES = 500;

/** Append one line, collapsing consecutive duplicates like a shell. */
export function appendHistory(history: string[], line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || history[history.length - 1] === trimmed) return history;
  return [...history, trimmed].slice(-MAX_ENTRIES);
}

/** Module scope so recall survives MainScreen unmounting behind a dialog. */
let sessionHistory: string[] = [];

export function recordLine(line: string): void {
  sessionHistory = appendHistory(sessionHistory, line);
}

export function historyLines(): readonly string[] {
  return sessionHistory;
}

export function resetHistory(): void {
  sessionHistory = [];
}
