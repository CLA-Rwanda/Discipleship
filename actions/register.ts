"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { isFormLocked } from "@/actions/time-lock";

export interface RegistrationResult {
  success: boolean;
  error?: string;
  member?: {
    first_name: string;
    last_name: string;
    class_name: string;
    slot: string;
    facilitator_name?: string;
  };
  alternativeSlots?: Array<{
    slot: string;
    remaining: number;
    total: number;
  }>;
}

export async function registerMember(formData: {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  preferred_slot: string;
}): Promise<RegistrationResult> {
  const { locked } = await isFormLocked();
  if (locked) {
    return { success: false, error: "Registration is currently closed. Please come back during service hours." };
  }

  const supabase = createServerSupabaseClient();

  const { data, error } = await supabase.rpc("assign_member_to_class", {
    p_first_name:     formData.first_name.trim(),
    p_last_name:      formData.last_name.trim(),
    p_phone:          formData.phone.trim(),
    p_email:          formData.email?.trim() || null,
    p_preferred_slot: formData.preferred_slot,
  });

  if (error) return { success: false, error: error.message };
  if (!data)  return { success: false, error: "An unexpected error occurred." };

  const result = data as {
    status: string;
    class_name?: string;
    slot?: string;
    facilitator_name?: string;
    alternative_slots?: Array<{ slot: string; remaining: number; total: number }>;
  };

  if (result.status === "assigned") {
    return {
      success: true,
      member: {
        first_name: formData.first_name.trim(),
        last_name:  formData.last_name.trim(),
        class_name: result.class_name!,
        slot:       result.slot!,
        facilitator_name: result.facilitator_name,
      },
    };
  }

  if (result.status === "slot_full") {
    return {
      success: false,
      error: "slot_full",
      alternativeSlots: result.alternative_slots?.filter((s) => s.remaining > 0),
    };
  }

  if (result.status === "all_full") {
    return { success: false, error: "all_full" };
  }

  return { success: false, error: "Something went wrong. Please try again." };
}

export async function getSlotCapacities(): Promise<
  Array<{ slot: string; remaining: number; total: number }>
> {
  const supabase = createServerSupabaseClient();

  const { data: classData } = await supabase
    .from("classes")
    .select("slot, id, capacity_max")
    .eq("is_active", true);

  if (!classData || classData.length === 0) return [];

  const slotMap = new Map<string, { classIds: string[]; totalCapacity: number }>();
  for (const cls of classData) {
    if (!slotMap.has(cls.slot)) slotMap.set(cls.slot, { classIds: [], totalCapacity: 0 });
    const entry = slotMap.get(cls.slot)!;
    entry.classIds.push(cls.id);
    entry.totalCapacity += cls.capacity_max;
  }

  const results = await Promise.all(
    Array.from(slotMap.entries()).map(async ([slot, { classIds, totalCapacity }]) => {
      const { count } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .in("class_id", classIds);
      const used = count ?? 0;
      return { slot, remaining: Math.max(0, totalCapacity - used), total: totalCapacity };
    })
  );

  return results.sort((a, b) => a.slot.localeCompare(b.slot));
}

// ─── Pending / Waitlist ──────────────────────────────────────

export interface PendingMember {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  preferred_slot: string | null;
  registered_at: string;
  status: "waiting" | "promoted" | "dismissed";
  notes: string | null;
  promoted_class: string | null;
}

export async function addToPendingList(formData: {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  preferred_slot: string;
}): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("pending_members").insert({
    first_name:     formData.first_name,
    last_name:      formData.last_name,
    phone:          formData.phone || null,
    email:          formData.email || null,
    preferred_slot: formData.preferred_slot,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function getPendingMembers(): Promise<PendingMember[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pending_members")
    .select("*")
    .order("registered_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PendingMember[];
}

export async function updatePendingStatus(
  id: string,
  status: "promoted" | "dismissed",
  promotedClass?: string
): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("pending_members")
    .update({ status, promoted_class: promotedClass ?? null })
    .eq("id", id);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function promotePendingMember(
  pendingId: string,
  member: { first_name: string; last_name: string; phone: string; email?: string; preferred_slot: string }
): Promise<{ success: boolean; class_name?: string; slot?: string; error?: string }> {
  const admin = createAdminClient();

  // Assign to class using the existing RPC (bypasses time lock — admin action)
  const { data, error } = await admin.rpc("assign_member_to_class", {
    p_first_name:     member.first_name,
    p_last_name:      member.last_name,
    p_phone:          member.phone,
    p_email:          member.email ?? null,
    p_preferred_slot: member.preferred_slot,
  });

  if (error) return { success: false, error: error.message };

  const result = data as { status: string; class_name?: string; slot?: string };

  if (result.status === "assigned") {
    await updatePendingStatus(pendingId, "promoted", result.class_name);
    return { success: true, class_name: result.class_name, slot: result.slot };
  }

  if (result.status === "slot_full" || result.status === "all_full") {
    return { success: false, error: "All classes are still full. Free up a spot before promoting." };
  }

  return { success: false, error: "Could not assign member to a class." };
}
