export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly isNetworkError: boolean = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
