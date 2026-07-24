import type { User, UserRole } from '../../lib/supabase';

export interface AssistantAnswer {
  title: string;
  lines: string[];
}

export interface AgentRow {
  id: string;
  name: string;
  role: UserRole;
  achieved: number;
  target: number;
}

export interface QuickCommand {
  id: string;
  label: string;
  run: (user: User) => Promise<AssistantAnswer>;
}

export interface QueryPattern {
  id: string;
  // عبارات مفتاحية كاملة (تُستخدم في المطابقة المباشرة عبر substring)
  keywords: string[];
  // أمثلة توضيحية تُعرض للمستخدم عند الاقتراح ("هل تقصد؟")
  examples: string[];
  run: (user: User) => Promise<AssistantAnswer>;
}
