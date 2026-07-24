import type { UserRole } from '../../lib/supabase';

// ============================================================================
// أنواع بيانات "غرفة الفريق" — الغرفة الجماعية الوحيدة فى النظام بالكامل.
// مطابقة تماماً لجدول team_room_messages وقاعدة بيانات الرؤية المطبّقة عبر
// RLS (كل مستخدم يرى فقط الرسائل الواقعة داخل visible_to الخاصة بها).
//
// هذا النظام منفصل تماماً عن نظام الرسائل الفردية (features/messages) —
// لا يشترك معه فى أي جدول أو دالة أو صلاحية.
// ============================================================================

export interface TeamRoomMessageRow {
  id: string;
  sender_id: string;
  content: string;
  reply_to_message_id: string | null;
  /** لا تُعرض هذه القيمة فى الواجهة أبداً — للاستخدام الداخلي فقط عبر RLS */
  visible_to: string[];
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** رسالة مع بيانات إضافية محسوبة على الواجهة (اسم المرسل، الرد المقتبس...) */
export interface TeamRoomMessageWithMeta extends TeamRoomMessageRow {
  sender_name?: string;
  sender_role?: UserRole;
  sender_avatar_url?: string | null;
  reply_to?: Pick<TeamRoomMessageRow, 'id' | 'content' | 'sender_id'> | null;
}

export interface TeamRoomParticipantInfo {
  id: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
}
