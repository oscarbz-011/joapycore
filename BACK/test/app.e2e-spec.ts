/**
 * E2E contra la app completa (AppModule + la misma configuración HTTP que
 * producción) y la base de DATABASE_URL. Crea su propio tenant con un email
 * único y lo borra al terminar, así no depende de los seeds de demo.
 *
 * Correr con: pnpm test:e2e
 */
import 'dotenv/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const PASSWORD = 'E2e-Password-123!';

describe('JoapyCore API (e2e)', () => {
  let app: NestExpressApplication;
  let http: App;
  let prisma: PrismaService;
  const email = `e2e-${randomUUID()}@joapycore.test`;
  let tenantId: string | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (tenantId) await purgeTenant(prisma, tenantId);
    await app.close();
  });

  it('rejects protected routes without a token and sends security headers', async () => {
    const res = await request(http).get('/inventory/products').expect(401);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('answers CORS preflight for a browser origin in development', async () => {
    const res = await request(http)
      .options('/auth/login')
      .set('Origin', 'http://localhost:3001')
      .set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).toBe(
      'http://localhost:3001',
    );
  });

  let tokens: Tokens;

  it('registers a tenant and returns a working session', async () => {
    const res = await request(http)
      .post('/auth/register')
      .send({
        tenantName: 'E2E Test',
        firstName: 'Prueba',
        lastName: 'Pérez',
        email,
        password: PASSWORD,
      })
      .expect(201);
    tokens = res.body as Tokens;
    expect(tokens.accessToken).toBeTruthy();

    const me = await request(http)
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    tenantId = (me.body as { tenantId: string }).tenantId;
    expect(me.body).not.toHaveProperty('passwordHash');
    expect(me.body).not.toHaveProperty('tempPasswordEncrypted');
  });

  it('validates the body and reports the reason', async () => {
    const res = await request(http)
      .post('/auth/login')
      .send({ emailOrUsername: email })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('password');
  });

  it('serves the communication center behind authentication with opt-in flags', async () => {
    await request(http).get('/communications/settings').expect(401);
    const settings = await request(http)
      .get('/communications/settings')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(settings.body).toEqual({
      enabled: false,
      emailEnabled: false,
      invoiceEmailEnabled: false,
    });
    await request(http)
      .patch('/communications/settings')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ enabled: true, tenantId: randomUUID() })
      .expect(400);
    await request(http)
      .patch('/communications/settings')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ enabled: true })
      .expect(200);
    const notifications = await request(http)
      .get('/communications/notifications')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(notifications.body).toMatchObject({ items: [], unreadCount: 0 });
  });

  it('keeps the IMAP inbox available behind its existing authorization', async () => {
    await request(http).get('/applications/email/inbox').expect(401);
    const inbox = await request(http)
      .get('/applications/email/inbox')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    expect(inbox.body).toEqual([]);
  });

  it('rotates the refresh token and rejects the one already used', async () => {
    const res = await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    const rotated = res.body as Tokens;
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken);

    await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    tokens = rotated;
  });

  it('closes existing sessions after a password change', async () => {
    // iat tiene resolución de segundos: el token viejo tiene que ser de un
    // segundo anterior al cambio.
    await new Promise((r) => setTimeout(r, 1100));
    await request(http)
      .post('/users/me/change-password')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: `${PASSWORD}x` })
      .expect(201);

    await request(http)
      .get('/users/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);
    await request(http)
      .post('/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    await request(http)
      .post('/auth/login')
      .send({ emailOrUsername: email, password: `${PASSWORD}x` })
      .expect(200);
  });

  it('rate-limits repeated login attempts', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(http)
        .post('/auth/login')
        .send({ emailOrUsername: email, password: 'incorrecta' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(401);
    expect(statuses[statuses.length - 1]).toBe(429);
  });
});

/**
 * Borra todo lo que cuelga del tenant. Recorre las tablas con tenant_id y
 * reintenta las que fallan por FK hasta que no queda nada (el orden de
 * dependencias varía con el schema).
 */
async function purgeTenant(prisma: PrismaService, tenantId: string) {
  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'tenant_id' AND table_schema = 'public'`;
  const userIds = (
    await prisma.user.findMany({ where: { tenantId }, select: { id: true } })
  ).map((u) => u.id);

  const byUser = ['refresh_tokens', 'user_roles', 'user_permissions'];
  for (const table of byUser) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "${table}" WHERE "user_id" = ANY($1::text[])`,
      userIds,
    );
  }
  await prisma.$executeRaw`
    DELETE FROM "role_permissions" WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "tenant_id" = ${tenantId})`;

  let pending = tables.map((t) => t.table_name);
  for (let round = 0; round < 10 && pending.length > 0; round++) {
    const failed: string[] = [];
    for (const table of pending) {
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "${table}" WHERE "tenant_id" = $1`,
          tenantId,
        );
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await prisma.tenant.delete({ where: { id: tenantId } });
}
