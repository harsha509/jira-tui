/** App padding row-wise is zero; the frame is border(2). */
export const FRAME_ROWS = 2;
/** Header: brand line + subtitle line. */
export const HEADER_ROWS = 2;
/** StatusBar: marginTop(1) + border(2) + hints(1) + message(1). */
export const STATUS_BAR_ROWS = 5;
/** Transcript box: border(2) + title(1). */
export const TRANSCRIPT_CHROME_ROWS = 3;
/** Palette box without its list rows: border(2) + title(1) + list marginTop(1) + overflow row(1). */
export const PALETTE_CHROME_ROWS = 5;
/** Feedback row(1) + input border(2). */
export const INPUT_CHROME_ROWS = 3;
export const MAX_VISIBLE_COMMANDS = 8;
export const MIN_TRANSCRIPT_ROWS = 3;
/** Columns lost to app padding(2), frame border+padding(4) and the column gap(1). */
export const CHROME_COLS = 7;

export function contentRows(termRows: number): number {
  return termRows - FRAME_ROWS - HEADER_ROWS - STATUS_BAR_ROWS;
}

/** Rows the command list may take while shown; below 3 the list is hidden instead. */
export function visibleCommandCount(termRows: number): number {
  const spare =
    contentRows(termRows) -
    TRANSCRIPT_CHROME_ROWS -
    1 -
    PALETTE_CHROME_ROWS -
    INPUT_CHROME_ROWS -
    1 -
    MIN_TRANSCRIPT_ROWS;
  return Math.max(0, Math.min(MAX_VISIBLE_COMMANDS, spare));
}

export function paletteRows(termRows: number, listVisible: boolean): number {
  return listVisible ? visibleCommandCount(termRows) + PALETTE_CHROME_ROWS : 0;
}

/** Transcript body rows, after the palette (when shown) and a prompt of `inputLines` rows. */
export function transcriptRows(termRows: number, listVisible: boolean, inputLines: number): number {
  return Math.max(
    1,
    contentRows(termRows) -
      TRANSCRIPT_CHROME_ROWS -
      1 -
      paletteRows(termRows, listVisible) -
      INPUT_CHROME_ROWS -
      inputLines
  );
}

export const MIN_MAIN_ROWS =
  FRAME_ROWS + HEADER_ROWS + STATUS_BAR_ROWS + TRANSCRIPT_CHROME_ROWS + 1 + INPUT_CHROME_ROWS + 1 + MIN_TRANSCRIPT_ROWS;

export function inputLineBudget(termRows: number): number {
  return Math.max(1, Math.min(4, transcriptRows(termRows, false, 1) - MIN_TRANSCRIPT_ROWS + 1));
}

/** Rows a prompt of `query` wraps to inside a `width`-column box, capped at `max`. */
export function inputLineCount(query: string, width: number, max: number): number {
  const inner = Math.max(1, width - 6);
  return Math.max(1, Math.min(max, Math.ceil((query.length + 1) / inner)));
}

export function columnWidths(termCols: number): { left: number; right: number } {
  const usable = Math.max(40, termCols - CHROME_COLS);
  const left = Math.max(30, Math.min(60, Math.floor(usable * 0.42)));
  return { left, right: usable - left };
}

/** Issue rows the right panel can show: its border(2), title(1) and subtitle(1). */
export function issuePanelRows(termRows: number): number {
  return Math.max(1, contentRows(termRows) - 4);
}
