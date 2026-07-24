import { useEffect, useState } from 'react';
import type { User, UserRole } from '../../../lib/supabase';
import { fetchTeamForCurrentUser } from '../services/collectionService';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';

// فريق المستخدم الحالي (هو نفسه + كل من تحته في الهيكل الإداري فقط، فى نطاق
// الفرع الحالي المختار لو موجود) — يُستخدم لملء فلتر "الفريق" بأسماء حقيقية
// مقيّدة بصلاحياته، بدل قائمة درجات وظيفية ثابتة تشمل كل مستخدمي النظام
export function useTeamMembers(user: User | null | undefined, branchId: string | null = null) {
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: UserRole }[]>([]);

  const loadTeamMembers = async () => {
    if (!user) return;
    try {
      setTeamMembers(await fetchTeamForCurrentUser(user, branchId));
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  useEffect(() => {
    loadTeamMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, branchId]);

  useReconnectRefetch(loadTeamMembers);

  return teamMembers;
}
