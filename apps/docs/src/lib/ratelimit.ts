import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { UPSTASH_REDIS_REST_TOKEN, UPSTASH_REDIS_REST_URL } from "astro:env/server";

let _ratelimit: Ratelimit | null = null;
let _initialized = false;

function getRatelimit(): Ratelimit | null {
  if (_initialized) return _ratelimit;
  _initialized = true;
  try {
    _ratelimit = new Ratelimit({
      redis: new Redis({
        url: UPSTASH_REDIS_REST_URL,
        token: UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      prefix: "wompi-docs",
    });
  } catch {
    // UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — skip limiting.
    _ratelimit = null;
  }
  return _ratelimit;
}

function ipFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() ?? "anonymous";
}

/**
 * Returns a 429 Response if the IP has exceeded the rate limit, or null to proceed.
 * When Upstash env vars are absent the function always returns null (no-op).
 */
export async function checkRateLimit(request: Request, action: string): Promise<Response | null> {
  const limiter = getRatelimit();
  if (!limiter) return null;

  const ip = ipFromRequest(request);
  const { success } = await limiter.limit(`${ip}:${action}`);
  if (success) return null;

  return new Response(
    JSON.stringify({ ok: false, error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60" },
    }
  );
}
