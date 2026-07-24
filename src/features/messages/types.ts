import type { UserRole } from '../../lib/supabase';

// ============================================================================
// أنواع بيانات نظام "الرسائل" الداخلي — مطابقة تماماً لجداول قاعدة البيانات
// (conversations / conversation_members / messages / message_reads /
// typing_status / online_status). لا تكرار لأي نوع بيانات مستخدم أو صلاحية،
// كلها مستوردة من lib/supabase.ts.
//
// ملحوظة: هذا الملف خاص بالمحادثات الفردية (direct) فقط. نظام "غرفة الفريق"
// الجماعي منفصل تماماً — راجع src/features/teamRoom/types.ts.
// ============================================================================

export type ConversationType = 'direct';

export interface Conversation {
  id: string;
  type: ConversationType;
  created_by: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  is_hidden: boolean;
  last_read_at: string | null;
  joined_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  reply_to_message_id: string | null;
  forwarded_from_message_id: string | null;
  mentions: string[];
  is_pinned: boolean;
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  deleted_for_everyone_at: string | null;
  hidden_for: string[];
  created_at: string;
  updated_at: string;
}

export interface MessageRead {
  id: string;
  message_id: string;
  user_id: string;
  delivered_at: string | null;
  read_at: string | null;
}

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'read';

/** رسالة مع بيانات إضافية محسوبة على الواجهة (اسم المرسل، حالة التسليم، الرد المقتبس...) */
export interface MessageWithMeta extends MessageRow {
  sender_name?: string;
  sender_avatar_url?: string | null;
  delivery_status?: MessageDeliveryStatus;
  reply_to?: Pick<MessageRow, 'id' | 'content' | 'sender_id'> | null;
}

/** عنصر قائمة المحادثات مع كل ما تحتاجه الواجهة لعرضه دفعة واحدة */
export interface ConversationListItem {
  conversation: Conversation;
  member: ConversationMember;
  /** الطرف الآخر فى المحادثة الفردية فقط (null فى الجماعية) */
  otherUser?: MessageableUser | null;
  unreadCount: number;
}

export interface MessageableUser {
  id: string;
  name: string;
  role: UserRole;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

export interface TypingStatusRow {
  conversation_id: string;
  user_id: string;
  is_typing: boolean;
  updated_at: string;
}

export interface OnlineStatusRow {
  user_id: string;
  is_online: boolean;
  last_seen_at: string;
  updated_at: string;
}

export interface SearchMessageResult {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  created_at: string;
}

/**
 * ترتيب تقسيم المستخدمين فى نافذة "رسالة جديدة" حسب الهيكل الوظيفي —
 * من الأعلى للأسفل، مطابق تماماً لنص المتطلبات.
 */
export const MESSAGING_ROLE_GROUP_ORDER: UserRole[] = [
  'development_manager',
  'general_supervisor',
  'supervisor',
  'group_leader',
  'premium_agent',
  'agent',
];

export const MESSAGING_ROLE_GROUP_LABELS: Record<UserRole, string> = {
  super_admin: 'مدير النظام',
  development_manager: 'مدير التطوير',
  general_supervisor: 'المراقب العام',
  supervisor: 'المراقبون',
  group_leader: 'رؤساء المجموعات',
  agent: 'الإيجنت',
  premium_agent: 'وسيط حر',
};
