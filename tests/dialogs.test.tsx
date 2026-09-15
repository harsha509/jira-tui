import { beforeEach, describe, expect, test } from 'vitest';
import { render } from 'ink-testing-library';
import React from 'react';
import { SelectDialog, filterItems } from '../src/tui/components/SelectDialog.js';
import { TextPromptDialog } from '../src/tui/components/TextPromptDialog.js';
import { TuiApp } from '../src/tui/TuiApp.js';
import { askSelect, askText } from '../src/tui/modal.js';
import { getSnapshot, tuiStore, type SelectItem } from '../src/tui/store.js';
import type { TuiActions } from '../src/tui/commands.js';

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const ESC = String.fromCharCode(27);
const ENTER = '\r';
const DOWN = `${ESC}[B`;
const UP = `${ESC}[A`;
const BACKSPACE = String.fromCharCode(127);
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const plain = (frame: string | undefined) => (frame ?? '').replace(ANSI, '');

const ITEMS: SelectItem[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'review', label: 'IN Review', hint: 'via Dev Done' },
  { id: 'done', label: 'Done' },
];

const GROUPED: SelectItem[] = [
  { id: 'me', label: 'me' },
  { id: 'sep:team', label: 'Team', separator: true },
  { id: 'a1', label: 'Asha R', hint: 'a@x.com' },
  { id: 'sep:all', label: 'Everyone in A2A', separator: true },
  { id: 'c1', label: 'Chandra M', hint: 'c@x.com' },
];

beforeEach(() => tuiStore.reset());

describe('filterItems', () => {
  test('matches every word against label and hint, case-insensitively', () => {
    expect(filterItems(ITEMS, 'rev').map((i) => i.id)).toEqual(['review']);
    expect(filterItems(ITEMS, 'dev done').map((i) => i.id)).toEqual(['review']);
    expect(filterItems(ITEMS, 'DO').map((i) => i.id)).toEqual(['todo', 'review', 'done']);
    expect(filterItems(ITEMS, '')).toBe(ITEMS);
    expect(filterItems(ITEMS, 'zzz')).toEqual([]);
  });

  test('separators drop out as soon as there is a filter, even when they match it', () => {
    expect(filterItems(GROUPED, 'team')).toEqual([]);
    expect(filterItems(GROUPED, 'a').map((i) => i.id)).toEqual(['a1', 'c1']);
    expect(filterItems(GROUPED, '')).toBe(GROUPED);
  });
});

describe('SelectDialog', () => {
  test('arrows move and Enter selects', async () => {
    const picked: SelectItem[] = [];
    const { stdin } = render(<SelectDialog title="Move" items={ITEMS} onSelect={(i) => picked.push(i)} onCancel={() => {}} />);
    await settle();
    stdin.write(DOWN);
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(picked.map((i) => i.id)).toEqual(['review']);
  });

  test('typing filters, backspace un-filters, Esc cancels', async () => {
    let cancelled = 0;
    const picked: SelectItem[] = [];
    const { stdin, lastFrame } = render(
      <SelectDialog title="Move" items={ITEMS} onSelect={(i) => picked.push(i)} onCancel={() => cancelled++} />
    );
    await settle();
    stdin.write('t');
    await settle();
    stdin.write('o');
    await settle();
    expect(plain(lastFrame())).toContain('filter: to');
    expect(plain(lastFrame())).not.toContain('IN Review');
    stdin.write(ENTER);
    await settle();
    expect(picked.map((i) => i.id)).toEqual(['todo']);
    stdin.write(BACKSPACE);
    await settle();
    expect(plain(lastFrame())).toContain('filter: t');
    stdin.write(BACKSPACE);
    await settle();
    expect(plain(lastFrame())).toContain('IN Review');
    stdin.write(ESC);
    await settle();
    expect(cancelled).toBe(1);
  });

  test('arrows step over separators and Enter never selects one', async () => {
    const picked: SelectItem[] = [];
    const { stdin } = render(<SelectDialog title="Assign" items={GROUPED} onSelect={(i) => picked.push(i)} onCancel={() => {}} />);
    await settle();
    stdin.write(DOWN);
    await settle();
    stdin.write(ENTER);
    await settle();
    stdin.write(DOWN);
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(picked.map((i) => i.id)).toEqual(['a1', 'c1']);
  });

  test('a leading separator is never the selection, and Up off the top stays put', async () => {
    const picked: SelectItem[] = [];
    const items: SelectItem[] = [{ id: 'sep', label: 'Team', separator: true }, ...ITEMS];
    const { stdin } = render(<SelectDialog title="Assign" items={items} onSelect={(i) => picked.push(i)} onCancel={() => {}} />);
    await settle();
    stdin.write(ENTER);
    await settle();
    stdin.write(UP);
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(picked.map((i) => i.id)).toEqual(['todo', 'todo']);
  });

  test('a list of nothing but separators selects nothing', async () => {
    const picked: SelectItem[] = [];
    const items: SelectItem[] = [{ id: 'a', label: 'Team', separator: true }, { id: 'b', label: 'Rest', separator: true }];
    const { stdin } = render(<SelectDialog title="Assign" items={items} onSelect={(i) => picked.push(i)} onCancel={() => {}} />);
    await settle();
    stdin.write(DOWN);
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(picked).toEqual([]);
  });

  test('Enter on an empty filter result selects nothing', async () => {
    const picked: SelectItem[] = [];
    const { stdin, lastFrame } = render(<SelectDialog title="Move" items={ITEMS} onSelect={(i) => picked.push(i)} onCancel={() => {}} />);
    await settle();
    stdin.write('z');
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(plain(lastFrame())).toContain('No matches');
    expect(picked).toEqual([]);
  });
});

