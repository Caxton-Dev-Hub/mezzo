import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api-error';

function jsonResponse(body: unknown, status = 400): Response {
  return {
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function brokenResponse(status = 502): Response {
  return {
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
  } as unknown as Response;
}

describe('ApiError', () => {
  it('carries the structured error fields from the server', () => {
    const error = new ApiError({
      statusCode: 409,
      code: 'ILLEGAL_TRANSITION',
      message: 'Cannot move from RELEASED to SHIPPED',
      details: { from: 'RELEASED', to: 'SHIPPED' },
    });

    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('ILLEGAL_TRANSITION');
    expect(error.message).toBe('Cannot move from RELEASED to SHIPPED');
    expect(error.details).toEqual({ from: 'RELEASED', to: 'SHIPPED' });
  });

  it('is a real Error, so it survives being thrown and caught', () => {
    const error = new ApiError({ statusCode: 400, code: 'BAD_REQUEST', message: 'nope' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ApiError');
  });
});

describe('ApiError.fromResponse', () => {
  it('reads the structured envelope the API sends', async () => {
    const error = await ApiError.fromResponse(
      jsonResponse(
        {
          statusCode: 403,
          code: 'KYC_TIER_REQUIRED',
          message: 'Verify your identity to continue',
          details: { requiredTier: 'TIER_1' },
        },
        403,
      ),
    );

    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('KYC_TIER_REQUIRED');
    expect(error.message).toBe('Verify your identity to continue');
    expect(error.details).toEqual({ requiredTier: 'TIER_1' });
  });

  it('falls back to the transport status when the body omits one', async () => {
    const error = await ApiError.fromResponse(jsonResponse({ message: 'Only that' }, 418));

    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('Only that');
  });

  it('supplies a user-facing message when the body has none', async () => {
    const error = await ApiError.fromResponse(jsonResponse({}, 500));

    expect(error.message).toBe('Something went wrong. Please try again.');
  });

  it('survives a non-json response body such as an html error page', async () => {
    const error = await ApiError.fromResponse(brokenResponse(502));

    expect(error.statusCode).toBe(502);
    expect(error.code).toBe('UNKNOWN_ERROR');
    expect(error.message).toBe('Something went wrong. Please try again.');
  });
});
