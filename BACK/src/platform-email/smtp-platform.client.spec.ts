import {
  classifySmtpPlatformFailure,
  stableMessageId,
} from './smtp-platform.client';

describe('classifySmtpPlatformFailure', () => {
  const summary = (error: unknown, sending: boolean) => {
    const { code, ambiguous, retryable } = classifySmtpPlatformFailure(
      error,
      sending,
    );
    return { code, ambiguous, retryable };
  };

  it('knows nothing went out when the server could not be reached', () => {
    expect(summary({ code: 'ECONNECTION' }, false)).toEqual({
      code: 'PROVIDER_UNREACHABLE',
      ambiguous: false,
      retryable: true,
    });
  });

  // Se cortó mientras se enviaba: pudo haber salido.
  it('does not know the outcome when the connection drops while sending', () => {
    expect(summary({ code: 'ETIMEDOUT' }, true)).toEqual({
      code: 'PROVIDER_UNREACHABLE',
      ambiguous: true,
      retryable: true,
    });
  });

  it('tells wrong credentials apart, with nothing to retry', () => {
    expect(summary({ responseCode: 535 }, false)).toEqual({
      code: 'PROVIDER_AUTH',
      ambiguous: false,
      retryable: false,
    });
  });

  it('retries later what the server turns down for now', () => {
    expect(summary({ responseCode: 451 }, true)).toEqual({
      code: 'PROVIDER_LIMIT',
      ambiguous: false,
      retryable: true,
    });
  });

  it('takes a permanent rejection as final', () => {
    expect(summary({ responseCode: 553 }, true)).toEqual({
      code: 'PROVIDER_REJECTED',
      ambiguous: false,
      retryable: false,
    });
  });

  it('does not show the answer of the server to the user', () => {
    const error = classifySmtpPlatformFailure(
      {
        responseCode: 553,
        response: '553 Relaying disallowed as secreto@x.com',
      },
      true,
    );
    expect(error.message).not.toContain('secreto');
  });
});

describe('stableMessageId', () => {
  it('is the same for the same send, on the domain it goes out from', () => {
    const first = stableMessageId(
      'communication-<abc@x>',
      'avisos@joapycore.com',
    );
    expect(first).toBe('<communication--abc-x-@joapycore.com>');
    expect(
      stableMessageId('communication-<abc@x>', 'avisos@joapycore.com'),
    ).toBe(first);
  });
});
