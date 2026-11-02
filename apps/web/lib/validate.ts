import type { z } from 'zod';

/** Runs a shared schema in the browser and returns errors keyed by field, in the API's shape. */
export function fieldErrors(schema: z.ZodType, value: unknown): Record<string, string[]> {
  const result = schema.safeParse(value);
  if (result.success) return {};
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) (out[issue.path.join('.') || '_'] ??= []).push(issue.message);
  return out;
}

export const flatten = (errors: Record<string, string[]>) => [...new Set(Object.values(errors).flat())];
