// El calendario de un usuario en formato iCalendar (RFC 5545), que es lo que
// leen Google Calendar, Outlook y Apple al suscribirse a una dirección.

export interface IcsEvent {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: Date;
  endsAt: Date;
  updatedAt: Date;
}

const pad = (value: number) => String(value).padStart(2, '0');
const dateOf = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
const instantOf = (date: Date) =>
  `${dateOf(date)}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Una línea no puede pasar de 75 octetos: se corta y sigue con un espacio.
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function eventLines(event: IcsEvent, host: string): string[] {
  // En iCalendar el fin de un evento de día completo es el día siguiente.
  const dayAfterEnd = new Date(event.endsAt.getTime() + 24 * 60 * 60 * 1000);
  return [
    'BEGIN:VEVENT',
    `UID:${event.id}@${host}`,
    `DTSTAMP:${instantOf(event.updatedAt)}`,
    ...(event.allDay
      ? [
          `DTSTART;VALUE=DATE:${dateOf(event.startsAt)}`,
          `DTEND;VALUE=DATE:${dateOf(dayAfterEnd)}`,
        ]
      : [
          `DTSTART:${instantOf(event.startsAt)}`,
          `DTEND:${instantOf(event.endsAt)}`,
        ]),
    `SUMMARY:${icsText(event.title)}`,
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    'END:VEVENT',
  ];
}

export function buildIcs(
  events: IcsEvent[],
  calendarName: string,
  host = 'joapycore',
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JoapyCore//Calendario//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(calendarName)}`,
    ...events.flatMap((event) => eventLines(event, host)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
