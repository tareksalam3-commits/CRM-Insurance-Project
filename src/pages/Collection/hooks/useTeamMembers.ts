import { useEffect, useState } from 'react';
import type { User, UserRole } from '../../../lib/supabase';
import { fetchTeamForCurrentUser } from '../services/collectionService';

// فريق المستخدم الحالي (هو نفسه + كل من تحته في الهيكل الإداري فقط) —
// يُستخدم لملء فلتر "الفريق" بأسماء حقيقية مقيّدة بصلاحياته، بدل قائمة
// درجات وظيفية ثابتة تشمل كل مستخدمي النظام
export function useTeamMembers(user: User | null | undefined) {
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string; role: UserRole }[]>([]);

  useEffect(() => {
    if (!user) return;
    const loadTeamMembers = async () => {
      try {
        setTeamMembers(await fetchTeamForCurrentUser(user));
      } catch (error) {
        console.error('Error loading team members:', error);
      }
    };
    loadTeamMembers();
  }, [user]);

  return teamMembers;
}
