import {
  ArgumentsHost,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'POST', url: '/x' }),
    }),
  } as unknown as ArgumentsHost;
  const filter = new HttpExceptionFilter();
  // Silenciar logs esperados
  jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
  filter.catch(exception, host);
  const [[code]] = status.mock.calls as unknown as [[number]];
  const [[body]] = json.mock.calls as unknown as [[Record<string, unknown>]];
  return { code, body };
}

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(
    'internal detail: table "invoices"',
    {
      code,
      clientVersion: 'test',
    },
  );

describe('HttpExceptionFilter', () => {
  it('keeps the message of HTTP exceptions', () => {
    const { code, body } = run(
      new UnprocessableEntityException('No hay stock'),
    );
    expect(code).toBe(422);
    expect(body.message).toBe('No hay stock');
  });

  it('maps a unique constraint violation (P2002) to 409', () => {
    const { code, body } = run(prismaError('P2002'));
    expect(code).toBe(409);
    expect(body.message).not.toContain('invoices');
  });

  it('maps a missing record (P2025) to 404', () => {
    expect(run(prismaError('P2025')).code).toBe(404);
  });

  it('maps a foreign key violation (P2003) to 409', () => {
    expect(run(prismaError('P2003')).code).toBe(409);
  });

  it('keeps unknown Prisma errors and crashes as a generic 500', () => {
    for (const e of [prismaError('P1001'), new Error('boom')]) {
      const { code, body } = run(e);
      expect(code).toBe(500);
      expect(body.message).toBe(
        'Error interno del servidor. Intentá de nuevo más tarde.',
      );
    }
  });

  it('does not confuse Nest ConflictException with Prisma errors', () => {
    expect(run(new ConflictException('Email ya registrado')).body.message).toBe(
      'Email ya registrado',
    );
  });
});
