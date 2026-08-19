import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

/** Connexion / inscription Supabase (email + mot de passe). */
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!supabase) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-ridge">{t('auth.unavailable')}</p>
      </main>
    );
  }
  const auth = supabase.auth;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const { error: authError } =
          mode === 'login'
            ? await auth.signInWithPassword({ email, password })
            : await auth.signUp({ email, password });
        if (authError) {
          setError(mode === 'login' ? t('auth.error_invalid') : t('auth.error_signup'));
          return;
        }
        navigate('/');
      } catch {
        setError(t('auth.error_signup'));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="glass-gold fade-up rounded-trip p-6">
      <h1 className="font-display text-3xl font-bold text-trail">
        {mode === 'login' ? t('auth.login_title') : t('auth.signup_title')}
      </h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ridge">
          {t('auth.email')}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-h-11 rounded-badge border border-mist bg-snow px-3 py-2 font-normal text-trail"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ridge">
          {t('auth.password')}
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-11 rounded-badge border border-mist bg-snow px-3 py-2 font-normal text-trail"
          />
          <span className="text-xs font-normal text-fog">{t('auth.password_hint')}</span>
        </label>
        {error && (
          <p role="alert" className="rounded-badge bg-storm/10 px-3 py-2 text-sm text-storm">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-2xl bg-gold px-4 py-2 font-display text-base font-bold text-trail shadow-[0_8px_26px_rgba(200,146,42,.35)] transition hover:bg-gold-deep hover:text-snow disabled:opacity-60"
        >
          {mode === 'login' ? t('auth.submit_login') : t('auth.submit_signup')}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'login' ? 'signup' : 'login');
          setError(null);
        }}
        className="mt-4 min-h-11 text-sm text-copper-deep underline underline-offset-2"
      >
        {mode === 'login' ? t('auth.switch_to_signup') : t('auth.switch_to_login')}
      </button>
      </div>
    </main>
  );
}
