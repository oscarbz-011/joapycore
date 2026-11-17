import { demoPassword } from './demo-password';

describe('demoPassword', () => {
  it('returns DEMO_PASSWORD', () => {
    expect(demoPassword({ DEMO_PASSWORD: 'una-clave-larga' })).toBe(
      'una-clave-larga',
    );
  });

  it('refuses to run in production even with a password', () => {
    expect(() =>
      demoPassword({
        NODE_ENV: 'production',
        DEMO_PASSWORD: 'una-clave-larga',
      }),
    ).toThrow('NODE_ENV=production');
  });

  it.each([undefined, '', 'corta'])(
    'rejects a missing or short password (%p)',
    (value) => {
      expect(() => demoPassword({ DEMO_PASSWORD: value })).toThrow(
        'DEMO_PASSWORD',
      );
    },
  );
});
