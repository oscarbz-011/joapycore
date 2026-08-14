import { Injectable } from '@nestjs/common';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PermissionsCache {
  private readonly store = new Map<string, { keys: string[]; expiresAt: number }>();

  get(userId: string): string[] | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(userId);
      return null;
    }
    return entry.keys;
  }

  set(userId: string, keys: string[]): void {
    this.store.set(userId, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  invalidate(userId: string): void {
    this.store.delete(userId);
  }

  invalidateMany(userIds: string[]): void {
    for (const id of userIds) {
      this.store.delete(id);
    }
  }
}
