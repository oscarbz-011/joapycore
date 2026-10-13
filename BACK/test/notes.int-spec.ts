import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotesRepository } from '../src/notes/notes.repository';
import { NotesService } from '../src/notes/notes.service';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const integration = url ? describe : describe.skip;

integration('Personal notes (isolated PostgreSQL)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const me = randomUUID();
  const coworker = randomUUID();
  let prisma: PrismaService;
  let service: NotesService;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    service = new NotesService(new NotesRepository(prisma));
  });

  afterAll(async () => {
    await prisma.userNote.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  it('keeps the notes of each user to themselves', async () => {
    const mine = await service.create(tenantA, me, { title: 'Mía' });
    await service.create(tenantA, coworker, { title: 'Del compañero' });

    const list = await service.list(tenantA, me, 'all');

    expect(list.map((note) => note.title)).toEqual(['Mía']);
    await expect(
      service.find(tenantA, coworker, mine.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    // El mismo usuario pedido desde otra empresa.
    await expect(service.find(tenantB, me, mine.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(tenantA, coworker, mine.id, { title: 'Pisada' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.find(tenantA, me, mine.id)).resolves.toMatchObject({
      title: 'Mía',
    });
  });

  it('separates the starred notes and the trash', async () => {
    const starred = await service.create(tenantA, me, {
      title: 'Destacada',
      starred: true,
      priority: 'HIGH',
    });
    const dropped = await service.create(tenantA, me, { title: 'Descartada' });
    await service.trash(tenantA, me, dropped.id);

    const titles = async (view: 'all' | 'starred' | 'trash') =>
      (await service.list(tenantA, me, view)).map((note) => note.title).sort();

    await expect(titles('all')).resolves.toEqual(['Destacada', 'Mía']);
    await expect(titles('starred')).resolves.toEqual(['Destacada']);
    await expect(titles('trash')).resolves.toEqual(['Descartada']);

    await service.restore(tenantA, me, dropped.id);
    await expect(titles('trash')).resolves.toEqual([]);
    expect(starred.priority).toBe('HIGH');
  });

  it('puts the note changed last first', async () => {
    const [oldest] = (await service.list(tenantA, me, 'all')).slice(-1);
    await service.update(tenantA, me, oldest.id, { body: 'Con más detalle' });

    const list = await service.list(tenantA, me, 'all');

    expect(list[0]).toMatchObject({ id: oldest.id, body: 'Con más detalle' });
  });

  it('deletes for good only what is in the trash', async () => {
    const note = await service.create(tenantA, me, { title: 'Temporal' });

    await expect(service.remove(tenantA, me, note.id)).rejects.toThrow(
      /papelera/,
    );
    await service.trash(tenantA, me, note.id);
    await service.remove(tenantA, me, note.id);

    await expect(service.find(tenantA, me, note.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
