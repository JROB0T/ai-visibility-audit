'use client';

import { useEffect, useState } from 'react';
import { ThemeProvider, ThemeToggle } from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || 'User');
    }
    checkAuth();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    window.location.href = '/';
  }

  return (
    <ThemeProvider>
      <nav className="sticky top-0 z-50 border-b glass" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center" style={{ boxShadow: '0 2px 8px -2px rgba(99,102,241,0.4)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>AI Visibility Audit</span>
          </a>
          <div className="flex items-center gap-1.5">
            {userEmail ? (
              <>
                <a href="/dashboard" className="text-sm px-3 py-1.5 rounded-lg transition-colors font-medium" style={{ color: '#6366F1' }}>Dashboard</a>
                <span className="text-xs px-2 py-1 rounded-md hidden sm:inline" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{userEmail}</span>
                <button onClick={handleSignOut} className="text-sm px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <a href="/dashboard" className="text-sm px-3 py-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-secondary)' }}>Dashboard</a>
                <a href="/auth/login" className="text-sm font-medium px-3.5 py-1.5 rounded-lg border transition-colors" style={{ color: '#6366F1', borderColor: 'rgba(99,102,241,0.2)' }}>Sign in</a>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-8 mt-auto" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>AI Visibility Audit</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Helping SaaS companies get found by AI systems</p>
          </div>
        </div>
      </footer>
    </ThemeProvider>
  );
}
