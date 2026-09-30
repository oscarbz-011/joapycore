import { describe, expect, it } from 'vitest';
import * as usersModule from './users';
import type { UpdateProfilePayload, UserResponse } from './users';

type SaveOwnProfile = (
  input: {
    currentEmail: string;
    email: string;
    currentPassword: string;
    profile: UpdateProfilePayload;
    sessionRefreshPending: boolean;
  },
  dependencies: {
    changeEmail: (input: {
      email: string;
      currentPassword: string;
    }) => Promise<UserResponse>;
    updateMe: (input: UpdateProfilePayload) => Promise<UserResponse>;
    refreshSession: () => Promise<void>;
    onEmailCommitted: (user: UserResponse) => void;
    onSessionRefreshCompleted: () => void;
  },
) => Promise<UserResponse>;

const user: UserResponse = {
  id: 'user-1',
  email: 'new@example.com',
  username: 'user.one',
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '',
  status: 'ACTIVE',
  mustChangePassword: false,
  tempPassword: null,
  tempPasswordExpiresAt: null,
  tenantId: 'tenant-1',
  roles: [],
  extraPermissions: [],
  createdAt: '2026-09-22T00:00:00.000Z',
  updatedAt: '2026-09-22T00:00:00.000Z',
};

describe('saveOwnProfile', () => {
  it('retries a pending session refresh before updating the profile', async () => {
    const saveOwnProfile = (
      usersModule as typeof usersModule & {
        saveOwnProfile?: SaveOwnProfile;
      }
    ).saveOwnProfile;
    expect(
      saveOwnProfile,
      'saveOwnProfile must preserve and retry a pending session refresh',
    ).toBeTypeOf('function');
    if (!saveOwnProfile) return;
    const events: string[] = [];
    let currentEmail = 'old@example.com';
    let sessionRefreshPending = false;
    let refreshAttempts = 0;
    const dependencies = {
      changeEmail: async () => {
        events.push('email-committed');
        currentEmail = user.email;
        return user;
      },
      updateMe: async () => {
        events.push('profile-updated');
        return user;
      },
      refreshSession: async () => {
        refreshAttempts += 1;
        events.push(`refresh-${refreshAttempts}`);
        if (refreshAttempts === 1) throw new Error('transient refresh failure');
      },
      onEmailCommitted: () => {
        sessionRefreshPending = true;
      },
      onSessionRefreshCompleted: () => {
        sessionRefreshPending = false;
      },
    };

    await expect(
      saveOwnProfile(
        {
          currentEmail,
          email: user.email,
          currentPassword: 'current-password',
          profile: { firstName: 'Jane', phone: '' },
          sessionRefreshPending,
        },
        dependencies,
      ),
    ).rejects.toThrow('transient refresh failure');
    expect(sessionRefreshPending).toBe(true);

    await saveOwnProfile(
      {
        currentEmail,
        email: user.email,
        currentPassword: '',
        profile: { firstName: 'Jane', phone: '' },
        sessionRefreshPending,
      },
      dependencies,
    );

    expect(events).toEqual([
      'email-committed',
      'refresh-1',
      'refresh-2',
      'profile-updated',
    ]);
    expect(sessionRefreshPending).toBe(false);
  });
});
