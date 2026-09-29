import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const APPLICATION_EMAIL_PERMISSIONS = [
  'integrations:read',
  'integrations:manage',
  'applications:email:read',
  'applications:email:send',
] as const;

describe('application email permission migrations', () => {
  it('seeds every permission and grants it only to system roles', () => {
    const migrationsDirectory = join(process.cwd(), 'prisma', 'migrations');
    const migrations = readdirSync(migrationsDirectory, {
      withFileTypes: true,
    });
    const sql = migrations
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(
          join(migrationsDirectory, entry.name, 'migration.sql'),
          'utf8',
        ),
      )
      .find((migration) =>
        APPLICATION_EMAIL_PERMISSIONS.every((permission) =>
          migration.includes(`'${permission}'`),
        ),
      );

    expect(sql).toBeDefined();
    expect(sql).toContain('r.is_system = true');
    expect(sql).toContain('ON CONFLICT DO NOTHING');
  });
});
