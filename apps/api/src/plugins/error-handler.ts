import { AppError, ErrorCodes } from '@schoolmate/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

/**
 * P0-API-02: every error leaves the API in the standard envelope (Plan §7).
 * Order matters: AppError (intentional) → validation → Fastify HTTP errors → 500.
 */
export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send({
        success: false,
        error: { code: err.code, message: err.message, details: err.details },
      });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Request validation failed',
          details: err.validation.map((v) => ({
            field: v.instancePath.replace(/^\//, '') || undefined,
            message: v.message ?? 'Invalid value',
          })),
        },
      });
    }

    // Fastify-generated HTTP errors (rate limit 429, payload too large, etc.)
    if (err.statusCode && err.statusCode < 500) {
      const code = err.statusCode === 429 ? ErrorCodes.RATE_LIMITED : ErrorCodes.VALIDATION_ERROR;
      return reply.status(err.statusCode).send({
        success: false,
        error: { code, message: err.message },
      });
    }

    // Postgres constraint violations → clean client errors (not 500s).
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505') {
      return reply.status(409).send({
        success: false,
        error: { code: ErrorCodes.CONFLICT, message: 'A record with these values already exists' },
      });
    }
    if (pgCode === '23503') {
      return reply.status(400).send({
        success: false,
        error: {
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Referenced record does not exist',
        },
      });
    }

    request.log.error({ err }, 'unhandled error');
    return reply.status(500).send({
      success: false,
      error: { code: ErrorCodes.INTERNAL_ERROR, message: 'Something went wrong' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: ErrorCodes.NOT_FOUND,
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
});
