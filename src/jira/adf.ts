export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
}

export interface AdfDoc extends AdfNode {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

/** Plain text → ADF document, one paragraph per line. */
export function textToAdf(text: string): AdfDoc {
  const content = text.split('\n').map((line) => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
  return { type: 'doc', version: 1, content };
}

function children(node: AdfNode, indent: string): string {
  return (node.content ?? []).map((child) => render(child, indent)).join('');
}

function attr(node: AdfNode, name: string): string {
  const value = node.attrs?.[name];
  return value === undefined || value === null ? '' : String(value);
}

function render(node: AdfNode, indent: string): string {
  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'hardBreak':
      return '\n';
    case 'mention':
      return `@${attr(node, 'text').replace(/^@/, '')}`;
    case 'emoji':
      return attr(node, 'shortName');
    case 'inlineCard':
      return attr(node, 'url');
    case 'rule':
      return '---\n';
    case 'bulletList':
      return (node.content ?? [])
        .map((item) => `${indent}- ${render(item, `${indent}  `).trim()}\n`)
        .join('');
    case 'orderedList':
      return (node.content ?? [])
        .map((item, i) => `${indent}${i + 1}. ${render(item, `${indent}   `).trim()}\n`)
        .join('');
    case 'paragraph':
    case 'heading':
    case 'codeBlock':
      return `${children(node, indent)}\n`;
    default:
      return children(node, indent);
  }
}

/** ADF document → readable plain text; unknown node types fall through to their children. */
export function adfToText(node: AdfNode | null | undefined): string {
  if (!node) return '';
  return render(node, '').replace(/\n{3,}/g, '\n\n').trim();
}
