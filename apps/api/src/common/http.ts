import { HttpException, HttpStatus, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Error body the web app relies on:
 * { message, code?, fieldErrors?: { field: [messages] } }
 */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, message: string, extra: { code?: string; fieldErrors?: Record<string, string[]> } = {}) {
    super({ message, ...extra }, status);
  }
}

export function fieldError(status: HttpStatus, field: string, message: string, code?: string) {
  return new ApiError(status, message, { code, fieldErrors: { [field]: [message] } });
}

/** Validates and normalises a request body with a shared zod schema. */
export class ZodBody<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    throw new ApiError(HttpStatus.BAD_REQUEST, 'Check the highlighted fields.', { code: 'validation_failed', fieldErrors });
  }
}
