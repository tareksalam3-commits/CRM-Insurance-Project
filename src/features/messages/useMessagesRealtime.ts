import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import * as messagesService from './messagesService';
import type { ConversationListItem, MessageWithMeta, TypingStatusRow } from './types';

// ============================================================================
// كل Hooks الحالة اللحظية لنظام الرسائل، مبنية على نفس نمط الاشتراك المستخدم
// بالفعل فى Header.tsx (supabase.channel + postgres_changes) بدون أي تغيير
// فى ذلك النمط، فقط تطبيقه على جداول الرسائل.
// ============================================================================

/** قائمة المحادثات مع تحديث لحظي عند أي رسالة/محادثة/عضوية جديدة */
export function useConversationsList() {
  const { user } = useAuth();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      const data = await messagesService.fetchMyConversations(user.id);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`conversations:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${user.id}` }, reload)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, reload)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'message_reads', filter: `user_id=eq.${user.id}` }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, reload]);

  return { items, loading, reload };
}

/** رسائل محادثة واحدة مع تحديث لحظي (وصول/تعديل/حذف/تثبيت) + تحميل صفحات أقدم */
export function useConversationMessages(conversationId: string | null) {
  const [messages, setMessages] = useState<MessageWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const reloadLatest = useCallback(async () => {
    if (!conversationId) return;
    const data = await messagesService.fetchMessages(conversationId);
    setMessages(data);
    setHasMore(data.length >= 50);
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    reloadLatest().finally(() => setLoading(false));
  }, [conversationId, reloadLatest]);

  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`messages:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, () => {
        reloadLatest();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads' }, () => {
        reloadLatest();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, reloadLatest]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || messages.length === 0) return;
    const oldest = messages[0];
    const older = await messagesService.fetchMessages(conversationId, oldest.created_at);
    setHasMore(older.length >= 50);
    setMessages((prev) => [...older, ...prev]);
  }, [conversationId, messages]);

  return { messages, loading, hasMore, loadOlder, reload: reloadLatest };
}

/** مؤشر "يكتب الآن" لباقي أعضاء المحادثة (باستثناء المستخدم الحالي) */
export function useTypingIndicator(conversationId: string | null) {
  const { user } = useAuth();
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    const { data } = await supabase
      .from('typing_status')
      .select('user_id, is_typing, updated_at')
      .eq('conversation_id', conversationId)
      .eq('is_typing', true)
      .gt('updated_at', new Date(Date.now() - 6000).toISOString());
    const ids = ((data as TypingStatusRow[]) || []).map((r) => r.user_id).filter((id) => id !== user?.id);
    setTypingUserIds(ids);
  }, [conversationId, user?.id]);

  useEffect(() => {
    refresh();
    if (!conversationId) return;
    const ch = supabase
      .channel(`typing:${conversationId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'typing_status', filter: `conversation_id=eq.${conversationId}` }, refresh)
      .subscribe();
    const interval = setInterval(refresh, 3000);
    return () => { supabase.removeChannel(ch); clearInterval(interval); };
  }, [conversationId, refresh]);

  // إرسال حالة "يكتب الآن" مع تبريد (debounce) بسيط
  const notifyTyping = useCallback(() => {
    if (!conversationId) return;
    messagesService.setTypingStatus(conversationId, true);
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    if (!conversationId) return;
    messagesService.setTypingStatus(conversationId, false);
  }, [conversationId]);

  return { typingUserIds, notifyTyping, stopTyping };
}

/** يرسل نبض "متصل الآن" دوري طالما التطبيق مفتوح، ويُعلن "غير متصل" عند الإغلاق */
export function useOnlinePresenceHeartbeat() {
  const { user } = useAuth();
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;

    messagesService.setOnlineStatus(true);
    intervalRef.current = window.setInterval(() => messagesService.setOnlineStatus(true), 30000);

    const handleVisibility = () => {
      messagesService.setOnlineStatus(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const handleBeforeUnload = () => { messagesService.setOnlineStatus(false); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      messagesService.setOnlineStatus(false);
    };
  }, [user]);
}

/** عدد الرسائل غير المقروءة الإجمالي — لعرضه فى القائمة الجانبية/الشريط السفلي */
export function useUnreadMessagesBadge() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const c = await messagesService.getMyUnreadMessagesCount();
      setCount(c);
    } catch {
      // تجاهل بصمت — الشارة ليست وظيفة حرجة
    }
  }, [user]);

  useEffect(() => {
    refresh();
    if (!user) return;
    const ch = supabase
      .channel(`unread-badge:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reads', filter: `user_id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  return count;
}
