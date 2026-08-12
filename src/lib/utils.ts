import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Pull a human-readable message out of whatever shape an error comes in as.
 * Supabase auth errors are usually real Error instances, but a malformed
 * upstream response (e.g. a 500 with an unexpected body) can surface as a
 * plain object with no `.message` — falling back to `String(err)` on those
 * would just print "[object Object]" or "{}", so this checks a few of the
 * common alternate fields Supabase/GoTrue error payloads use before giving up.
 */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object") {
    const candidate = err as Record<string, unknown>;
    for (const key of ["message", "msg", "error_description", "error"]) {
      const value = candidate[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return fallback;
}
