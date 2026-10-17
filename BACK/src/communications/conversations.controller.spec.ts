import { ValidationPipe } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { REQUIRED_MODULE_KEY } from '../common/decorators/required-module.decorator';
import { ConversationsController } from './conversations.controller';
import { ConversationParamsDto, ConversationsQueryDto } from './hub.dto';

describe('Conversations route authorization', () => {
  it('requires the billing module for every route', () => {
    expect(
      Reflect.getMetadata(REQUIRED_MODULE_KEY, ConversationsController),
    ).toBe('billing');
  });

  it.each(['list', 'summary', 'thread'] as const)(
    '%s requires delivery and invoice read access',
    (method) => {
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          ConversationsController.prototype[method],
        ),
      ).toEqual([
        'communications:access',
        'communications:delivery:read',
        'billing:read',
      ]);
    },
  );

  it('requires the notes permission to write a note', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        ConversationsController.prototype.note,
      ),
    ).toEqual([
      'communications:access',
      'communications:notes:create',
      'billing:read',
    ]);
  });
});

describe('Conversations request validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const query = (value: unknown) =>
    pipe.transform(value, { type: 'query', metatype: ConversationsQueryDto });
  const params = (value: unknown) =>
    pipe.transform(value, { type: 'param', metatype: ConversationParamsDto });

  it('reads the filters from the query string', async () => {
    await expect(
      query({ page: '2', onlyProblems: 'true', search: '  maría ' }),
    ).resolves.toMatchObject({
      page: 2,
      limit: 20,
      onlyProblems: true,
      search: 'maría',
    });
    await expect(query({})).resolves.toMatchObject({
      page: 1,
      onlyProblems: false,
    });
  });

  it('rejects unknown filters and contact types', async () => {
    await expect(query({ tenantId: 'other' })).rejects.toThrow();
    await expect(query({ contactType: 'EMPLOYEE' })).rejects.toThrow();
    await expect(
      params({ contactType: 'EMPLOYEE', contactId: crypto.randomUUID() }),
    ).rejects.toThrow();
    await expect(
      params({ contactType: 'CUSTOMER', contactId: 'not-an-id' }),
    ).rejects.toThrow();
  });
});
