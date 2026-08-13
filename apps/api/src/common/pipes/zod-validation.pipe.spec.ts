import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  email: z.string().email('email must be valid'),
  amount: z.number().int('amount must be an integer'),
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value for valid input', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ email: 'a@example.com', amount: 100 })).toEqual({
      email: 'a@example.com',
      amount: 100,
    });
  });

  it('strips unknown keys rather than passing them through', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ email: 'a@example.com', amount: 100, role: 'ADMIN' })).toEqual({
      email: 'a@example.com',
      amount: 100,
    });
  });

  it('rejects invalid input as a bad request', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform({ email: 'not-an-email', amount: 100 })).toThrow(
      BadRequestException,
    );
  });

  it('surfaces every validation message, not just the first', () => {
    const pipe = new ZodValidationPipe(schema);

    try {
      pipe.transform({ email: 'nope', amount: 1.5 });
      throw new Error('expected the pipe to reject');
    } catch (error) {
      const response = (error as BadRequestException).getResponse() as { message: string[] };
      expect(response.message).toEqual(['email must be valid', 'amount must be an integer']);
    }
  });

  it('rejects a missing payload', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
  });

  it('rejects a payload of the wrong shape entirely', () => {
    const pipe = new ZodValidationPipe(schema);

    expect(() => pipe.transform('a string')).toThrow(BadRequestException);
  });

  it('applies schema coercion and defaults', () => {
    const coercing = z.object({
      limit: z.coerce.number().default(20),
    });
    const pipe = new ZodValidationPipe(coercing);

    expect(pipe.transform({ limit: '50' })).toEqual({ limit: 50 });
    expect(pipe.transform({})).toEqual({ limit: 20 });
  });
});
