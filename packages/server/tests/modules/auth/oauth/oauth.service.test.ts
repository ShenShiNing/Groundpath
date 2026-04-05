import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@core/db/schema/user/users.schema';
import type { OAuthUserData } from '@modules/auth/oauth/oauth.types';

const { resetTransactionCounter, withTransactionMock, userServiceMock, userAuthRepositoryMock } =
  vi.hoisted(() => {
    let transactionCounter = 0;

    return {
      resetTransactionCounter: () => {
        transactionCounter = 0;
      },
      withTransactionMock: vi.fn((callback: (tx: { id: string }) => Promise<unknown>) =>
        callback({ id: `tx-${++transactionCounter}` })
      ),
      userServiceMock: {
        findById: vi.fn(),
        findByEmail: vi.fn(),
        create: vi.fn(),
        existsByUsername: vi.fn(),
        updateLastLogin: vi.fn(),
      },
      userAuthRepositoryMock: {
        findByAuthTypeAndId: vi.fn(),
        create: vi.fn(),
        updateAuthData: vi.fn(),
      },
    };
  });

vi.mock('@core/db/db.utils', () => ({
  withTransaction: withTransactionMock,
}));

vi.mock('@modules/user/public/management', () => ({
  userService: userServiceMock,
}));

vi.mock('@modules/auth/repositories/user-auth.repository', () => ({
  userAuthRepository: userAuthRepositoryMock,
}));

vi.mock('@modules/auth/repositories/login-log.repository', () => ({
  loginLogRepository: {
    recordSuccess: vi.fn(),
  },
}));

vi.mock('@modules/auth/services/token.service', () => ({
  tokenService: {
    generateTokenPair: vi.fn(),
  },
}));

vi.mock('@modules/auth/repositories/oauth-exchange-code.repository', () => ({
  oauthExchangeCodeRepository: {
    create: vi.fn(),
    consume: vi.fn(),
  },
}));

vi.mock('@modules/logs/public/auth-enrichment', () => ({
  detectDevice: vi.fn(),
  getGeoLocationAsync: vi.fn(),
}));

vi.mock('@core/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@core/logger/redaction', () => ({
  fingerprintIpAddress: vi.fn(() => 'ip-fingerprint'),
}));

import { findOrCreateOAuthUser } from '@modules/auth/oauth/oauth.service';

function buildUser(overrides: Partial<User> = {}): User {
  const username = overrides.username ?? 'oauth-user';
  const email = overrides.email ?? 'oauth@example.com';

  return {
    id: overrides.id ?? 'user-1',
    username,
    email,
    password: overrides.password ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    bio: overrides.bio ?? null,
    status: overrides.status ?? 'active',
    emailVerified: overrides.emailVerified ?? true,
    emailVerifiedAt: overrides.emailVerifiedAt ?? new Date('2024-01-01T00:00:00Z'),
    lastLoginAt: overrides.lastLoginAt ?? null,
    lastLoginIp: overrides.lastLoginIp ?? null,
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    updatedBy: overrides.updatedBy ?? null,
    updatedAt: overrides.updatedAt ?? new Date('2024-01-01T00:00:00Z'),
    deletedBy: overrides.deletedBy ?? null,
    deletedAt: overrides.deletedAt ?? null,
    activeUsername: overrides.activeUsername ?? username,
    activeEmail: overrides.activeEmail ?? email,
  };
}

function buildOAuthUserData(overrides: Partial<OAuthUserData> = {}): OAuthUserData {
  return {
    providerType: overrides.providerType ?? 'github',
    providerId: overrides.providerId ?? 'github-user-123',
    email: overrides.email ?? 'oauth@example.com',
    username: overrides.username ?? 'Alice',
    avatarUrl: overrides.avatarUrl ?? 'https://example.com/avatar.png',
    accessToken: overrides.accessToken ?? 'oauth-access-token',
    profile: overrides.profile ?? { login: 'alice' },
  };
}

