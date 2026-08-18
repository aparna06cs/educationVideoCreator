// Cloudflare Workers AI via the REST API.
//
// Deliberately NOT using an `env.AI` binding: this project's build (Nitro's
// cloudflare-module preset, wrapped by @lovable.dev/vite-tanstack-config)
// regenerates .output/server/wrangler.json from scratch on every build, so
// hand-added bindings don't survive. A plain authenticated fetch needs no
// build config at all.
//
// It also fixes the reason we left Pollinations: this call is authenticated
// per-account, so it isn't subject to the per-IP queueing that made outbound
// requests from Cloudflare's shared egress IPs unusable.
//
// SECURITY: server-only. Never import from client code.

const TIMEOUT_MS = 30000;
const MAX_ATTEMPTS = 2;

export type WorkersAiError = { status: number; detail: string };

function accountId(): string {
  // R2_ACCOUNT_ID is the same Cloudflare account, so reuse it when a dedicated
  // CF_ACCOUNT_ID isn't set.
  const id = process.env["CF_ACCOUNT_ID"] || process.env["R2_ACCOUNT_ID"];
  if (!id) throw new Error("Missing CF_ACCOUNT_ID (or R2_ACCOUNT_ID) for Workers AI.");
  return id;
}

function apiToken(): string {
  const token = process.env["CF_AI_TOKEN"];
  if (!token) throw new Error("Missing CF_AI_TOKEN for Workers AI.");
  return token;
}

/**
 * Runs a Workers AI model and returns its `result` payload.
 * Throws a WorkersAiError-shaped Error on failure so callers can surface detail.
 */
export async function runWorkersAi<T>(model: string, input: Record<string, unknown>): Promise<T> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/${model}`;
  const token = apiToken();

  let last: WorkersAiError = { status: 502, detail: "Workers AI request failed." };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      });

      if (!res.ok) {
        last = { status: res.status, detail: (await res.text().catch(() => "")).slice(0, 300) };
        continue;
      }

      const payload = (await res.json()) as { result?: T; success?: boolean; errors?: unknown };
      if (!payload.success || payload.result === undefined) {
        last = { status: 502, detail: JSON.stringify(payload.errors ?? payload).slice(0, 300) };
        continue;
      }

      return payload.result;
    } catch (err) {
      last = {
        status: 504,
        detail: err instanceof Error ? err.message : "Workers AI request timed out.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const error = new Error(`Workers AI failed (${last.status}). ${last.detail}`);
  (error as Error & WorkersAiError).status = last.status;
  (error as Error & WorkersAiError).detail = last.detail;
  throw error;
}

/** Decodes a base64 string (as Workers AI returns for image/audio) into bytes. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
