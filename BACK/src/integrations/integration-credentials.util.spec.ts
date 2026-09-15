import {
  decryptIntegrationConfig,
  encryptIntegrationConfig,
} from './integration-credentials.util';

describe('integration credentials encryption', () => {
  const secret = 'integration-secret-at-least-32-characters';

  it('round-trips a configuration without storing plaintext', () => {
    const config = { host: 'smtp.example.com', password: 'very-secret' };
    const encrypted = encryptIntegrationConfig(config, secret);

    expect(encrypted).not.toContain('very-secret');
    expect(decryptIntegrationConfig(encrypted, secret)).toEqual(config);
  });

  it('rejects a ciphertext encrypted with another key', () => {
    const encrypted = encryptIntegrationConfig({ password: 'secret' }, secret);
    expect(() =>
      decryptIntegrationConfig(
        encrypted,
        'another-secret-at-least-32-characters',
      ),
    ).toThrow();
  });
});
