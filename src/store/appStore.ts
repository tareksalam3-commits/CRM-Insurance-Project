import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // === حالة طي الـ Sidebar (سطح المكتب) ===
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // === حالة فتح/طي أقسام الـ Sidebar (تُحفظ محلياً لكل مستخدم على نفس الجهاز) ===
  expandedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  setSectionExpanded: (key: string, expanded: boolean) => void;

  // === حالة درج التنقل الكامل على الموبايل (يفتحه زر "المزيد" فى Bottom Nav
  //     أو زر القائمة ☰ فى الـ Header — مصدر واحد للحالة لتفادي التكرار) ===
  mobileMenuOpen: boolean;
  openMobileMenu: () => void;
  closeMobileMenu: () => void;
  toggleMobileMenu: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      expandedSections: {},
      toggleSection: (key) =>
        set((state) => ({
          expandedSections: { ...state.expandedSections, [key]: !(state.expandedSections[key] ?? true) },
        })),
      setSectionExpanded: (key, expanded) =>
        set((state) => ({ expandedSections: { ...state.expandedSections, [key]: expanded } })),

      mobileMenuOpen: false,
      openMobileMenu: () => set({ mobileMenuOpen: true }),
      closeMobileMenu: () => set({ mobileMenuOpen: false }),
      toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
    }),
    {
      name: 'crm-nav-preferences',
      // ما يُحفظ فى localStorage: فقط تفضيلات التنقل (لا حالة الدرج المؤقتة)
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        expandedSections: state.expandedSections,
      }),
    }
  )
);
