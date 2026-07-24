import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import * as teamRoomService from './teamRoomService';
import type { TeamRoomMessageWithMeta } from './types';

// ============================================================================
// نفس نمط الاشتراك اللحظي المستخدم فى نظام الرسائل الفردية (postgres_changes)،
// مطبَّق على team_room_messages. البث اللحظي هنا محمي بنفس سياسة RLS الخاصة
// بالقراءة، فلا يصل أي حدث INSERT/UPDATE لمستخدم غير مصرح له برؤية الرسالة —
// الأمان مطبَّق على مستوى قاعدة البيانات، وليس فقط عبر ما تعرضه الواجهة.
// ============================================================================

export function useTeamRoomMessages() {
  const [messages, setMessages] = useState<TeamRoomMessageWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const reloadLatest = useCallback(async () => {
    const data = await teamRoomService.fetchTeamRoomMessages();
    setMessages(data);
    setHasMore(data.length >= 50);
  }, []);

  useEffect(() => {
    setLoading(true);
    reloadLatest().finally(() => setLoading(false));
  }, [reloadLatest]);

  useEffect(() => {
    const ch = supabase
      .channel('team-room-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_room_messages' }, () => {
        reloadLatest();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reloadLatest]);

  const loadOlder = useCallback(async () => {
    if (messages.length === 0) return;
    const oldest = messages[0];
    const older = await teamRoomService.fetchTeamRoomMessages(oldest.created_at);
    setHasMore(older.length >= 50);
    setMessages((prev) => [...older, ...prev]);
  }, [messages]);

  return { messages, loading, hasMore, loadOlder, reload: reloadLatest };
}
