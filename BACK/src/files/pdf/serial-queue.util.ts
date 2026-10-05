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

/**
 * Corta una tarea que no termina a tiempo. `onTimeout` libera lo que la tarea
 * tenga tomado (p. ej. matar el navegador); la promesa falla para que quien
 * la pidió se entere y la cola siga con la próxima.
 */
export function withTimeout<T>(
  task: Promise<T>,
  ms: number,
  onTimeout: () => void,
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`La tarea superó el límite de ${ms} ms`));
    }, ms);
  });
  return Promise.race([task, timeout]).finally(() => clearTimeout(timer));
}
