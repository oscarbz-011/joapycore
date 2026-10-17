import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NotesPage from '@/app/(dashboard)/dashboard/notes/page';
import { NoteForm } from '@/components/notes/note-form';
import { EMPTY_NOTE } from './notes';

const state = vi.hoisted(() => ({
  search: '',
  fails: false,
  notes: [] as unknown[],
  queryKeys: [] as unknown[][],
}));

const note = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  title: `Nota ${id}`,
  body: '',
  priority: 'MEDIUM',
  starred: false,
  trashedAt: null,
  createdAt: '2026-10-13T12:00:00.000Z',
  updatedAt: '2026-10-13T12:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  state.search = '';
  state.fails = false;
  state.queryKeys = [];
  state.notes = [
    note('a', { title: 'Llamar al proveedor', body: 'Pedir la cotización', priority: 'HIGH', starred: true }),
    note('b', { title: 'Comprar papel', priority: 'LOW' }),
  ];
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
  useSearchParams: () => new URLSearchParams(state.search),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ jwtPayload: { sub: 'me', tenantId: 'tenant-1', permissions: [], activeModules: [] } }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => {
    state.queryKeys.push(queryKey);
    return {
      isPending: false,
      error: state.fails ? new Error('Unavailable') : null,
      data: state.fails ? undefined : state.notes,
      refetch: () => Promise.resolve(),
    };
  },
  useQueryClient: () => ({ invalidateQueries: () => Promise.resolve() }),
  useMutation: () => ({ error: null, isPending: false, mutate: () => undefined }),
}));

const page = () => renderToStaticMarkup(createElement(NotesPage));

describe('Notes', () => {
  it('shows each note with its priority and lets open, star or discard it', () => {
    const html = page();

    expect(html).toContain('Llamar al proveedor');
    expect(html).toContain('Pedir la cotización');
    expect(html).toContain('href="/dashboard/notes/a"');
    expect(html).toContain('aria-label="Quitar de destacadas"');
    expect(html).toContain('aria-label="Destacar"');
    expect(html).toContain('aria-label="Enviar a la papelera"');
    expect(html).toContain('href="/dashboard/notes/new"');
  });

  it('asks only for the notes of the signed-in user, in the view of the link', () => {
    state.search = 'view=starred';

    page();

    expect(state.queryKeys).toContainEqual(['notes', 'tenant-1', 'me', 'starred']);
  });

  it('offers to restore or delete what is in the trash, and does not open it', () => {
    state.search = 'view=trash';
    state.notes = [note('t', { title: 'Vieja', trashedAt: '2026-10-13T12:00:00.000Z' })];

    const html = page();

    expect(html).toMatch(/<button[^>]*>.*Restaurar<\/button>/);
    expect(html).toMatch(/<button[^>]*>Eliminar<\/button>/);
    expect(html).not.toContain('href="/dashboard/notes/t"');
    expect(html).not.toContain('aria-label="Destacar"');
  });

  it('says so when there are no notes', () => {
    state.notes = [];

    expect(page()).toContain('Todavía no tenés notas');
  });

  it('says so when the trash is empty', () => {
    state.search = 'view=trash';
    state.notes = [];

    expect(page()).toContain('La papelera está vacía');
  });

  it('offers a retry when the notes fail to load', () => {
    state.fails = true;

    const html = page();

    expect(html).toContain('role="alert"');
    expect(html).toContain('Reintentar notas');
  });
});

describe('NoteForm', () => {
  const form = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(NoteForm, {
        initial: EMPTY_NOTE,
        submitLabel: 'Guardar nota',
        pending: false,
        error: null,
        onSubmit: () => undefined,
        ...props,
      }),
    );

  it('does not let save a note without a title', () => {
    expect(form()).toMatch(/<button[^>]* disabled=""[^>]*>Guardar nota<\/button>/);
    expect(form({ initial: { ...EMPTY_NOTE, title: 'Llamar' } })).not.toMatch(
      /<button[^>]* disabled=""[^>]*>Guardar nota<\/button>/,
    );
  });

  it('marks the chosen priority', () => {
    const html = form({ initial: { ...EMPTY_NOTE, title: 'x', priority: 'HIGH' } });

    expect(html).toMatch(/aria-pressed="true"[^>]*>(<span[^>]*><\/span>)?Alta/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>(<span[^>]*><\/span>)?Media/);
  });

  it('shows why saving failed', () => {
    expect(form({ error: new Error('x') })).toContain('role="alert"');
  });
});
