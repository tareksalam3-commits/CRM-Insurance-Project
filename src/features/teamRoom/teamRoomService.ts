import { supabase } from '../../lib/supabase';
import type { TeamRoomMessageWithMeta, TeamRoomParticipantInfo } from './types';

// ============================================================================
// مصدر واحد لكل استدعاءات "غرفة الفريق". القراءة تتم مباشرة على الجدول
// (نفس نمط نظام الرسائل الفردية) لأن RLS تتكفّل بتطبيق نطاق الرؤية بالكامل —
// لا يصل أي صف غير مصرح به من الأساس، حتى على مستوى الاستعلام. الكتابة تمر
// حصراً عبر دوال RPC (SECURITY DEFINER) حتى لا يمكن لأحد تزوير نطاق الرؤية.
// ============================================================================

const TEAM_ROOM_PAGE_SIZE = 50;

export async function fetchTeamRoomMessages(beforeCreatedAt?: string): Promise<TeamRoomMessageWithMeta[]> {
  let query = supabase
    .from('team_room_messages')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(TEAM_ROOM_PAGE_SIZE);

  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as any[];

  // أسماء وأدوار وصور المُرسِلين — فقط لمن أرسل رسالة مسموح لنا برؤيتها أصلاً
  const senderIds = Array.from(new Set(rows.map((r) => r.sender_id)));
  let sendersById = new Map<string, TeamRoomParticipantInfo>();
  if (senderIds.length > 0) {
    const { data: senders, error: sendersError } = await supabase.rpc('get_team_room_participants_info', {
      p_user_ids: senderIds,
    });
    if (sendersError) throw sendersError;
    sendersById = new Map((senders || []).map((u: any) => [u.id, u as TeamRoomParticipantInfo]));
  }

  // الرسائل المقتبَسة (ردود) — قد لا تكون كلها ظاهرة فى نفس الصفحة المحمّلة
  const replyIds = Array.from(new Set(rows.map((r) => r.reply_to_message_id).filter(Boolean)));
  let repliesById = new Map<string, any>();
  if (replyIds.length > 0) {
    const { data: replies } = await supabase.from('team_room_messages').select('id, content, sender_id').in('id', replyIds);
    repliesById = new Map((replies || []).map((r: any) => [r.id, r]));
  }

  const messages: TeamRoomMessageWithMeta[] = rows
    .map((row) => {
      const sender = sendersById.get(row.sender_id);
      return {
        ...row,
        sender_name: sender?.name,
        sender_role: sender?.role,
        sender_avatar_url: sender?.avatar_url ?? null,
        reply_to: row.reply_to_message_id ? repliesById.get(row.reply_to_message_id) || null : null,
      } as TeamRoomMessageWithMeta;
    })
    .reverse(); // الأقدم أولاً للعرض

  return messages;
}

export async function sendTeamRoomMessage(content: string, replyToMessageId?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('send_team_room_message', {
    p_content: content,
    p_reply_to_message_id: replyToMessageId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function editTeamRoomMessage(messageId: string, newContent: string): Promise<void> {
  const { error } = await supabase.rpc('edit_team_room_message', { p_message_id: messageId, p_new_content: newContent });
  if (error) throw error;
}

export async function deleteTeamRoomMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_team_room_message', { p_message_id: messageId });
  if (error) throw error;
}
