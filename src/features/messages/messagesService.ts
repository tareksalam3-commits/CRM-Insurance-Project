import { supabase } from '../../lib/supabase';
import type {
  Conversation, ConversationListItem, ConversationMember, MessageWithMeta,
  MessageableUser, SearchMessageResult,
} from './types';

// ============================================================================
// مصدر واحد لكل استدعاءات نظام الرسائل. كل عملية كتابة تمر عبر دوال قاعدة
// البيانات (RPC) المخصصة لضمان تطبيق صلاحيات can_message ومهل التعديل/الحذف
// فى كل الحالات (بدون أي منطق صلاحيات مكرر هنا فى الواجهة).
// ============================================================================

const MESSAGES_PAGE_SIZE = 50;

// ------------------------- قائمة جهات الاتصال المسموح بها -------------------------
export async function fetchMessageableUsers(): Promise<MessageableUser[]> {
  const { data, error } = await supabase.rpc('list_messageable_users');
  if (error) throw error;
  return (data || []) as MessageableUser[];
}

// ------------------------------- قائمة المحادثات -------------------------------
export async function fetchMyConversations(currentUserId: string): Promise<ConversationListItem[]> {
  const { data: members, error: membersError } = await supabase
    .from('conversation_members')
    .select('*, conversation:conversations(*)')
    .eq('user_id', currentUserId)
    .eq('is_hidden', false);

  if (membersError) throw membersError;
  if (!members || members.length === 0) return [];

  const conversationIds = members.map((m: any) => m.conversation_id);

  // الطرف الآخر فى كل محادثة فردية (لعرض الاسم/الصورة/الحالة)
  const { data: allMembers, error: allMembersError } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id')
    .in('conversation_id', conversationIds);
  if (allMembersError) throw allMembersError;

  const otherUserIdsByConversation = new Map<string, string>();
  for (const row of allMembers || []) {
    if (row.user_id !== currentUserId) otherUserIdsByConversation.set(row.conversation_id, row.user_id);
  }
  const otherUserIds = Array.from(new Set(otherUserIdsByConversation.values()));

  let usersById = new Map<string, MessageableUser>();
  if (otherUserIds.length > 0) {
    // ملحوظة: سياسة RLS على جدول users تسمح فقط برؤية بيانات النفس والمرؤوسين
    // (وليس المديرين)، لذلك نستخدم دالة get_conversation_partners_info التى
    // تتجاوز هذا القيد لأى طرف نشارك معه محادثة فعلية بالفعل — بدون هذا كان
    // اسم المُرسِل الأعلى فى الهيكل يظهر "مستخدم" بدل اسمه الحقيقي.
    const { data: users, error: usersError } = await supabase
      .rpc('get_conversation_partners_info', { p_user_ids: otherUserIds });
    if (usersError) throw usersError;

    usersById = new Map(
      (users || []).map((u: any) => [
        u.id,
        {
          id: u.id, name: u.name, role: u.role, avatar_url: u.avatar_url,
          is_online: u.is_online ?? false,
          last_seen_at: u.last_seen_at ?? null,
        } as MessageableUser,
      ])
    );
  }

  // عدد الرسائل غير المقروءة لكل محادثة
  const { data: unreadRows, error: unreadError } = await supabase
    .from('message_reads')
    .select('message_id, messages!inner(conversation_id)')
    .eq('user_id', currentUserId)
    .is('read_at', null)
    .in('messages.conversation_id', conversationIds);
  if (unreadError) throw unreadError;

  const unreadCountByConversation = new Map<string, number>();
  for (const row of (unreadRows as any[]) || []) {
    const convId = row.messages.conversation_id as string;
    unreadCountByConversation.set(convId, (unreadCountByConversation.get(convId) || 0) + 1);
  }

  const items: ConversationListItem[] = (members as any[])
    .filter((m) => m.conversation)
    .map((m) => {
      const conversation = m.conversation as Conversation;
      const otherUserId = otherUserIdsByConversation.get(conversation.id);
      return {
        conversation,
        member: {
          id: m.id, conversation_id: m.conversation_id, user_id: m.user_id,
          is_pinned: m.is_pinned, is_muted: m.is_muted, is_archived: m.is_archived, is_hidden: m.is_hidden,
          last_read_at: m.last_read_at, joined_at: m.joined_at,
        } as ConversationMember,
        otherUser: conversation.type === 'direct' && otherUserId ? usersById.get(otherUserId) || null : null,
        unreadCount: unreadCountByConversation.get(conversation.id) || 0,
      };
    });

  // ترتيب: المثبّتة أولاً، ثم الأحدث رسالة
  items.sort((a, b) => {
    if (a.member.is_pinned !== b.member.is_pinned) return a.member.is_pinned ? -1 : 1;
    const aTime = a.conversation.last_message_at ? new Date(a.conversation.last_message_at).getTime() : 0;
    const bTime = b.conversation.last_message_at ? new Date(b.conversation.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  return items;
}

export async function getOrCreateDirectConversation(targetUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { p_target_user_id: targetUserId });
  if (error) throw error;
  return data as string;
}

export async function fetchConversationMembers(conversationId: string): Promise<(ConversationMember & { user: MessageableUser })[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('*')
    .eq('conversation_id', conversationId);
  if (error) throw error;

  const rows = (data || []) as any[];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));

  // نفس سبب استخدام get_conversation_partners_info فى fetchMyConversations:
  // عرض بيانات كل أعضاء الجروب بغض النظر عن موقعهم فى الهيكل الوظيفي بالنسبة لنا
  let usersById = new Map<string, MessageableUser>();
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .rpc('get_conversation_partners_info', { p_user_ids: userIds });
    if (usersError) throw usersError;
    usersById = new Map(
      (users || []).map((u: any) => [
        u.id,
        { id: u.id, name: u.name, role: u.role, avatar_url: u.avatar_url, is_online: u.is_online ?? false, last_seen_at: u.last_seen_at ?? null } as MessageableUser,
      ])
    );
  }

  return rows.map((row) => ({
    id: row.id, conversation_id: row.conversation_id, user_id: row.user_id,
    is_pinned: row.is_pinned, is_muted: row.is_muted, is_archived: row.is_archived, is_hidden: row.is_hidden,
    last_read_at: row.last_read_at, joined_at: row.joined_at,
    user: usersById.get(row.user_id) || {
      id: row.user_id, name: 'مستخدم', role: 'agent', avatar_url: null, is_online: false, last_seen_at: null,
    },
  }));
}

