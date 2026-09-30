import { PERMISSIONS_KEY } from '../common/decorators/permissions.decorator';
import { REQUIRED_MODULE_KEY } from '../common/decorators/required-module.decorator';
import { ApplicationsController } from '../applications/applications.controller';
import { CommunicationHubController } from './hub.controller';

describe('Communication Hub route authorization', () => {
  it('retains separate permissions for the Applications inbox and Communications settings', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        ApplicationsController.prototype.listInbox,
      ),
    ).toContain('applications:email:read');
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        ApplicationsController.prototype.syncInbox,
      ),
    ).toContain('applications:email:read');
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        CommunicationHubController.prototype.settings,
      ),
    ).toContain('communications:access');
  });

  it.each([
    'messages',
    'message',
    'sendInvoice',
    'retry',
    'timeline',
    'note',
  ] as const)(
    '%s requires active billing and invoice read access',
    (method) => {
      const handler = CommunicationHubController.prototype[method];
      expect(Reflect.getMetadata(REQUIRED_MODULE_KEY, handler)).toBe('billing');
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(
        expect.arrayContaining(['communications:access', 'billing:read']),
      );
    },
  );

  it.each(['sendInvoice', 'retry'] as const)(
    '%s requires send permission',
    (method) => {
      expect(
        Reflect.getMetadata(
          PERMISSIONS_KEY,
          CommunicationHubController.prototype[method],
        ),
      ).toContain('communications:email:send');
    },
  );

  it.each([
    'updateSettings',
    'identities',
    'createIdentity',
    'updateIdentity',
    'deleteIdentity',
    'templates',
    'createTemplate',
    'previewTemplate',
  ] as const)('%s requires communications administration', (method) => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        CommunicationHubController.prototype[method],
      ),
    ).toEqual(
      expect.arrayContaining([
        'communications:access',
        'communications:settings:manage',
      ]),
    );
  });

  it('requires dedicated permission for internal notes', () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        CommunicationHubController.prototype.note,
      ),
    ).toContain('communications:notes:create');
  });
});
