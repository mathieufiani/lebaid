import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (!ratelimit) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return null; // fail open if Redis not configured
    }
    ratelimit = new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: false,
    });
  }
  return ratelimit;
}

export async function checkRateLimit(ip: string): Promise<{ success: boolean; remaining: number }> {
  const rl = getRatelimit();
  if (!rl) return { success: true, remaining: 99 }; // fail open
  const { success, remaining } = await rl.limit(`lebaid_submit_${ip}`);
  return { success, remaining };
}
