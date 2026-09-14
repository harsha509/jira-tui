import { useStdout } from 'ink';

/** Rows left for scrollable content after `reserved` fixed rows. */
export function useAvailableRows(reserved: number): number {
  const { stdout } = useStdout();
  const rows = stdout.rows || 24;
  return Math.max(3, rows - reserved);
}

/** Slice `items` to a window of `maxVisible` that keeps `selected` in view; `start` is the index of items[0]. */
export function windowFor<T>(items: T[], selected: number, maxVisible: number): { items: T[]; start: number } {
  if (items.length <= maxVisible) return { items, start: 0 };
  let start = Math.max(0, selected - maxVisible + 1);
  start = Math.min(start, items.length - maxVisible);
  return { items: items.slice(start, start + maxVisible), start };
}
