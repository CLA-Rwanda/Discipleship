import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses RLS.
 * Must only be used in server actions and API routes, never in client components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set in .env.local. " +
      "Find it in: Supabase Dashboard → Project Settings → API → service_role secret."
    );
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
