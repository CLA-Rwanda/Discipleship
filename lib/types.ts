export type Slot = "8am" | "10am" | "12pm";

export interface Member {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  preferred_slot: Slot;
  class_id?: string;
  registered_at: string;
}

export interface Class {
  id: string;
  name: string;
  slot: Slot;
  facilitator_id?: string;
  capacity_min: number;
  capacity_max: number;
  is_active: boolean;
  member_count?: number;
  facilitator?: Facilitator;
}

export interface Facilitator {
  id: string;
  full_name: string;
  email?: string;
  phone?: string;
  user_id?: string;
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  member_id?: string;
  member_name: string;
  phone?: string;
  class_id?: string;
  attended_at: string;
  service_slot: Slot;
}

export interface Resource {
  id: string;
  title: string;
  description?: string;
  category: string;
  url?: string;
  file_path?: string;
  created_at: string;
  is_published: boolean;
}

export type AdminRole = "super_admin" | "admin" | "facilitator" | "intern";

export interface AdminRoleRecord {
  id: string;
  user_id: string;
  role: AdminRole;
  granted_by?: string;
  granted_at: string;
}

export interface SlotCapacity {
  slot: Slot;
  total_capacity: number;
  used: number;
  remaining: number;
  is_full: boolean;
}
