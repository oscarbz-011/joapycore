import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { NoteDto, NotesQueryDto, UpdateNoteDto } from './notes.dto';
import { NotesRepository } from './notes.repository';
import { NotesService } from './notes.service';

const TENANT = 'tenant-a';
const ME = 'user-me';
const note = (overrides: Record<string, unknown> = {}) => ({
  id: 'n1',
  title: 'Llamar al proveedor',
  body: '',
  priority: 'MEDIUM',
  starred: false,
  trashedAt: null,
  ...overrides,
});

describe('NotesService', () => {
  let repository: Record<keyof NotesRepository, jest.Mock>;
  let service: NotesService;

  beforeEach(() => {
    repository = {
      list: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockResolvedValue(note()),
      create: jest.fn().mockResolvedValue(note()),
      update: jest.fn().mockResolvedValue({ count: 1 }),
      remove: jest.fn().mockResolvedValue({ count: 1 }),
    } as never;
    service = new NotesService(repository as unknown as NotesRepository);
  });

  it('lists the notes of the user in the view asked for', async () => {
    await service.list(TENANT, ME, 'starred');

    expect(repository.list).toHaveBeenCalledWith(TENANT, ME, 'starred');
  });

  it('creates a note of the user, medium priority unless told otherwise', async () => {
    await service.create(TENANT, ME, { title: 'Llamar al proveedor' });

    expect(repository.create).toHaveBeenCalledWith(TENANT, ME, {
      title: 'Llamar al proveedor',
      body: '',
      priority: 'MEDIUM',
      starred: false,
    });
  });

  describe('a note of someone else', () => {
    beforeEach(() => repository.find.mockResolvedValue(null));

    it.each([
      ['read', () => service.find(TENANT, ME, 'n-other')],
      ['changed', () => service.update(TENANT, ME, 'n-other', { title: 'x' })],
      ['sent to the trash', () => service.trash(TENANT, ME, 'n-other')],
      ['restored', () => service.restore(TENANT, ME, 'n-other')],
      ['deleted', () => service.remove(TENANT, ME, 'n-other')],
    ])('cannot be %s', async (_action, act) => {
      await expect(act()).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.find).toHaveBeenCalledWith(TENANT, ME, 'n-other');
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  it('changes only what was sent', async () => {
    await service.update(TENANT, ME, 'n1', { starred: true });

    expect(repository.update).toHaveBeenCalledWith(TENANT, ME, 'n1', {
      starred: true,
    });
  });

  it('does not change a note that is in the trash', async () => {
    repository.find.mockResolvedValue(note({ trashedAt: new Date() }));

    await expect(
      service.update(TENANT, ME, 'n1', { title: 'x' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('sends a note to the trash and brings it back', async () => {
    await service.trash(TENANT, ME, 'n1');
    expect(repository.update).toHaveBeenLastCalledWith(TENANT, ME, 'n1', {
      trashedAt: expect.any(Date),
    });

    await service.restore(TENANT, ME, 'n1');
    expect(repository.update).toHaveBeenLastCalledWith(TENANT, ME, 'n1', {
      trashedAt: null,
    });
  });

  // Dos pasos para perder una nota: papelera y después eliminar.
  it('deletes for good only from the trash', async () => {
    await expect(service.remove(TENANT, ME, 'n1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(repository.remove).not.toHaveBeenCalled();

    repository.find.mockResolvedValue(note({ trashedAt: new Date() }));
    await expect(service.remove(TENANT, ME, 'n1')).resolves.toEqual({
      deleted: true,
    });
    expect(repository.remove).toHaveBeenCalledWith(TENANT, ME, 'n1');
  });
});

describe('Notes request validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const body = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

  it('accepts a note and trims its title', async () => {
    await expect(
      body(NoteDto, { title: '  Llamar  ', priority: 'HIGH', starred: true }),
    ).resolves.toMatchObject({ title: 'Llamar', priority: 'HIGH' });
  });

  it('rejects a note without a title or with an unknown priority', async () => {
    await expect(body(NoteDto, { title: '   ' })).rejects.toThrow();
    await expect(
      body(NoteDto, { title: 'x', priority: 'URGENT' }),
    ).rejects.toThrow();
  });

  // De quién es la nota sale de la sesión, nunca del pedido.
  it('rejects an owner or a tenant sent by the client', async () => {
    await expect(
      body(NoteDto, { title: 'x', userId: 'other' }),
    ).rejects.toThrow();
    await expect(body(UpdateNoteDto, { tenantId: 'other' })).rejects.toThrow();
    await expect(body(UpdateNoteDto, { trashedAt: null })).rejects.toThrow();
  });

  it('reads the view from the query string', async () => {
    const query = (value: unknown) =>
      pipe.transform(value, { type: 'query', metatype: NotesQueryDto });

    await expect(query({})).resolves.toMatchObject({ view: 'all' });
    await expect(query({ view: 'trash' })).resolves.toMatchObject({
      view: 'trash',
    });
    await expect(query({ view: 'everyone' })).rejects.toThrow();
  });
});
