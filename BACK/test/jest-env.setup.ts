// Variables de entorno mínimas para tests unitarios. Valores de prueba: nunca
// se usan fuera de Jest.
process.env.TEMP_PASSWORD_KEY ??= 'test-temp-password-key-0123456789abcdef';
process.env.JWT_ACCESS_SECRET ??= 'test-jwt-access-secret-0123456789abcdef';
