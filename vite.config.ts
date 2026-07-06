import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    // تقسيم الحزم الكبيرة إلى ملفات منفصلة تُحمَّل بالتوازي ويستفيد المتصفح
    // من الكاش الخاص بها بشكل مستقل (بدون تغيير أي وظيفة في التطبيق)
    target: 'es2018',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js', '@simplewebauthn/browser'],
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-charts': ['recharts'],
          'vendor-table': ['@tanstack/react-table', '@tanstack/react-query'],
          'vendor-utils': ['clsx', 'date-fns', 'zustand', 'lucide-react'],
        },
      },
    },
  },
});
