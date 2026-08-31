-- Keep a member's attendance assignment aligned with their current class.
-- Transfers and swaps are atomic so the member and attendance records cannot
-- be left pointing at different classes.

CREATE OR REPLACE FUNCTION move_member_to_class(
  p_member_id UUID,
  p_target_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_target classes%ROWTYPE;
  v_target_count INT;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found.'; END IF;

  SELECT * INTO v_target FROM classes WHERE id = p_target_class_id FOR UPDATE;
  IF NOT FOUND OR NOT v_target.is_active THEN RAISE EXCEPTION 'Target class is not available.'; END IF;
  IF v_member.class_id = p_target_class_id THEN RAISE EXCEPTION 'Member is already in this class.'; END IF;

  SELECT COUNT(*) INTO v_target_count FROM members WHERE class_id = p_target_class_id;
  IF v_target_count >= v_target.capacity_max THEN RAISE EXCEPTION 'Target class is full.'; END IF;

  UPDATE members
  SET class_id = v_target.id, preferred_slot = v_target.slot
  WHERE id = p_member_id;

  UPDATE attendance
  SET class_id = v_target.id, service_slot = v_target.slot
  WHERE member_id = p_member_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION swap_members_between_classes(
  p_first_member_id UUID,
  p_second_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first members%ROWTYPE;
  v_second members%ROWTYPE;
  v_first_class classes%ROWTYPE;
  v_second_class classes%ROWTYPE;
BEGIN
  IF p_first_member_id = p_second_member_id THEN RAISE EXCEPTION 'Choose two different members.'; END IF;

  -- Lock in a stable order to avoid concurrent swaps deadlocking each other.
  PERFORM 1 FROM members WHERE id IN (p_first_member_id, p_second_member_id) ORDER BY id FOR UPDATE;
  SELECT * INTO v_first FROM members WHERE id = p_first_member_id;
  SELECT * INTO v_second FROM members WHERE id = p_second_member_id;
  IF v_first.id IS NULL OR v_second.id IS NULL OR v_first.class_id IS NULL OR v_second.class_id IS NULL THEN
    RAISE EXCEPTION 'Both members must belong to a class.';
  END IF;
  IF v_first.class_id = v_second.class_id THEN RAISE EXCEPTION 'Members are already in the same class.'; END IF;

  SELECT * INTO v_first_class FROM classes WHERE id = v_first.class_id;
  SELECT * INTO v_second_class FROM classes WHERE id = v_second.class_id;
  IF NOT v_first_class.is_active OR NOT v_second_class.is_active THEN RAISE EXCEPTION 'Both classes must be active.'; END IF;

  UPDATE members SET class_id = v_second_class.id, preferred_slot = v_second_class.slot WHERE id = v_first.id;
  UPDATE members SET class_id = v_first_class.id, preferred_slot = v_first_class.slot WHERE id = v_second.id;

  UPDATE attendance SET class_id = v_second_class.id, service_slot = v_second_class.slot WHERE member_id = v_first.id;
  UPDATE attendance SET class_id = v_first_class.id, service_slot = v_first_class.slot WHERE member_id = v_second.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Only server actions using the service-role client may invoke these
-- SECURITY DEFINER functions; browser clients must not call them directly.
REVOKE EXECUTE ON FUNCTION move_member_to_class(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION swap_members_between_classes(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION move_member_to_class(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION swap_members_between_classes(UUID, UUID) TO service_role;

-- Repair records created before transfers became atomic. This intentionally
-- applies the agreed current-class policy to all linked attendance history.
UPDATE attendance AS a
SET class_id = m.class_id,
    service_slot = c.slot
FROM members AS m
JOIN classes AS c ON c.id = m.class_id
WHERE a.member_id = m.id
  AND m.class_id IS NOT NULL
  AND (a.class_id IS DISTINCT FROM m.class_id OR a.service_slot IS DISTINCT FROM c.slot);
