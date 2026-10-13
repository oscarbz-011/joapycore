import type { NoteInput, NotePriority, NoteView, UserNote } from './api/notes';

export const NOTES_PATH = '/dashboard/notes';

export const NOTE_VIEWS: { id: NoteView; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'starred', label: 'Destacadas' },
  { id: 'trash', label: 'Papelera' },
];

export const PRIORITIES: { id: NotePriority; label: string; color: string }[] = [
  { id: 'HIGH', label: 'Alta', color: 'var(--danger)' },
  { id: 'MEDIUM', label: 'Media', color: 'var(--warn)' },
  { id: 'LOW', label: 'Baja', color: 'var(--accent-text)' },
];

export const priorityOf = (id: NotePriority) => PRIORITIES.find((item) => item.id === id) ?? PRIORITIES[1];

export const EMPTY_NOTE: NoteInput = { title: '', body: '', priority: 'MEDIUM', starred: false };

export function parseView(value: string | null): NoteView {
  return NOTE_VIEWS.some((view) => view.id === value) ? (value as NoteView) : 'all';
}

const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Por texto (sin distinguir acentos) y por prioridad. */
export function filterNotes(notes: UserNote[], search: string, priority: NotePriority | null): UserNote[] {
  const words = plain(search).split(/\s+/).filter(Boolean);
  return notes.filter((note) => {
    if (priority && note.priority !== priority) return false;
    const text = plain(`${note.title} ${note.body}`);
    return words.every((word) => text.includes(word));
  });
}

export function countByPriority(notes: UserNote[]): Record<NotePriority, number> {
  const counts: Record<NotePriority, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const note of notes) counts[note.priority] += 1;
  return counts;
}

/** Lo que se guarda: null si no cambió nada o falta el título. */
export function noteChanges(original: NoteInput, form: NoteInput): Partial<NoteInput> | null {
  const title = form.title.trim();
  if (!title) return null;
  const next = { ...form, title };
  const changed = (Object.keys(next) as (keyof NoteInput)[]).filter((key) => next[key] !== original[key]);
  if (changed.length === 0) return null;
  return Object.fromEntries(changed.map((key) => [key, next[key]]));
}

const DATE = new Intl.DateTimeFormat('es-PY', {
  timeZone: 'America/Asuncion',
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

export const noteDate = (iso: string) => DATE.format(new Date(iso));
