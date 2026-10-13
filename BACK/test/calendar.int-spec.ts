import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { CalendarRepository } from '../src/calendar/calendar.repository';
import { CalendarService } from '../src/calendar/calendar.service';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const integration = url ? describe : describe.skip;

integration('Calendar (isolated PostgreSQL)', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const me = randomUUID();
  const ana = randomUUID();
  const foreigner = randomUUID();
  const october = { from: '2026-10-01', to: '2026-10-31' };
  let prisma: PrismaService;
  let service: CalendarService;

  const user = (id: string, tenantId: string) => ({
    id,
    tenantId,
    email: `${id}@example.test`,
    passwordHash: 'unused-test-only',
    firstName: 'Test',
    lastName: 'User',
  });
  const event = (
    title: string,
    day: string,
    overrides: Record<string, unknown> = {},
  ) => ({
    title,
    allDay: false,
    startsAt: `${day}T13:00:00.000Z`,
    endsAt: `${day}T14:00:00.000Z`,
    companyWide: false,
    ...overrides,
  });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    service = new CalendarService(
      new CalendarRepository(prisma),
      new EventEmitter2(),
    );
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: 'Ferro SA' },
        { id: tenantB, name: 'Otra SA' },
      ],
    });
    await prisma.user.createMany({
      data: [user(me, tenantA), user(ana, tenantA), user(foreigner, tenantB)],
    });
    await service.create(tenantA, me, event('Mío privado', '2026-10-14'));
    await service.create(
      tenantA,
      ana,
      event('De Ana para todos', '2026-10-20', { companyWide: true }),
    );
    await service.create(tenantA, ana, event('De Ana privado', '2026-10-21'));
    await service.create(tenantA, me, event('Mío de noviembre', '2026-11-20'));
    await service.create(
      tenantB,
      foreigner,
      event('De otra empresa', '2026-10-14', { companyWide: true }),
    );
  });

  afterAll(async () => {
    const tenants = { tenantId: { in: [tenantA, tenantB] } };
    await prisma.calendarFeed.deleteMany({ where: tenants });
    await prisma.calendarEvent.deleteMany({ where: tenants });
    await prisma.user.deleteMany({ where: tenants });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  it('shows a user their own events and the ones for the whole company, in order', async () => {
    const titles = (await service.list(tenantA, me, october)).map(
      (item) => item.title,
    );

    expect(titles).toEqual(['Mío privado', 'De Ana para todos']);
  });

  it('includes an event that only overlaps the range', async () => {
    await service.create(
      tenantA,
      me,
      event('Viaje', '2026-09-28', {
        allDay: true,
        startsAt: '2026-09-28T00:00:00.000Z',
        endsAt: '2026-10-02T00:00:00.000Z',
      }),
    );

    const titles = (await service.list(tenantA, me, october)).map(
      (item) => item.title,
    );

    expect(titles[0]).toBe('Viaje');
  });

  it('lets only the author change or delete an event', async () => {
    const shared = (await service.list(tenantA, me, october)).find(
      (item) => item.title === 'De Ana para todos',
    )!;

    await expect(
      service.update(tenantA, me, shared.id, { title: 'Pisado' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(tenantA, me, shared.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(
      service.update(tenantA, ana, shared.id, { title: 'Reunión general' }),
    ).resolves.toMatchObject({ title: 'Reunión general', mine: true });
  });

  it('never crosses companies', async () => {
    const mine = (await service.list(tenantA, me, october))[0];

    await expect(
      service.find(tenantB, foreigner, mine.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      (await service.list(tenantB, foreigner, october)).map(
        (item) => item.title,
      ),
    ).toEqual(['De otra empresa']);
  });

  it('gives each user one secret address, and a new one makes the old one useless', async () => {
    const first = await service.feed(tenantA, me);
    const again = await service.feed(tenantA, me);
    expect(again.token).toBe(first.token);

    const ics = await service.ics(
      first.token,
      new Date('2026-10-13T12:00:00.000Z'),
    );
    expect(ics).toContain('SUMMARY:Mío privado');
    expect(ics).toContain('SUMMARY:Reunión general');
    expect(ics).not.toContain('De Ana privado');
    expect(ics).not.toContain('De otra empresa');

    const rotated = await service.resetFeed(tenantA, me);
    expect(rotated.token).not.toBe(first.token);
    await expect(service.ics(first.token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('stops serving the address of a user who was deactivated', async () => {
    const { token } = await service.feed(tenantA, ana);
    await prisma.user.updateMany({
      where: { tenantId: tenantA, id: ana },
      data: { status: 'INACTIVE' },
    });

    await expect(service.ics(token)).rejects.toBeInstanceOf(NotFoundException);
  });
});