// --------------------------------- الرسائل ---------------------------------
export async function fetchMessages(conversationId: string, beforeCreatedAt?: string): Promise<MessageWithMeta[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);

  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as any[];

  // أسماء وصور المُرسِلين — عبر get_conversation_partners_info بدل الـ embed
  // المباشر على users (كان بيرجع فاضي لو المُرسِل أعلى منا فى الهيكل الوظيفي)
  const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
  let sendersById = new Map<string, { name: string; avatar_url: string | null }>();
  if (senderIds.length > 0) {
    const { data: senders } = await supabase.rpc('get_conversation_partners_info', { p_user_ids: senderIds });
    sendersById = new Map((senders || []).map((u: any) => [u.id, { name: u.name, avatar_url: u.avatar_url }]));
  }

  // جلب الرسائل المقتبَسة (ردود) دفعة واحدة
  const replyIds = Array.from(new Set(rows.map((r) => r.reply_to_message_id).filter(Boolean)));
  let repliesById = new Map<string, any>();
  if (replyIds.length > 0) {
    const { data: replies } = await supabase.from('messages').select('id, content, sender_id').in('id', replyIds);
    repliesById = new Map((replies || []).map((r: any) => [r.id, r]));
  }

  // حالة التسليم/القراءة لكل رسالة (لعرض تم الإرسال/الاستلام/القراءة)
  const messageIds = rows.map((r) => r.id);
  let readsByMessage = new Map<string, { delivered_at: string | null; read_at: string | null }[]>();
  if (messageIds.length > 0) {
    const { data: reads } = await supabase
      .from('message_reads')
      .select('message_id, delivered_at, read_at')
      .in('message_id', messageIds);
    for (const r of (reads as any[]) || []) {
      const list = readsByMessage.get(r.message_id) || [];
      list.push({ delivered_at: r.delivered_at, read_at: r.read_at });
      readsByMessage.set(r.message_id, list);
    }
  }

  const messages: MessageWithMeta[] = rows
    .map((row) => {
      const reads = readsByMessage.get(row.id) || [];
      const deliveryStatus = reads.some((r) => r.read_at)
        ? 'read'
        : reads.some((r) => r.delivered_at)
          ? 'delivered'
          : 'sent';
      const sender = sendersById.get(row.sender_id);
      return {
        ...row,
        sender_name: sender?.name,
        sender_avatar_url: sender?.avatar_url ?? null,
        reply_to: row.reply_to_message_id ? repliesById.get(row.reply_to_message_id) || null : null,
        delivery_status: deliveryStatus as MessageWithMeta['delivery_status'],
      };
    })
    .reverse(); // الأقدم أولاً للعرض

  return messages;
}

