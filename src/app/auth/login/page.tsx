'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Flip to true once Google completes OAuth verification for
// aivascan.com (currently pending — submitted, 48-hr review queue).
// Until then we hide the Google sign-in button so users don't see
// the "unverified app" warning. Magic-link and email/password are
// the active sign-in paths in the interim.
const GOOGLE_SIGN_IN_ENABLED = false;

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  async function handleGoogleLogin() {
    setGoogleLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback?redirect=' + encodeURIComponent(redirect),
      },
    });
    if (authError) {
      setError(authError.message);
      setGoogleLoading(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  // Magic-link sign-in: emails the user a one-click sign-in URL.
  // This is the primary path for new paying subscribers who paid via
  // Stripe and don't have a password set yet.
  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email above first.');
      return;
    }
    setMagicLoading(true);
    setError('');
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          window.location.origin + '/auth/callback?redirect=' + encodeURIComponent(redirect),
      },
    });
    setMagicLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    setMagicSent(true);
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900 text-center">Sign in</h1>
      <p className="mt-2 text-center text-gray-600 text-sm">
        Access your audit reports and scan history.
      </p>

      {magicSent ? (
        <div className="mt-8 p-5 rounded-lg border border-green-200 bg-green-50 text-center">
          <p className="text-sm font-medium text-green-900">Check your email</p>
          <p className="mt-1 text-xs text-green-700">
            We sent a sign-in link to <strong>{email}</strong>. Click it to sign in.
          </p>
          <button
            type="button"
            onClick={() => setMagicSent(false)}
            className="mt-3 text-xs text-green-700 underline"
          >
            Use a different email
          </button>
        </div>
      ) : (
      <div className="mt-8">
        {/* Google sign-in is hidden until Google completes OAuth
            verification for aivascan.com. Without verification, users
            see an "unverified app" warning that erodes trust. To
            re-enable: remove the GOOGLE_SIGN_IN_ENABLED guard below
            once Google approves the verification submission. The
            handleGoogleLogin handler and googleLoading state are kept
            intact so the swap-back is a one-line change. */}
        {GOOGLE_SIGN_IN_ENABLED && (
          <>
            <button
              onClick={handleGoogleLogin}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <GoogleIcon />
              {googleLoading ? 'Redirecting…' : 'Continue with Google'}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3 bg-white text-gray-500">or</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm"
          >
            {loading ? 'Signing in…' : 'Sign in with password'}
          </button>
        </form>

        {/* Magic-link path — primary for paying subscribers who paid
            via Stripe and never set a password. Reuses the email field
            above, no password needed. */}
        <button
          type="button"
          onClick={handleMagicLink}
          disabled={magicLoading || !email}
          className="mt-3 w-full py-2.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg disabled:opacity-50 transition-colors"
        >
          {magicLoading ? 'Sending…' : 'Email me a sign-in link'}
        </button>
        <p className="mt-2 text-center text-xs text-gray-500">
          No password yet? Use the sign-in link option.
        </p>
      </div>
      )}

      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <a href={`/auth/signup?redirect=${encodeURIComponent(redirect)}`} className="text-blue-600 hover:underline font-medium">
          Sign up free
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="max-w-sm mx-auto px-4 py-16 text-center text-gray-500">Loading…</div>}>
      <LoginForm />
    </Suspense>
  );
}
