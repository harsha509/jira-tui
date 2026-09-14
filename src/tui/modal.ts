import { tuiStore, type SelectItem } from './store.js';

export interface SelectOptions {
  title: string;
  subtitle?: string;
  items: SelectItem[];
}

export interface TextOptions {
  title: string;
  subtitle?: string;
  placeholder?: string;
  initial?: string;
}

/** Open a pick-list and resolve with the chosen item, or null on Esc. */
export function askSelect(options: SelectOptions): Promise<SelectItem | null> {
  return new Promise((resolve) => {
    tuiStore.openModal({
      kind: 'select',
      ...options,
      onSelect: (item) => {
        tuiStore.closeModal();
        resolve(item);
      },
      onCancel: () => {
        tuiStore.closeModal();
        resolve(null);
      },
    });
  });
}

/** Open a one-line text prompt and resolve with the trimmed text, or null on Esc or empty submit. */
export function askText(options: TextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    tuiStore.openModal({
      kind: 'prompt',
      ...options,
      onSubmit: (value) => {
        tuiStore.closeModal();
        resolve(value.trim() || null);
      },
      onCancel: () => {
        tuiStore.closeModal();
        resolve(null);
      },
    });
  });
}
