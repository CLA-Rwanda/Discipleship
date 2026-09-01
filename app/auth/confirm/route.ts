import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/admin/login?error=invalid_link`);
  }

  const response = NextResponse.redirect(`${origin}/admin/setup-password`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let error;
  try {
    ({ error } = await Promise.race([
      supabase.auth.verifyOtp({ token_hash, type: type as any }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Invite verification timed out")), 10_000)),
    ]));
  } catch (err) {
    console.error("Invite verification failed", err);
    return NextResponse.redirect(`${origin}/admin/login?error=auth_callback_failed`);
  }

  if (error) {
    return NextResponse.redirect(`${origin}/admin/login?error=invite_expired`);
  }

  return response;
}
