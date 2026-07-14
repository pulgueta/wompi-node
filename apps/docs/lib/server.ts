import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type CredentialName = "WOMPI_PUBLIC_KEY" | "WOMPI_PRIVATE_KEY" | "WOMPI_INTEGRITY_KEY";

let ratelimit: Ratelimit | null | undefined;

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function readCredentials(required: CredentialName[]):
  | {
      ok: true;
      publicKey: string;
      privateKey?: string;
      integrityKey?: string;
    }
  | { ok: false; response: Response } {
  const values = {
    WOMPI_PUBLIC_KEY: process.env.WOMPI_PUBLIC_KEY?.trim(),
    WOMPI_PRIVATE_KEY: process.env.WOMPI_PRIVATE_KEY?.trim(),
    WOMPI_INTEGRITY_KEY: process.env.WOMPI_INTEGRITY_KEY?.trim(),
  };
  const missing = required.filter((name) => !values[name]);

  if (missing.length > 0) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          configured: false,
          error: "This live example is temporarily unavailable because its sandbox environment is not configured.",
        },
        503
      ),
    };
  }

  return {
    ok: true,
    publicKey: values.WOMPI_PUBLIC_KEY!,
    privateKey: values.WOMPI_PRIVATE_KEY,
    integrityKey: values.WOMPI_INTEGRITY_KEY,
  };
}

function getRatelimit(): Ratelimit | null {
  if (ratelimit !== undefined) return ratelimit;

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    ratelimit = null;
    return ratelimit;
  }

  ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "60 s"),
    prefix: "wompi-docs",
  });
  return ratelimit;
}

export async function checkRateLimit(request: Request, action: string): Promise<Response | null> {
  const limiter = getRatelimit();
  if (!limiter) return null;

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "anonymous";
  const { success } = await limiter.limit(`${ip}:${action}`);
  return success
    ? null
    : json({ ok: false, error: "Too many requests. Please try again later." }, 429);
}
