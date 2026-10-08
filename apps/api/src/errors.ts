import { GraphQLError } from 'graphql';
import type { ZodError, ZodType } from 'zod';

import { fieldErrors } from '@splitease/shared';

/**
 * Errors thrown as GraphQLError are shown to clients; anything else is masked
 * by Yoga as "Unexpected error." in production so internals never leak.
 */
export type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_USER_INPUT' | 'CONFLICT';

export function appError(code: ErrorCode, message: string, extra: Record<string, unknown> = {}) {
  return new GraphQLError(message, { extensions: { code, ...extra } });
}

export const unauthenticated = () => appError('UNAUTHENTICATED', 'You need to sign in to do that');
export const forbidden = (message = 'You do not have access to this resource') => appError('FORBIDDEN', message);
export const notFound = (what = 'Resource') => appError('NOT_FOUND', `${what} not found`);

export function validationError(error: ZodError) {
  const fields = fieldErrors(error);
  const first = Object.values(fields)[0] ?? 'Invalid input';
  return appError('BAD_USER_INPUT', first, { fields });
}

/** Parse input with a shared zod schema, converting failures into a BAD_USER_INPUT error. */
export function parseInput<T extends ZodType>(schema: T, input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data as T['_output'];
}