export async function sendMessage(
  conversationId: string, content: string, replyToMessageId?: string | null, mentions: string[] = []
): Promise<string> {
  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_content: content,
    p_reply_to_message_id: replyToMessageId ?? null,
    p_mentions: mentions,
  });
  if (error) throw error;
  return data as string;
}

export async function editMessage(messageId: string, newContent: string): Promise<void> {
  const { error } = await supabase.rpc('edit_message', { p_message_id: messageId, p_new_content: newContent });
  if (error) throw error;
}

export async function deleteMessageForSelf(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message_for_self', { p_message_id: messageId });
  if (error) throw error;
}

export async function deleteMessageForEveryone(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: messageId });
  if (error) throw error;
}

export async function togglePinMessage(messageId: string, pin: boolean): Promise<void> {
  const { error } = await supabase.rpc('toggle_pin_message', { p_message_id: messageId, p_pin: pin });
  if (error) throw error;
}

export async function togglePinConversation(conversationId: string, pin: boolean): Promise<void> {
  const { error } = await supabase.rpc('toggle_pin_conversation', { p_conversation_id: conversationId, p_pin: pin });
  if (error) throw error;
}

export async function toggleMuteConversation(conversationId: string, mute: boolean): Promise<void> {
  const { error } = await supabase.rpc('toggle_mute_conversation', { p_conversation_id: conversationId, p_mute: mute });
  if (error) throw error;
}

export async function toggleArchiveConversation(conversationId: string, archive: boolean): Promise<void> {
  const { error } = await supabase.rpc('toggle_archive_conversation', { p_conversation_id: conversationId, p_archive: archive });
  if (error) throw error;
}

/** حذف المحادثة من قائمة المستخدم الحالي فقط — تبقى الرسائل والعضوية لدى الطرف الآخر */
export async function hideConversationForSelf(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_conversation_for_self', { p_conversation_id: conversationId });
  if (error) throw error;
}

export async function forwardMessage(messageId: string, targetConversationId: string): Promise<string> {
  const { data, error } = await supabase.rpc('forward_message', {
    p_message_id: messageId, p_target_conversation_id: targetConversationId,
  });
  if (error) throw error;
  return data as string;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  if (error) throw error;
}

export async function setTypingStatus(conversationId: string, isTyping: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_typing_status', { p_conversation_id: conversationId, p_is_typing: isTyping });
  if (error) throw error;
}

export async function setOnlineStatus(isOnline: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_online_status', { p_is_online: isOnline });
  if (error) throw error;
}

export async function searchMessages(query: string, conversationId?: string): Promise<SearchMessageResult[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase.rpc('search_messages', {
    p_query: query, p_conversation_id: conversationId ?? null,
  });
  if (error) throw error;
  return (data || []) as SearchMessageResult[];
}

export async function getMyUnreadMessagesCount(): Promise<number> {
  const { data, error } = await supabase.rpc('get_my_unread_messages_count');
  if (error) throw error;
  return (data as number) ?? 0;
}
