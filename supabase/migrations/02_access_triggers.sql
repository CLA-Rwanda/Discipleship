-- ============================================================
-- Migration 02: Access Control Hardening
-- Run in Supabase SQL editor after schema.sql
-- ============================================================

-- ── TRIGGER 1: Prevent deletion of the super_admin row ──────
CREATE OR REPLACE FUNCTION protect_super_admin_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role = 'super_admin' THEN
    RAISE EXCEPTION 'The super admin role cannot be deleted. This is enforced at the database level.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_super_admin_delete ON admin_roles;
CREATE TRIGGER guard_super_admin_delete
  BEFORE DELETE ON admin_roles
  FOR EACH ROW EXECUTE FUNCTION protect_super_admin_delete();

-- ── TRIGGER 2: Prevent changing the super_admin role ────────
CREATE OR REPLACE FUNCTION protect_super_admin_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.role = 'super_admin' AND NEW.role <> 'super_admin' THEN
    RAISE EXCEPTION 'The super admin role cannot be changed or downgraded.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_super_admin_update ON admin_roles;
CREATE TRIGGER guard_super_admin_update
  BEFORE UPDATE ON admin_roles
  FOR EACH ROW EXECUTE FUNCTION protect_super_admin_update();

-- ── TRIGGER 3: Auto-assign role when invited user confirms ──
-- When Supabase creates an invited user, we immediately insert
-- their role from the invite metadata (set during inviteUserByEmail).
-- This fires on INSERT into auth.users where raw_user_meta_data
-- contains an 'invited_role' key.
CREATE OR REPLACE FUNCTION auto_assign_invited_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := NEW.raw_user_meta_data->>'invited_role';
  IF v_role IS NOT NULL AND v_role IN ('admin', 'facilitator', 'intern') THEN
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (NEW.id, v_role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_invited ON auth.users;
CREATE TRIGGER on_auth_user_invited
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION auto_assign_invited_role();
