import { ResendClient, ResendDeliveryError } from './resend.client';

const email = {
  from: '"Mi Empresa vía JoapyCore" <mi-empresa@correo.joapycore.com>',
  to: 'cliente@example.com',
  subject: 'Orden de compra OC-1',
  html: '<p>Hola</p>',
  replyTo: 'ventas@miempresa.com',
  attachments: [
    {
      filename: 'orden.pdf',
      content: Buffer.from('PDF'),
      contentType: 'application/pdf',
    },
  ],
  tags: [{ name: 'tenant_id', value: 'tenant-1' }],
};

const respond = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as Response;

describe('ResendClient', () => {
  const client = new ResendClient();
  let fetchMock: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const failure = async (): Promise<ResendDeliveryError> => {
    const error: unknown = await client
      .send('re_key', email, 'key-1')
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ResendDeliveryError);
    return error as ResendDeliveryError;
  };

  it('posts the email with the key, the idempotency key and the attachment in base64', async () => {
    fetchMock.mockResolvedValue(respond(200, { id: 'msg-1' }));

    await expect(client.send('re_key', email, 'key-1')).resolves.toEqual({
      id: 'msg-1',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer re_key',
      'Idempotency-Key': 'key-1',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      from: email.from,
      to: ['cliente@example.com'],
      subject: 'Orden de compra OC-1',
      html: '<p>Hola</p>',
      reply_to: 'ventas@miempresa.com',
      attachments: [
        {
          filename: 'orden.pdf',
          content: Buffer.from('PDF').toString('base64'),
          content_type: 'application/pdf',
        },
      ],
      tags: [{ name: 'tenant_id', value: 'tenant-1' }],
    });
  });

  // Sin respuesta no se sabe si el correo salió: no se puede dar por fallado.
  it('does not know the outcome when the request never answers', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    expect(await failure()).toMatchObject({
      code: 'PROVIDER_UNREACHABLE',
      ambiguous: true,
      retryable: true,
    });
  });

  it('treats a server error as an unknown outcome worth retrying', async () => {
    fetchMock.mockResolvedValue(respond(500, { name: 'application_error' }));

    expect(await failure()).toMatchObject({ ambiguous: true, retryable: true });
  });

  it('knows a rate limit did not send anything and can be retried', async () => {
    fetchMock.mockResolvedValue(respond(429, { name: 'rate_limit_exceeded' }));

    expect(await failure()).toMatchObject({
      code: 'PROVIDER_LIMIT',
      ambiguous: false,
      retryable: true,
    });
  });

  it('gives up on a rejected message', async () => {
    fetchMock.mockResolvedValue(respond(422, { name: 'validation_error' }));

    expect(await failure()).toMatchObject({
      code: 'PROVIDER_INVALID',
      ambiguous: false,
      retryable: false,
    });
  });

  // El detalle del proveedor puede nombrar la clave: no llega al usuario.
  it('never repeats what the provider said', async () => {
    fetchMock.mockResolvedValue(
      respond(401, { name: 'invalid_api_key', message: 'API key re_secret' }),
    );

    const error = await failure();
    expect(error.code).toBe('PROVIDER_AUTH');
    expect(error.message).not.toContain('re_secret');
  });

  it('does not trust a success without a message id', async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    expect(await failure()).toMatchObject({ code: 'PROVIDER_UNEXPECTED' });
  });
});
