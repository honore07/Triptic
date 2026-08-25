import { track } from '../lib/analytics';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

/**
 * Connexion / inscription — planche PL.02 « CONNEXION ».
 * Bandeau photo en tête, puis planche papier : intitulé mono, titre serif,
 * champs étiquetés en mono, plaque d'entrée, filet « ou », reprise Google,
 * et le renvoi vers l'ouverture d'un carnet en bas de page.
 */
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
  const isLogin = mode === 'login';

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const { error: authError } = isLogin
          ? await auth.signInWithPassword({ email, password })
          : await auth.signUp({ email, password });
        if (authError) {
          setError(isLogin ? t('auth.error_invalid') : t('auth.error_signup'));
          return;
        }
        track('auth_signed_in', { mode });
        navigate('/');
      } catch {
        setError(t('auth.error_signup'));
      } finally {
        setBusy(false);
      }
    })();
  };

  const onGoogle = () => {
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const { error: oauthError } = await auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: window.location.origin },
        });
        // Succès : le navigateur part chez Google, ce composant est démonté —
        // on ne relâche `busy` que sur l'échec.
        if (oauthError) {
          setError(t('auth.error_google'));
          setBusy(false);
        }
      } catch {
        setError(t('auth.error_google'));
        setBusy(false);
      }
    })();
  };

  const fieldClass =
    'min-h-12 w-full border border-mist bg-snow px-3 py-2 text-sm text-trail ' +
    'placeholder:text-fog disabled:opacity-60';

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-12 pt-2">
      <section className="fade-up border border-mist bg-snow">
        {/* Gravure d'aube sur la crête — décorative, le titre porte le sens */}
        <img
          src="/vire/vire_bandeau-aube.webp"
          alt=""
          aria-hidden="true"
          className="h-40 w-full border-b border-mist object-cover sm:h-48"
        />

        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-2">
            <p className="label-mono text-fog">{t('auth.eyebrow')}</p>
            <h1 className="font-display text-4xl font-semibold leading-tight text-trail">
              {isLogin ? t('auth.login_headline') : t('auth.signup_headline')}
            </h1>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-email" className="label-mono text-ridge">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                required
                autoComplete="email"
                disabled={busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-password" className="label-mono text-ridge">
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                disabled={busy}
                aria-describedby="auth-password-hint"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
              />
              <span id="auth-password-hint" className="text-xs text-fog">
                {t('auth.password_hint')}
              </span>
            </div>

            {error && (
              <p
                role="alert"
                className="border border-storm bg-storm-tint px-3 py-2 text-sm text-storm-deep"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="cta-plate flex min-h-13 items-center justify-center px-4 py-3"
            >
              {isLogin ? t('auth.submit_login') : t('auth.submit_signup')}
            </button>
          </form>

          {/* Filet « ou » — deux traits d'encre encadrant l'alternative */}
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-mist/40" />
            <span className="label-mono text-fog">{t('auth.or')}</span>
            <span className="h-px flex-1 bg-mist/40" />
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={busy}
            className="cta-plate-ghost flex min-h-13 items-center justify-center px-4 py-3"
          >
            {t('auth.google')}
          </button>
        </div>

        <p className="border-t border-mist px-5 py-4 text-center font-display text-base italic text-ridge sm:px-7">
          {isLogin ? t('auth.no_account_q') : t('auth.has_account_q')}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isLogin ? 'signup' : 'login');
              setError(null);
            }}
            // py-2.5 porte la cible tactile à 44px sans casser le fil du texte
            className="inline-block py-2.5 font-semibold text-copper-deep underline underline-offset-2"
          >
            {isLogin ? t('auth.open_account') : t('auth.resume')}
          </button>
        </p>
      </section>
    </main>
  );
}
