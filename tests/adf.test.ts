import { describe, expect, test } from 'vitest';
import { adfToText, textToAdf } from '../src/jira/adf.js';

describe('textToAdf', () => {
  test('one paragraph per line, empty lines become empty paragraphs', () => {
    expect(textToAdf('a\n\nb')).toEqual({
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    });
  });

  test('round-trips through adfToText', () => {
    expect(adfToText(textToAdf('first\nsecond'))).toBe('first\nsecond');
  });
});

describe('adfToText', () => {
  test('null or missing documents are empty', () => {
    expect(adfToText(null)).toBe('');
    expect(adfToText(undefined)).toBe('');
    expect(adfToText({ type: 'doc', content: [] })).toBe('');
  });

  test('renders headings, hard breaks, mentions, cards and lists', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'mention', attrs: { text: '@Sai' } },
            { type: 'hardBreak' },
            { type: 'inlineCard', attrs: { url: 'https://x/browse/A2A-1' } },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
                {
                  type: 'bulletList',
                  content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }],
        },
        { type: 'rule' },
        { type: 'codeBlock', content: [{ type: 'text', text: 'x = 1' }] },
      ],
    };
    expect(adfToText(doc)).toBe(
      ['Title', 'Hi @Sai', 'https://x/browse/A2A-1', '- one', '- two', '  - nested', '1. first', '---', 'x = 1'].join('\n')
    );
  });

  test('unknown node types fall through to their children instead of throwing', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'panel',
          attrs: { panelType: 'info' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'inside' }] }],
        },
        { type: 'mediaSingle', content: [{ type: 'media', attrs: { id: 'x' } }] },
        { type: 'weirdFutureNode' },
      ],
    };
    expect(adfToText(doc)).toBe('inside');
  });

  test('collapses runs of blank lines to one', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    };
    expect(adfToText(doc)).toBe('a\n\nb');
  });
});
