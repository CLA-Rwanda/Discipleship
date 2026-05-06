export const ADMIN_EMAIL = "difebi14@gmail.com";

/**
 * Returns the canonical site origin for the current environment.
 * Priority:
 *   1. NEXT_PUBLIC_SITE_URL  — set this in Vercel for the production domain
 *   2. VERCEL_URL            — auto-injected by Vercel on every deployment (preview + prod)
 *   3. localhost fallback    — local dev
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}
