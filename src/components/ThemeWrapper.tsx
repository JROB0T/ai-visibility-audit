'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ThemeProvider, ThemeToggle } from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/client';
import { LogOut } from 'lucide-react';
import Logo from '@/components/brand/Logo';

export function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Public share routes (/r/{token}) intentionally render without the app
  // nav/footer chrome — recipients are not the audience for sign-in CTAs.
  const isPublicShare = pathname?.startsWith('/r/') ?? false;

  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    // Check initial auth state
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserEmail(user.email || 'User');
    }
    checkAuth();

    // Listen for auth state changes (login, signup, logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserEmail(session.user.email || 'User');
      } else {
        setUserEmail(null);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUserEmail(null);
    window.location.href = '/';
  }

  if (isPublicShare) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  return (
    <ThemeProvider>
      <nav className="sticky top-0 z-50 border-b glass" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Aivascan</span>
          </a>
          <div className="flex items-center gap-2">
            {userEmail ? (
              <>
                <a href="/dashboard" className="text-sm px-3 py-1.5 rounded-lg transition-colors font-medium" style={{ color: '#6366F1' }}>Dashboard</a>
                <span className="text-xs px-2 py-1 rounded-md hidden sm:inline" style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)' }}>{userEmail}</span>
                <button
                  onClick={handleSignOut}
                  className="text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                  aria-label="Log out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Log out</span>
                </button>
              </>
            ) : (
              <>
                <a href="/auth/login" className="text-sm px-3 py-1.5 rounded-lg transition-colors font-medium" style={{ color: 'var(--text-secondary)' }}>Sign In</a>
                <a href="/auth/signup" className="text-sm font-medium px-3.5 py-1.5 rounded-lg transition-colors text-white" style={{ background: '#6366F1' }}>Get Started</a>
              </>
            )}
            <span aria-hidden className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
            <ThemeToggle />
          </div>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-8 mt-auto" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo size={20} />
              <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Aivascan · © {new Date().getFullYear()}</span>
            </div>
            <nav className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <a href="/pricing" className="hover:underline">Pricing</a>
              <a href="/terms" className="hover:underline">Terms</a>
              <a href="/privacy" className="hover:underline">Privacy</a>
              <a href="/contact" className="hover:underline">Contact</a>
            </nav>
          </div>
          {/* Independence / non-affiliation disclosure. */}
          <p className="mt-6 text-xs leading-relaxed text-center sm:text-left" style={{ color: 'var(--text-tertiary)' }}>
            Aivascan is an independent service and is not affiliated with, sponsored
            by, or endorsed by any of the AI providers it queries or the
            websites and brands it audits. All product names and trademarks are
            the property of their respective owners.
          </p>
        </div>
      </footer>
    </ThemeProvider>
  );
}
