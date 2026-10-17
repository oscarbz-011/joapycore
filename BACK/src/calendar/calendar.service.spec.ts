import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CalendarEventDto,
  CalendarRangeDto,
  UpdateCalendarEventDto,
} from './calendar.dto';
import { CalendarRepository } from './calendar.repository';
import { CalendarService } from './calendar.service';

const TENANT = 'tenant-a';
const ME = 'user-me';
const meeting = {
  title: 'Reunión de cobranzas',
  allDay: false,
  startsAt: '2026-10-14T13:00:00.000Z',
  endsAt: '2026-10-14T14:00:00.000Z',
  companyWide: false,
};
const stored = (overrides: Record<string, unknown> = {}) => ({
  id: 'e1',
  createdBy: ME,
  title: 'Reunión de cobranzas',
  description: null,
  location: null,
  allDay: false,
  startsAt: new Date(meeting.startsAt),
  endsAt: new Date(meeting.endsAt),
  companyWide: false,
  updatedAt: new Date('2026-10-13T12:00:00.000Z'),
  ...overrides,
});

describe('CalendarService', () => {
  let repository: Record<keyof CalendarRepository, jest.Mock>;
  let events: { emit: jest.Mock };
  let service: CalendarService;

  beforeEach(() => {
    repository = {
      between: jest.fn().mockResolvedValue([]),
      visible: jest.fn().mockResolvedValue(stored()),
      create: jest.fn().mockResolvedValue(stored()),
      update: jest.fn().mockResolvedValue({ count: 1 }),
      remove: jest.fn().mockResolvedValue({ count: 1 }),
    } as never;
    events = { emit: jest.fn() };
    service = new CalendarService(
      repository as unknown as CalendarRepository,
      events as unknown as EventEmitter2,
    );
  });

  describe('list', () => {
    it('asks for the events of the user in the range, with a day of margin', async () => {
      await service.list(TENANT, ME, { from: '2026-10-01', to: '2026-10-31' });

      expect(repository.between).toHaveBeenCalledWith(
        TENANT,
        ME,
        new Date('2026-09-30T00:00:00.000Z'),
        new Date('2026-11-02T00:00:00.000Z'),
      );
    });

    it('refuses a range that is backwards, absurd or not a date', () => {
      const list = (from: string, to: string) => () =>
        service.list(TENANT, ME, { from, to });

      expect(list('2026-10-31', '2026-10-01')).toThrow(BadRequestException);
      expect(list('2020-01-01', '2026-10-01')).toThrow(BadRequestException);
      expect(list('2026-13-45', '2026-10-01')).toThrow(BadRequestException);
      expect(repository.between).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('saves an event of the user', async () => {
      await service.create(TENANT, ME, {
        ...meeting,
        description: '  Traer la planilla  ',
        location: 'Sala 1',
      });

      expect(repository.create).toHaveBeenCalledWith(TENANT, ME, {
        title: 'Reunión de cobranzas',
        description: 'Traer la planilla',
        location: 'Sala 1',
        companyWide: false,
        allDay: false,
        startsAt: new Date(meeting.startsAt),
        endsAt: new Date(meeting.endsAt),
      });
      expect(events.emit).not.toHaveBeenCalled();
    });

    // Sin datos del evento: cada pantalla pide lo que puede ver.
    it('tells the company when the event is for everyone', async () => {
      await service.create(TENANT, ME, { ...meeting, companyWide: true });

      expect(events.emit).toHaveBeenCalledWith('calendar.changed', {
        tenantId: TENANT,
      });
    });

    it('refuses an event that ends before it starts', async () => {
      await expect(
        service.create(TENANT, ME, {
          ...meeting,
          endsAt: '2026-10-14T12:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('takes an all-day event as whole days only', async () => {
      await service.create(TENANT, ME, {
        ...meeting,
        allDay: true,
        startsAt: '2026-10-14T00:00:00.000Z',
        endsAt: '2026-10-15T00:00:00.000Z',
      });
      expect(repository.create).toHaveBeenCalledTimes(1);

      await expect(
        service.create(TENANT, ME, { ...meeting, allDay: true }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('an event of someone else', () => {
    it('cannot be seen when it is private', async () => {
      repository.visible.mockResolvedValue(null);

      await expect(service.find(TENANT, ME, 'e-other')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.visible).toHaveBeenCalledWith(TENANT, ME, 'e-other');
    });

    it('can be seen but not changed or deleted when it is for the company', async () => {
      repository.visible.mockResolvedValue(
        stored({ createdBy: 'user-ana', companyWide: true }),
      );

      await expect(service.find(TENANT, ME, 'e1')).resolves.toMatchObject({
        mine: false,
      });
      await expect(
        service.update(TENANT, ME, 'e1', { title: 'Pisado' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove(TENANT, ME, 'e1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('changes what was sent and keeps the dates consistent with what was not', async () => {
      await service.update(TENANT, ME, 'e1', {
        endsAt: '2026-10-14T15:00:00.000Z',
      });

      expect(repository.update).toHaveBeenCalledWith(TENANT, ME, 'e1', {
        allDay: false,
        startsAt: new Date(meeting.startsAt),
        endsAt: new Date('2026-10-14T15:00:00.000Z'),
      });
    });

    it('refuses a new end before the start already saved', async () => {
      await expect(
        service.update(TENANT, ME, 'e1', {
          endsAt: '2026-10-14T12:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('tells the company when an event stops being for everyone', async () => {
      repository.visible.mockResolvedValue(stored({ companyWide: true }));

      await service.update(TENANT, ME, 'e1', { companyWide: false });

      expect(events.emit).toHaveBeenCalledWith('calendar.changed', {
        tenantId: TENANT,
      });
    });
  });

  it('deletes an event of the user', async () => {
    await expect(service.remove(TENANT, ME, 'e1')).resolves.toEqual({
      deleted: true,
    });
    expect(repository.remove).toHaveBeenCalledWith(TENANT, ME, 'e1');
  });
});

describe('Calendar request validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const body = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

  it('accepts an event', async () => {
    await expect(body(CalendarEventDto, meeting)).resolves.toMatchObject({
      title: 'Reunión de cobranzas',
    });
  });

  it('rejects an event without a title, with a bad date or with an owner sent by the client', async () => {
    await expect(
      body(CalendarEventDto, { ...meeting, title: '  ' }),
    ).rejects.toThrow();
    await expect(
      body(CalendarEventDto, { ...meeting, startsAt: 'mañana' }),
    ).rejects.toThrow();
    await expect(
      body(CalendarEventDto, { ...meeting, createdBy: 'other' }),
    ).rejects.toThrow();
    await expect(
      body(UpdateCalendarEventDto, { tenantId: 'other' }),
    ).rejects.toThrow();
  });

  it('reads the range as two dates', async () => {
    const query = (value: unknown) =>
      pipe.transform(value, { type: 'query', metatype: CalendarRangeDto });

    await expect(
      query({ from: '2026-10-01', to: '2026-10-31' }),
    ).resolves.toMatchObject({ from: '2026-10-01' });
    await expect(query({ from: '2026-10-01' })).rejects.toThrow();
    await expect(
      query({ from: '01/10/2026', to: '2026-10-31' }),
    ).rejects.toThrow();
  });
});
