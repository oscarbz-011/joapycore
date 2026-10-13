import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildIcs } from './calendar-ics';
import {
  CalendarEventDto,
  CalendarRangeDto,
  UpdateCalendarEventDto,
} from './calendar.dto';
import { CalendarRepository, EventData } from './calendar.repository';

const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_RANGE_DAYS = 400;
// Lo que se publica a otros calendarios: de hace tres meses a un año adelante.
const FEED_PAST_DAYS = 90;
const FEED_FUTURE_DAYS = 365;

const atMidnightUtc = (date: Date) =>
  date.getTime() % DAY_MS === 0 && !Number.isNaN(date.getTime());

/** Las fechas que quedarían, ya validadas. */
function schedule(allDay: boolean, startsAt: Date, endsAt: Date) {
  if (endsAt.getTime() < startsAt.getTime()) {
    throw new BadRequestException(
      'El evento no puede terminar antes de empezar.',
    );
  }
  if (allDay && !(atMidnightUtc(startsAt) && atMidnightUtc(endsAt))) {
    throw new BadRequestException(
      'Un evento de día completo lleva solo fechas, sin hora.',
    );
  }
  return { allDay, startsAt, endsAt };
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly repository: CalendarRepository,
    private readonly events: EventEmitter2,
  ) {}

  list(tenantId: string, userId: string, range: CalendarRangeDto) {
    const from = new Date(`${range.from}T00:00:00.000Z`);
    const to = new Date(`${range.to}T00:00:00.000Z`);
    const days = (to.getTime() - from.getTime()) / DAY_MS;
    if (Number.isNaN(days) || days < 0 || days > MAX_RANGE_DAYS) {
      throw new BadRequestException('El rango de fechas no es válido.');
    }
    // Un día de margen a cada lado: el día local no coincide con el día UTC.
    return this.repository.between(
      tenantId,
      userId,
      new Date(from.getTime() - DAY_MS),
      new Date(to.getTime() + 2 * DAY_MS),
    );
  }

  async find(tenantId: string, userId: string, id: string) {
    const event = await this.repository.visible(tenantId, userId, id);
    if (!event) throw new NotFoundException('Evento no encontrado');
    return { ...event, mine: event.createdBy === userId };
  }

  async create(tenantId: string, userId: string, dto: CalendarEventDto) {
    const data: EventData = {
      title: dto.title,
      description: dto.description?.trim() || null,
      location: dto.location || null,
      companyWide: dto.companyWide,
      ...schedule(dto.allDay, new Date(dto.startsAt), new Date(dto.endsAt)),
    };
    const event = await this.repository.create(tenantId, userId, data);
    this.changed(tenantId, data.companyWide);
    return event;
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateCalendarEventDto,
  ) {
    const current = await this.own(tenantId, userId, id);
    const data: Partial<EventData> = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.location !== undefined ? { location: dto.location || null } : {}),
      ...(dto.companyWide !== undefined
        ? { companyWide: dto.companyWide }
        : {}),
      ...schedule(
        dto.allDay ?? current.allDay,
        dto.startsAt ? new Date(dto.startsAt) : current.startsAt,
        dto.endsAt ? new Date(dto.endsAt) : current.endsAt,
      ),
    };
    await this.repository.update(tenantId, userId, id, data);
    this.changed(tenantId, current.companyWide || data.companyWide === true);
    return this.find(tenantId, userId, id);
  }

  async remove(tenantId: string, userId: string, id: string) {
    const current = await this.own(tenantId, userId, id);
    await this.repository.remove(tenantId, userId, id);
    this.changed(tenantId, current.companyWide);
    return { deleted: true };
  }

  async feed(tenantId: string, userId: string) {
    const existing = await this.repository.feedOf(tenantId, userId);
    return existing ?? this.resetFeed(tenantId, userId);
  }

  /** La dirección anterior deja de funcionar. */
  resetFeed(tenantId: string, userId: string) {
    return this.repository.saveFeed(
      tenantId,
      userId,
      randomBytes(32).toString('hex'),
    );
  }

  async ics(token: string, now: Date = new Date()): Promise<string> {
    const feed = /^[0-9a-f]{64}$/.test(token)
      ? await this.repository.feedByToken(token)
      : null;
    const user = feed
      ? await this.repository.activeUser(feed.tenantId, feed.userId)
      : null;
    if (!feed || !user) throw new NotFoundException('Calendario no encontrado');
    const events = await this.repository.between(
      feed.tenantId,
      feed.userId,
      new Date(now.getTime() - FEED_PAST_DAYS * DAY_MS),
      new Date(now.getTime() + FEED_FUTURE_DAYS * DAY_MS),
    );
    return buildIcs(events, `${user.tenant.name} · JoapyCore`);
  }

  // Solo quien lo creó; un evento de la empresa creado por otro se ve pero no se toca.
  private async own(tenantId: string, userId: string, id: string) {
    const event = await this.repository.visible(tenantId, userId, id);
    if (!event || event.createdBy !== userId) {
      throw new NotFoundException('Evento no encontrado');
    }
    return event;
  }

  // Sin datos del evento: cada pantalla vuelve a pedir lo que puede ver.
  private changed(tenantId: string, companyWide: boolean) {
    if (companyWide) this.events.emit('calendar.changed', { tenantId });
  }
}
