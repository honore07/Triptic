import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';

/** Vérification d'une nouvelle version : toutes les heures, pour les onglets qui restent ouverts. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * MiseAJour — le bandeau « nouvelle version ».
 * Une nouvelle version de l'app n'est plus appliquée en silence : un
 * rechargement automatique au milieu d'une génération de dix minutes en
 * perdait le fil. Le service worker attend, le bandeau le dit, et c'est
 * l'utilisateur qui recharge — maintenant ou plus tard.
 */
export function MiseAJour() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Les onglets qui vivent longtemps ne verraient jamais de nouvelle
      // version sans cette vérification périodique.
      setInterval(() => void registration.update(), CHECK_EVERY_MS);
    },
  });

  // Le bandeau est annoncé aux lecteurs d'écran au moment où il apparaît
  useEffect(() => {
    if (needRefresh) document.getElementById('maj-title')?.focus();
  }, [needRefresh]);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="ink-reveal flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-b border-mist bg-trail px-4 py-2 text-cloud"
    >
      <p id="maj-title" tabIndex={-1} className="font-display text-base italic outline-none">
        {t('app.update_ready')}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="cta-plate flex min-h-10 items-center px-4 py-2"
        >
          {t('app.update_reload')}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="label-mono min-h-10 px-2 text-cloud/80 hover:text-cloud"
        >
          {t('app.update_later')}
        </button>
      </div>
    </div>
  );
}
