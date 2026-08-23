import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PosSessionsService } from './pos-sessions.service';

function makeSession(overrides = {}) {
  return {
    id: 'session-1',
    tenantId: 'tenant-1',
    terminalId: 'terminal-1',
    cashierId: 'user-1',
    status: 'OPEN',
    openingCash: 500_000,
    closingCash: null,
    expectedCash: null,
    difference: null,
    openedAt: new Date(),
    closedAt: null,
    ...overrides,
  };
}

describe('PosSessionsService', () => {
  let service: PosSessionsService;
  let posSessionsRepository: {
    findActiveByTerminal: jest.Mock;
    findActiveByCashier: jest.Mock;
    findById: jest.Mock;
    findAll: jest.Mock;
    sumCashPayments: jest.Mock;
    create: jest.Mock;
    close: jest.Mock;
  };
  let posTerminalsService: { findOne: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    posSessionsRepository = {
      findActiveByTerminal: jest.fn(),
      findActiveByCashier: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      sumCashPayments: jest.fn(),
      create: jest.fn(),
      close: jest.fn(),
    };
    posTerminalsService = { findOne: jest.fn().mockResolvedValue({ id: 'terminal-1' }) };
    eventEmitter = { emit: jest.fn() };

    service = new PosSessionsService(
      posSessionsRepository as any,
      posTerminalsService as any,
      eventEmitter as any,
    );
  });

  describe('open', () => {
    it('throws when the terminal already has an OPEN session', async () => {
      posSessionsRepository.findActiveByTerminal.mockResolvedValue(makeSession());

      await expect(
        service.open('tenant-1', { terminalId: 'terminal-1', openingCash: 500_000 }, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(posSessionsRepository.create).not.toHaveBeenCalled();
    });

    it('creates a session and emits pos.session.opened', async () => {
      posSessionsRepository.findActiveByTerminal.mockResolvedValue(null);
      posSessionsRepository.create.mockResolvedValue(makeSession());

      const result = await service.open(
        'tenant-1',
        { terminalId: 'terminal-1', openingCash: 500_000 },
        'user-1',
      );

      expect(result.id).toBe('session-1');
      expect(posSessionsRepository.create).toHaveBeenCalledWith('tenant-1', {
        terminalId: 'terminal-1',
        cashierId: 'user-1',
        openingCash: 500_000,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'pos.session.opened',
        expect.objectContaining({ tenantId: 'tenant-1', sessionId: 'session-1' }),
      );
    });
  });

  describe('close', () => {
    it('throws NotFoundException when the session does not exist', async () => {
      posSessionsRepository.findById.mockResolvedValue(null);

      await expect(
        service.close('tenant-1', 'ghost', { closingCash: 0 }, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws when the session is already closed', async () => {
      posSessionsRepository.findById.mockResolvedValue(makeSession({ status: 'CLOSED' }));

      await expect(
        service.close('tenant-1', 'session-1', { closingCash: 500_000 }, 'user-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('closes as CLOSED when counted cash matches expected cash exactly', async () => {
      posSessionsRepository.findById.mockResolvedValue(makeSession({ openingCash: 500_000 }));
      posSessionsRepository.sumCashPayments.mockResolvedValue({ _sum: { amount: 150_000 } });
      posSessionsRepository.close.mockImplementation((id, data) => Promise.resolve({ id, ...data }));

      const result = await service.close(
        'tenant-1',
        'session-1',
        { closingCash: 650_000 },
        'user-1',
      );

      expect(posSessionsRepository.close).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ expectedCash: 650_000, difference: 0, status: 'CLOSED' }),
      );
      expect(result.status).toBe('CLOSED');
    });

    it('closes as DISCREPANCY when counted cash differs from expected cash', async () => {
      posSessionsRepository.findById.mockResolvedValue(makeSession({ openingCash: 500_000 }));
      posSessionsRepository.sumCashPayments.mockResolvedValue({ _sum: { amount: 150_000 } });
      posSessionsRepository.close.mockImplementation((id, data) => Promise.resolve({ id, ...data }));

      const result = await service.close(
        'tenant-1',
        'session-1',
        { closingCash: 650_200 },
        'user-1',
      );

      expect(posSessionsRepository.close).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({ expectedCash: 650_000, difference: 200, status: 'DISCREPANCY' }),
      );
      expect(result.status).toBe('DISCREPANCY');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'pos.session.closed',
        expect.objectContaining({ difference: 200, status: 'DISCREPANCY' }),
      );
    });
  });
});
