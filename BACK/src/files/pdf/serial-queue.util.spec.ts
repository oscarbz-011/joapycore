import { createSerialQueue } from './serial-queue.util';

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