describe('oauth.service > findOrCreateOAuthUser', () => {
  beforeEach(() => {
    resetTransactionCounter();
    vi.clearAllMocks();
  });

  it('reuses the persisted auth binding when a concurrent first login wins after user creation', async () => {
    const oauthUserData = buildOAuthUserData();
    const transientNewUser = buildUser({
      id: 'user-new',
      username: 'alice',
      email: 'oauth@example.com',
      activeUsername: 'alice',
    });
    const persistedUser = buildUser({
      id: 'user-existing',
      username: 'alice1',
      email: 'oauth@example.com',
      activeUsername: 'alice1',
    });

    userAuthRepositoryMock.findByAuthTypeAndId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        id: 'auth-existing',
        userId: persistedUser.id,
        authType: 'github',
        authId: oauthUserData.providerId,
        authData: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      })
      .mockResolvedValueOnce({
        id: 'auth-existing',
        userId: persistedUser.id,
        authType: 'github',
        authId: oauthUserData.providerId,
        authData: null,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });
    userServiceMock.findByEmail.mockResolvedValueOnce(undefined);
    userServiceMock.existsByUsername.mockResolvedValueOnce(false);
    userServiceMock.create.mockResolvedValueOnce(transientNewUser);
    userAuthRepositoryMock.create.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
    userAuthRepositoryMock.updateAuthData.mockResolvedValue(undefined);
    userServiceMock.findById.mockResolvedValueOnce(persistedUser);

    const result = await findOrCreateOAuthUser(oauthUserData);

    expect(result).toEqual(persistedUser);
    expect(withTransactionMock).toHaveBeenCalledTimes(2);
    expect(userServiceMock.create).toHaveBeenCalledTimes(1);
    expect(userAuthRepositoryMock.updateAuthData).toHaveBeenCalledTimes(1);
    expect(userAuthRepositoryMock.updateAuthData).toHaveBeenCalledWith(
      'auth-existing',
      {
        accessToken: oauthUserData.accessToken,
        profile: oauthUserData.profile,
      },
      expect.any(Object)
    );
  });

  it('reuses the concurrent email winner instead of failing when user creation hits a duplicate entry', async () => {
    const oauthUserData = buildOAuthUserData();
    const existingUser = buildUser({
      id: 'user-existing',
      username: 'alice',
      email: 'oauth@example.com',
      activeUsername: 'alice',
    });

    userAuthRepositoryMock.findByAuthTypeAndId.mockResolvedValueOnce(undefined);
    userServiceMock.findByEmail
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existingUser);
    userServiceMock.existsByUsername.mockResolvedValueOnce(false);
    userServiceMock.create.mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' });
    userAuthRepositoryMock.create.mockResolvedValueOnce({
      id: 'auth-new',
      userId: existingUser.id,
      authType: 'github',
      authId: oauthUserData.providerId,
      authData: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await findOrCreateOAuthUser(oauthUserData);

    expect(result).toEqual(existingUser);
    expect(userAuthRepositoryMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: existingUser.id,
        authType: 'github',
        authId: oauthUserData.providerId,
      }),
      expect.any(Object)
    );
  });

  it('retries with the next username candidate when a concurrent insert takes the first one', async () => {
    const oauthUserData = buildOAuthUserData();
    const createdUser = buildUser({
      id: 'user-created',
      username: 'alice1',
      email: 'oauth@example.com',
      activeUsername: 'alice1',
    });

    userAuthRepositoryMock.findByAuthTypeAndId.mockResolvedValueOnce(undefined);
    userServiceMock.findByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    userServiceMock.existsByUsername
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    userServiceMock.create
      .mockRejectedValueOnce({ code: 'ER_DUP_ENTRY' })
      .mockResolvedValueOnce(createdUser);
    userAuthRepositoryMock.create.mockResolvedValueOnce({
      id: 'auth-created',
      userId: createdUser.id,
      authType: 'github',
      authId: oauthUserData.providerId,
      authData: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-01T00:00:00Z'),
    });

    const result = await findOrCreateOAuthUser(oauthUserData);

    expect(result).toEqual(createdUser);
    expect(userServiceMock.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        username: 'alice',
      }),
      expect.any(Object)
    );
    expect(userServiceMock.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        username: 'alice1',
      }),
      expect.any(Object)
    );
  });
});
