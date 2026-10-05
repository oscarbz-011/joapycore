import { createSerialQueue, withTimeout } from './serial-queue.util';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('createSerialQueue', () => {
  it('never runs two tasks at the same time', async () => {
    const run = createSerialQueue();
    const first = deferred();
    let active = 0;
    let maxActive = 0;
    const task = (wait: Promise<void>) => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait;
      active -= 1;
    };

    const a = run(task(first.promise));
    const b = run(task(Promise.resolve()));
    await Promise.resolve();
    expect(maxActive).toBe(1);

    first.resolve();
    await Promise.all([a, b]);
    expect(maxActive).toBe(1);
  });

  it('keeps the order of arrival', async () => {
    const run = createSerialQueue();
    const order: number[] = [];

    await Promise.all(
      [1, 2, 3].map((n) =>
        run(async () => {
          order.push(n);
        }),
      ),
    );

    expect(order).toEqual([1, 2, 3]);
  });

  it('runs the next task after one fails and reports the error only to its caller', async () => {
    const run = createSerialQueue();

    const failed = run(() => Promise.reject(new Error('chromium')));
    const next = run(() => Promise.resolve('ok'));

    await expect(failed).rejects.toThrow('chromium');
    await expect(next).resolves.toBe('ok');
  });
});

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the result of a task that finishes in time without releasing anything', async () => {
    const onTimeout = jest.fn();

    await expect(
      withTimeout(Promise.resolve('pdf'), 1000, onTimeout),
    ).resolves.toBe('pdf');
    jest.advanceTimersByTime(2000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('fails and releases the resource when the task hangs', async () => {
    const onTimeout = jest.fn();
    const hung = withTimeout(new Promise(() => undefined), 1000, onTimeout);

    jest.advanceTimersByTime(1000);

    await expect(hung).rejects.toThrow('superó el límite');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('lets the queue continue after a hung task is cut', async () => {
    const run = createSerialQueue();
    const hung = run(() =>
      withTimeout(new Promise(() => undefined), 1000, () => undefined),
    );
    const next = run(() => Promise.resolve('siguiente'));
    const cut = expect(hung).rejects.toThrow();

    // La cola arranca la tarea en un microtask: el reloj se avanza después.
    await jest.advanceTimersByTimeAsync(1000);

    await cut;
    await expect(next).resolves.toBe('siguiente');
  });
});