describe('TextPromptDialog', () => {
  test('Enter submits typed text and ignores an empty line; Esc cancels', async () => {
    const submitted: string[] = [];
    let cancelled = 0;
    const { stdin } = render(
      <TextPromptDialog title="Comment" onSubmit={(v) => submitted.push(v)} onCancel={() => cancelled++} />
    );
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(submitted).toEqual([]);
    stdin.write('h');
    await settle();
    stdin.write('i');
    await settle();
    stdin.write(ENTER);
    await settle();
    expect(submitted).toEqual(['hi']);
    stdin.write(ESC);
    await settle();
    expect(cancelled).toBe(1);
  });
});

describe('modal promises through TuiApp', () => {
  const actions = {} as TuiActions;

  test('askSelect resolves with the chosen item and closes the modal', async () => {
    const { stdin, lastFrame } = render(<TuiApp actions={actions} />);
    await settle();
    const pending = askSelect({ title: 'Pick', items: ITEMS });
    await settle();
    expect(plain(lastFrame())).toContain('Pick');
    expect(getSnapshot().modal?.kind).toBe('select');
    stdin.write(ENTER);
    await expect(pending).resolves.toEqual(ITEMS[0]);
    expect(getSnapshot().modal).toBeNull();
  });

  test('askSelect resolves null on Esc', async () => {
    const { stdin } = render(<TuiApp actions={actions} />);
    await settle();
    const pending = askSelect({ title: 'Pick', items: ITEMS });
    await settle();
    stdin.write(ESC);
    await expect(pending).resolves.toBeNull();
  });

  test('askText resolves with the trimmed text, and null on Esc', async () => {
    const { stdin } = render(<TuiApp actions={actions} />);
    await settle();
    const typed = askText({ title: 'Say' });
    await settle();
    stdin.write('y');
    await settle();
    stdin.write('o');
    await settle();
    stdin.write(ENTER);
    await expect(typed).resolves.toBe('yo');
    const cancelled = askText({ title: 'Say' });
    await settle();
    stdin.write(ESC);
    await expect(cancelled).resolves.toBeNull();
  });

  test('a modal takes precedence over an open viewer, and the viewer offers ticket keys', async () => {
    const calls: string[] = [];
    const acting = {
      moveIssue: async (key: string) => {
        calls.push(`move ${key}`);
      },
    } as unknown as TuiActions;
    tuiStore.showViewer({ title: 'A2A-1  x', lines: ['body'], issueKey: 'A2A-1' });
    const { stdin, lastFrame } = render(<TuiApp actions={acting} />);
    await settle();
    expect(plain(lastFrame())).toContain('m move');
    const pending = askSelect({ title: 'On top', items: ITEMS });
    await settle();
    expect(plain(lastFrame())).toContain('On top');
    stdin.write(ESC);
    await expect(pending).resolves.toBeNull();
    await settle();
    expect(plain(lastFrame())).toContain('A2A-1  x');
    stdin.write('m');
    await settle();
    expect(calls).toEqual(['move A2A-1']);
    expect(getSnapshot().viewerOpen).toBe(false);
  });
});
