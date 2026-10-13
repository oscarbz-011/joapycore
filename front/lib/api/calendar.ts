import { apiClient } from './client';

export interface CalendarEvent {
  id: string;
  createdBy: string;
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  /** UTC. Con allDay, la medianoche UTC del día de calendario. */
  startsAt: string;
  endsAt: string;
  companyWide: boolean;
  updatedAt: string;
  mine?: boolean;
}
export interface CalendarEventInput {
  title: string;
  description: string | null;
  location: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  companyWide: boolean;
}

export const calendarApi = {
  events: (from: string, to: string): Promise<CalendarEvent[]> =>
    apiClient.get('/calendar/events', { params: { from, to } }).then((r) => r.data),
  event: (id: string): Promise<CalendarEvent> => apiClient.get(`/calendar/events/${id}`).then((r) => r.data),
  create: (input: CalendarEventInput): Promise<CalendarEvent> =>
    apiClient.post('/calendar/events', input).then((r) => r.data),
  update: (id: string, input: CalendarEventInput): Promise<CalendarEvent> =>
    apiClient.patch(`/calendar/events/${id}`, input).then((r) => r.data),
  remove: (id: string): Promise<void> => apiClient.delete(`/calendar/events/${id}`).then(() => undefined),
  feed: (): Promise<{ token: string }> => apiClient.get('/calendar/feed').then((r) => r.data),
  resetFeed: (): Promise<{ token: string }> => apiClient.post('/calendar/feed/reset').then((r) => r.data),
};
