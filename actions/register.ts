"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Slot } from "@/lib/types";

export interface RegistrationResult {
  success: boolean;
  error?: string;
  member?: {
    full_name: string;
    class_name: string;
    slot: string;
    facilitator_name?: string;
  };
  alternativeSlots?: Array<{
    slot: Slot;
    remaining: number;
    total: number;
  }>;
}

export async function registerMember(formData: {
  full_name: string;
  phone: string;
  email?: string;
  preferred_slot: Slot;
}): Promise<RegistrationResult> {
  const supabase = createServerSupabaseClient();

  // Use RPC to atomically assign a class
  const { data, error } = await supabase.rpc("assign_member_to_class", {
    p_full_name: formData.full_name,
    p_phone: formData.phone,
    p_email: formData.email || null,
    p_preferred_slot: formData.preferred_slot,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: "An unexpected error occurred." };
  }

  const result = data as {
    status: string;
    class_name?: string;
    slot?: string;
    facilitator_name?: string;
    alternative_slots?: Array<{ slot: Slot; remaining: number; total: number }>;
  };

  if (result.status === "assigned") {
    return {
      success: true,
      member: {
        full_name: formData.full_name,
        class_name: result.class_name!,
        slot: result.slot!,
        facilitator_name: result.facilitator_name,
      },
    };
  }

  if (result.status === "slot_full") {
    return {
      success: false,
      error: "slot_full",
      alternativeSlots: result.alternative_slots,
    };
  }

  if (result.status === "all_full") {
    return {
      success: false,
      error: "All discipleship classes are currently at capacity. Please check back soon.",
    };
  }

  return { success: false, error: "Something went wrong. Please try again." };
}

export async function getSlotCapacities(): Promise<
  Array<{ slot: Slot; remaining: number; total: number }>
> {
  const supabase = createServerSupabaseClient();

  const slots: Slot[] = ["8am", "10am", "12pm"];
  const results = await Promise.all(
    slots.map(async (slot) => {
      const { data: classes } = await supabase
        .from("classes")
        .select("id, capacity_max")
        .eq("slot", slot)
        .eq("is_active", true);

      if (!classes || classes.length === 0) {
        return { slot, remaining: 0, total: 0 };
      }

      const classIds = classes.map((c) => c.id);
      const totalCapacity = classes.reduce((sum, c) => sum + c.capacity_max, 0);

      const { count } = await supabase
        .from("members")
        .select("*", { count: "exact", head: true })
        .in("class_id", classIds);

      const used = count ?? 0;
      return {
        slot,
        remaining: Math.max(0, totalCapacity - used),
        total: totalCapacity,
      };
    })
  );

  return results;
}
