import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = { access: null as string | null, refresh: 'r0' as string | null };

vi.mock('../token-store', () => ({
  tokenStore: {
    getAccessToken: () => store.access,
    setAccessToken: (t: string | null) => {
      store.access = t;
    },
    getRefreshToken: () => store.refresh,
    setRefreshToken: (t: string | null) => {
      store.refresh = t;
    },
  },
}));

const post = vi.fn();
vi.mock('axios', () => ({ default: { post: (...args: unknown[]) => post(...args) } }));

describe('refreshSessionTokens', () => {
  beforeEach(() => {
    vi.resetModules();
    post.mockReset();
    store.access = null;
    store.refresh = 'r0';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares a single request between concurrent callers in the same tab', async () => {
    let n = 0;
    post.mockImplementation(async (_url: string, body: { refreshToken: string }) => {
      n++;
      await new Promise((r) => setTimeout(r, 10));
      return { data: { accessToken: `a${n}`, refreshToken: `${body.refreshToken}-next`, user: {} } };
    });
    const { refreshSessionTokens } = await import('./session-refresh');

    const [a, b] = await Promise.all([refreshSessionTokens(), refreshSessionTokens()]);

    expect(post).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(store).toEqual({ access: 'a1', refresh: 'r0-next' });
  });

  it('reads the refresh token inside the cross-tab lock, after the previous holder rotated it', async () => {
    // Web Locks simulado: los callbacks corren en serie.
    let tail: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      locks: {
        request: (_name: string, cb: () => Promise<unknown>) => {
          const run = tail.then(cb);
          tail = run.catch(() => undefined);
          return run;
        },
      },
    });
    post.mockImplementation(async (_url: string, body: { refreshToken: string }) => ({
      data: { accessToken: 'a', refreshToken: `${body.refreshToken}+`, user: {} },
    }));
    const { refreshSessionTokens } = await import('./session-refresh');

    // "Otra pestaña" tiene el lock y rota el token antes que nosotros.
    void navigator.locks.request('joapy-auth-refresh', async () => {
      await new Promise((r) => setTimeout(r, 10));
      store.refresh = 'rotated-by-other-tab';
    });
    await refreshSessionTokens();

    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'rotated-by-other-tab' },
      expect.anything(),
    );
  });

  it('fails without calling the API when there is no session', async () => {
    store.refresh = null;
    const { refreshSessionTokens } = await import('./session-refresh');
    await expect(refreshSessionTokens()).rejects.toThrow('No hay sesión');
    expect(post).not.toHaveBeenCalled();
  });
});
