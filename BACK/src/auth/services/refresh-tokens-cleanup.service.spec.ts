import { RefreshTokensCleanupService } from './refresh-tokens-cleanup.service';

describe('RefreshTokensCleanupService', () => {
  it('deletes tokens expired or revoked more than 30 days ago', async () => {
    const repo = { deleteStale: jest.fn().mockResolvedValue({ count: 5 }) };
    const service = new RefreshTokensCleanupService(repo as never);

    const count = await service.purgeStaleTokens(
      new Date('2026-09-13T06:00:00Z'),
    );

    expect(count).toBe(5);
    expect(repo.deleteStale).toHaveBeenCalledWith(
      new Date('2026-08-14T06:00:00Z'),
    );
  });
});
