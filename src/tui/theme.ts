export const COLORS = {
  brand: '#4C9AFF',
  step: '#79E2F2',
  cyan: '#00d4ff',
  green: '#22C55E',
  yellow: '#f0c040',
  red: '#ef4444',
  label: '#9CA3AF',
  dimmed: '#666666',
  muted: '#444444',
  white: '#e6e6e6',
} as const;

export const symbols = {
  check: '✓',
  cross: '✗',
  warning: '⚠',
  diamond: '◆',
  prompt: '❯',
  dot: '·',
  arrow: '→',
} as const;

/** Colour for a JIRA status name, by workflow stage. */
export function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s === 'done') return COLORS.green;
  if (s === 'to do' || s === 'main') return COLORS.dimmed;
  if (s.includes('qa') || s.includes('review')) return COLORS.yellow;
  if (s.includes('stage') || s.includes('prod') || s.includes('deploy')) return COLORS.cyan;
  if (s.includes('dev') || s.includes('progress')) return COLORS.brand;
  return COLORS.white;
}
