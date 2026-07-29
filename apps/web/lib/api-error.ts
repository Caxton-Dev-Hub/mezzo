export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.statusCode = body.statusCode;
    this.code = body.code;
    this.details = body.details;
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    try {
      const body = (await response.json()) as Partial<ApiErrorBody>;
      return new ApiError({
        statusCode: body.statusCode ?? response.status,
        code: body.code ?? 'UNKNOWN_ERROR',
        message: body.message ?? 'Something went wrong. Please try again.',
        details: body.details,
      });
    } catch {
      return new ApiError({
        statusCode: response.status,
        code: 'UNKNOWN_ERROR',
        message: 'Something went wrong. Please try again.',
      });
    }
  }
}
