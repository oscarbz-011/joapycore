/**
 * Ejecuta las tareas de a una, en orden de llegada. Si una falla, la
 * siguiente corre igual: el error solo le llega a quien la pidió.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
