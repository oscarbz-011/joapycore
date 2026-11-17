const MIN_LENGTH = 8;

export function demoPassword(env: NodeJS.ProcessEnv): string {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Los datos de demostración no se cargan con NODE_ENV=production',
    );
  }
  const password = env.DEMO_PASSWORD;
  if (!password || password.length < MIN_LENGTH) {
    throw new Error(
      `Falta DEMO_PASSWORD en BACK/.env (mínimo ${MIN_LENGTH} caracteres)`,
    );
  }
  return password;
}
