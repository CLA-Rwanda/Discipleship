-- ============================================================
-- CLA Admin User Setup
-- Run this ONCE in the Supabase SQL editor after schema.sql
--
-- Initial password: CLAAdmin2025!
-- Change it from /admin/login → "Change / Reset Password"
-- or from /admin/settings once logged in.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Only insert if this email doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM auth.users WHERE email = 'difebi14@gmail.com'
  ) THEN
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      role,
      aud,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      'difebi14@gmail.com',
      crypt('CLAAdmin2025!', gen_salt('bf')),
      now(),
      'authenticated',
      'authenticated',
      now(),
      now(),
      '{"provider": "email", "providers": ["email"]}',
      '{}',
      false,
      '',
      '',
      '',
      ''
    );
  ELSE
    -- User already exists — grab their id
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = 'difebi14@gmail.com';
  END IF;

  -- Upsert super_admin role (admin_roles has UNIQUE on user_id)
  INSERT INTO admin_roles (user_id, role)
  VALUES (v_user_id, 'super_admin')
  ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
END $$;
