import { track } from '../lib/analytics';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authErrorKey, type AuthErrorKey } from '../lib/authErrors';
import { linkErrorInUrl } from '../lib/authLinks';
import { isGoogleEnabled } from '../lib/authProviders';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../store/userStore';

type Mode = 'login' | 'signup' | 'forgot';
type Notice = 'check_email' | 'reset_sent' | 'password_updated';
type ErrorKey = AuthErrorKey | 'error_link' | 'error_google';

/**
 * Connexion / inscription — planche PL.02 « CONNEXION ».
 * Bandeau photo en tête, puis planche papier : intitulé mono, titre serif,
 * champs étiquetés en mono, plaque d'entrée, filet « ou », reprise Google,
 * et le renvoi vers l'ouverture d'un carnet en bas de page. La même planche
 * sert à retrouver un mot de passe oublié et à en choisir un nouveau quand on
 * arrive par le lien reçu par email.
 */
export function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const sessionEmail = useUserStore((s) => s.email);
  const recovery = useUserStore((s) => s.recovery);
  const authReady = useUserStore((s) => s.authReady);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorKey | null>(() =>
    linkErrorInUrl() ? 'error_link' : null,
  );
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  // Posé avant de lever le drapeau de réinitialisation : sans lui, la
  // redirection ci-dessous emporterait le message de confirmation.
  const passwordJustUpdated = useRef(false);

  useEffect(() => {
    // L'erreur est lue ; on retire le jeton d'erreur de l'URL pour qu'un
    // rechargement ne la réaffiche pas.
    if (linkErrorInUrl()) window.history.replaceState(null, '', window.location.pathname);
    let active = true;
    void isGoogleEnabled().then((enabled) => {
      if (active) setGoogleEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, []);

  // Carnet déjà ouvert (retour de Google, lien de confirmation) : rien à faire
  // ici — sauf pendant le choix d'un nouveau mot de passe.
  useEffect(() => {
    if (sessionEmail && !recovery && !passwordJustUpdated.current) {
      navigate('/', { replace: true });
    }
  }, [sessionEmail, recovery, navigate]);

  if (!supabase) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 text-center">
        <p className="text-ridge">{t('auth.unavailable')}</p>
      </main>
    );
  }
  const auth = supabase.auth;
  const inForgot = !recovery && mode === 'forgot';
  const isSignup = !recovery && mode === 'signup';
  const isLogin = !recovery && mode === 'login';
  // Le lien est encore en cours de vérification par supabase-js.
  const waitingForLink = recovery && !authReady;

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const run = (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void (async () => {
      try {
        await action();
      } catch {
        setError('error_generic');
      } finally {
        setBusy(false);
      }
    })();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    // Les liens d'email (confirmation, réinitialisation) reviennent ici.
    const redirectTo = `${window.location.origin}/login`;
    run(async () => {
      if (recovery) {
        const { error: updateError } = await auth.updateUser({ password });
        if (updateError) {
          setError(authErrorKey(updateError));
          return;
        }
        // Le compte ne change pas, seul son mot de passe : trips et carnet
        // restent liés. Un appareil resté connecté avec l'ancien mot de passe
        // doit, lui, repasser par le nouveau.
        await auth.signOut({ scope: 'others' }).catch(() => undefined);
        passwordJustUpdated.current = true;
        setNotice('password_updated');
        useUserStore.getState().setRecovery(false);
        return;
      }
      if (inForgot) {
        const { error: resetError } = await auth.resetPasswordForEmail(email, { redirectTo });
        if (resetError) {
          setError(authErrorKey(resetError));
          return;
        }
        setNotice('reset_sent');
        return;
      }
      if (isSignup) {
        const { data, error: signUpError } = await auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (signUpError) {
          setError(authErrorKey(signUpError));
          return;
        }
        // Confirmation d'email active : pas de session tant que le lien n'est pas ouvert.
        if (!data.session) {
          setNotice('check_email');
          return;
        }
        track('auth_signed_in', { mode });
        navigate('/');
        return;
      }
      const { error: signInError } = await auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(authErrorKey(signInError));
        return;
      }
      track('auth_signed_in', { mode });
      navigate('/');
    });
  };

  // Renoncer : la session ouverte par le lien se ferme sur cet appareil. Le
  // drapeau tombe avec l'événement SIGNED_OUT, jamais avant — une session
  // restée ouverte sans nouveau mot de passe est précisément ce qu'on évite.
  const onCancelRecovery = () => {
    setBusy(true);
    void auth
      .signOut({ scope: 'local' })
      .catch(() => undefined)
      .finally(() => setBusy(false));
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
          setError('error_google');
          setBusy(false);
        }
      } catch {
        setError('error_google');
        setBusy(false);
      }
    })();
  };

  const headline =
    notice === 'password_updated'
      ? t('auth.password_updated_headline')
      : recovery
        ? t('auth.recovery_headline')
        : inForgot
          ? t('auth.forgot_headline')
          : isSignup
            ? t('auth.signup_headline')
            : t('auth.login_headline');
  const submitLabel = recovery
    ? t('auth.submit_recovery')
    : inForgot
      ? t('auth.submit_forgot')
      : isSignup
        ? t('auth.submit_signup')
        : t('auth.submit_login');
  const showSwitch = !recovery && !inForgot;
  const noticeText =
    notice === 'check_email'
      ? t('auth.check_email', { email })
      : notice === 'reset_sent'
        ? t('auth.reset_sent')
        : t('auth.password_updated');

  const fieldClass =
    'min-h-12 w-full border border-mist bg-snow px-3 py-2 text-sm text-trail ' +
    'placeholder:text-fog disabled:opacity-60';
  // min-h-11 : cible tactile de 44 px, même pour un lien en petit corps
  const linkClass =
    'inline-flex min-h-11 items-center font-semibold text-copper-deep underline underline-offset-2';

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-12 pt-2">
      <section className="ink-reveal border border-mist bg-snow">
        {/* Gravure d'aube sur la crête — décorative, le titre porte le sens.
         * Elle recule d'un pas à l'ouverture, comme la cime de l'entrée. */}
        <span className="block h-40 w-full overflow-hidden border-b border-mist sm:h-48">
          <img
            src="/vire/vire_bandeau-aube.webp"
            alt=""
            aria-hidden="true"
            className="settle-back h-full w-full object-cover"
          />
        </span>

        <div className="flex flex-col gap-5 px-5 py-6 sm:px-7">
          <div className="flex flex-col gap-2">
            <p className="label-mono text-fog">{t('auth.eyebrow')}</p>
            <h1 className="font-display text-4xl font-semibold leading-tight text-trail">
              {headline}
            </h1>
            {inForgot && <p className="text-sm text-ridge">{t('auth.forgot_intro')}</p>}
            {recovery && !notice && (
              <p className="text-sm text-ridge">{t('auth.recovery_intro')}</p>
            )}
          </div>

          {notice ? (
            <div className="flex flex-col gap-4">
              <p
                role="status"
                className="border border-pine bg-pine-tint px-3 py-2 text-sm text-pine-deep"
              >
                {noticeText}
              </p>
              {notice === 'password_updated' ? (
                <button
                  type="button"
                  onClick={() => navigate('/', { replace: true })}
                  className="cta-plate flex min-h-13 items-center justify-center px-4 py-3"
                >
                  {t('auth.continue_to_account')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`self-start ${linkClass}`}
                >
                  {t('auth.back_to_login')}
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {!recovery && (
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
              )}

              {!inForgot && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="auth-password" className="label-mono text-ridge">
                    {recovery ? t('auth.new_password') : t('auth.password')}
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    disabled={busy || waitingForLink}
                    aria-describedby="auth-password-hint"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={fieldClass}
                  />
                  <span id="auth-password-hint" className="text-xs text-fog">
                    {t('auth.password_hint')}
                  </span>
                </div>
              )}

              {isLogin && (
                <button
                  type="button"
                  onClick={() => switchMode('forgot')}
                  className={`-mt-2 self-end text-sm ${linkClass}`}
                >
                  {t('auth.forgot_link')}
                </button>
              )}

              {error && (
                <p
                  role="alert"
                  className="border border-storm bg-storm-tint px-3 py-2 text-sm text-storm-deep"
                >
                  {t(`auth.${error}`)}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || waitingForLink}
                className="cta-plate flex min-h-13 items-center justify-center px-4 py-3"
              >
                {submitLabel}
              </button>

              {inForgot && (
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`self-center ${linkClass}`}
                >
                  {t('auth.back_to_login')}
                </button>
              )}

              {recovery && (
                <button
                  type="button"
                  onClick={onCancelRecovery}
                  disabled={busy}
                  className={`self-center text-sm ${linkClass}`}
                >
                  {t('auth.recovery_cancel')}
                </button>
              )}
            </form>
          )}

          {googleEnabled && showSwitch && !notice && (
            <>
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
            </>
          )}
        </div>

        {showSwitch && !notice && (
          <p className="border-t border-mist px-5 py-4 text-center font-display text-base italic text-ridge sm:px-7">
            {isLogin ? t('auth.no_account_q') : t('auth.has_account_q')}{' '}
            <button
              type="button"
              onClick={() => switchMode(isLogin ? 'signup' : 'login')}
              // py-2.5 porte la cible tactile à 44px sans casser le fil du texte
              className="inline-block py-2.5 font-semibold text-copper-deep underline underline-offset-2"
            >
              {isLogin ? t('auth.open_account') : t('auth.resume')}
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
