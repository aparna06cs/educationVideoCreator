// Cloudflare R2 object storage — used for large blobs (source PDFs, exported videos)
// that shouldn't live in the Supabase free-tier storage buckets. Uses aws4fetch so it
// works from any edge runtime without Node's crypto module.
// SECURITY: server-only. Never import this from a route file or *.functions.ts that ships to the client.
import { AwsClient } from "aws4fetch";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Configure Cloudflare R2 to store large files.`);
  return value;
}

function r2Endpoint(): string {
  return `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`;
}

function r2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    service: "s3",
    region: "auto",
  });
}

function objectUrl(key: string): string {
  return `${r2Endpoint()}/${env("R2_BUCKET")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export async function uploadToR2(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const client = r2Client();
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const res = await client.fetch(objectUrl(key), {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`R2 upload failed (${res.status}): ${detail.slice(0, 300)}`);
  }
}

export async function deleteFromR2(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map(async (key) => {
      const client = r2Client();
      await client.fetch(objectUrl(key), { method: "DELETE" }).catch(() => {});
    }),
  );
}

export async function getR2SignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const client = r2Client();
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  const signed = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return signed.url;
}
