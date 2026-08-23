import type { CreateDocumentPayload } from './api/documents';

// "Duplicar" navega a la página de creación sin pasar por un modal — los
// datos del documento origen viajan por sessionStorage (se leen una sola vez
// al montar el formulario de creación y se limpian enseguida).
const KEY = 'documents:duplicate-seed';

export function writeDuplicateSeed(seed: Partial<CreateDocumentPayload>) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(KEY, JSON.stringify(seed));
}

export function consumeDuplicateSeed(): Partial<CreateDocumentPayload> | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  sessionStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as Partial<CreateDocumentPayload>;
  } catch {
    return null;
  }
}
