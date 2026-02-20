import type { FastifyRequest } from 'fastify';
import { Types } from 'mongoose';
import { z } from 'zod';

import { ApiError } from '../errors.js';

export function parseBody<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request body',
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

export function parseQuery<T>(schema: z.ZodSchema<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: 'Invalid query parameters',
      statusCode: 400,
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

export function requireUser(request: FastifyRequest): { id: string; email: string } {
  if (!request.user) {
    throw new ApiError({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
      statusCode: 401,
    });
  }

  return request.user;
}

export function parseObjectId(value: string, fieldName: string): Types.ObjectId {
  if (!Types.ObjectId.isValid(value)) {
    throw new ApiError({
      code: 'VALIDATION_ERROR',
      message: `Invalid ${fieldName}`,
      statusCode: 400,
    });
  }

  return new Types.ObjectId(value);
}
