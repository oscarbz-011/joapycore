import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  MessagesQueryDto,
  OpenConversationDto,
  SendMessageDto,
} from './chat.dto';

describe('Chat request validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const body = <T>(metatype: new () => T, value: unknown) =>
    pipe.transform(value, { type: 'body', metatype }) as Promise<T>;

  it('accepts a message and trims it', async () => {
    await expect(
      body(SendMessageDto, { body: '  Hola  ' }),
    ).resolves.toMatchObject({ body: 'Hola' });
  });

  it('rejects an empty or oversized message', async () => {
    await expect(body(SendMessageDto, { body: '   ' })).rejects.toThrow();
    await expect(
      body(SendMessageDto, { body: 'x'.repeat(4001) }),
    ).rejects.toThrow();
  });

  // Quién escribe y en qué empresa salen de la sesión, nunca del pedido.
  it('rejects a sender or a tenant sent by the client', async () => {
    await expect(
      body(SendMessageDto, { body: 'Hola', senderId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      body(OpenConversationDto, {
        participantIds: [randomUUID()],
        tenantId: randomUUID(),
      }),
    ).rejects.toThrow();
  });

  it('accepts the people of a new conversation', async () => {
    const ids = [randomUUID(), randomUUID()];
    await expect(
      body(OpenConversationDto, { participantIds: ids, name: ' Cobranzas ' }),
    ).resolves.toMatchObject({ participantIds: ids, name: 'Cobranzas' });
  });

  it('rejects no people, repeated people and ids that are not ids', async () => {
    const id = randomUUID();
    await expect(
      body(OpenConversationDto, { participantIds: [] }),
    ).rejects.toThrow();
    await expect(
      body(OpenConversationDto, { participantIds: [id, id] }),
    ).rejects.toThrow();
    await expect(
      body(OpenConversationDto, { participantIds: ['ana'] }),
    ).rejects.toThrow();
  });

  it('reads the page of messages from the query string', async () => {
    const query = (value: unknown) =>
      pipe.transform(value, { type: 'query', metatype: MessagesQueryDto });

    await expect(query({})).resolves.toMatchObject({ limit: 50 });
    await expect(
      query({ limit: '20', before: '2026-10-13T15:00:00.000Z' }),
    ).resolves.toMatchObject({ limit: 20, before: '2026-10-13T15:00:00.000Z' });
    await expect(query({ limit: '500' })).rejects.toThrow();
    await expect(query({ before: 'ayer' })).rejects.toThrow();
  });
});
