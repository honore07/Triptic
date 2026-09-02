import { track } from '../lib/analytics';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { useUserStore } from '../store/userStore';

/**
 * PaywallModal — bénéfice d'abord, prix ensuite, CTA plein, "plus tard" discret.
 * NOTE MVP : la sélection de plan est locale (Stripe Checkout en Phase 3).
 */
export function PaywallModal() {
  const { t } = useTranslation();
  const { paywallOpen, closePaywall, setPlan } = useUserStore();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!paywallOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePaywall();
        return;
      }
      // Focus trap : Tab / Shift+Tab bouclent sur les focusables du dialog
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute('disabled'));
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!first || !last) return;
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !dialog.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector('button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [paywallOpen, closePaywall]);

  if (!paywallOpen) return null;

  // feature_offline volontairement absent : les cartes offline ne sont pas
  // encore implémentées — on ne vend pas ce qui n'existe pas.
  const features = [
    t('paywall.feature_trips'),
    t('paywall.feature_unlimited'),
    t('paywall.feature_gpx'),
    t('paywall.feature_weather'),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-trail/70 p-4 sm:items-center"
      onClick={closePaywall}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        className="ink-reveal w-full max-w-md border border-mist bg-snow p-6 shadow-[8px_8px_0_rgba(17,17,17,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* La corde — l'objet d'expédition qui ouvre les vires suivantes */}
            <img
              src="/vire/vire_pic-corde.jpg"
              alt=""
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-full border border-mist object-cover"
            />
            <h2 id="paywall-title" className="font-display text-2xl font-semibold leading-tight text-trail">
              {t('paywall.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={closePaywall}
            aria-label={t('paywall.later')}
            className="-mr-2 -mt-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-ridge hover:border-mist hover:bg-sky"
          >
            <X size={20} />
          </button>
        </div>
        <p className="mt-2 font-display text-base italic leading-snug text-ridge">{t('paywall.subtitle')}</p>

        <ul className="mt-4 flex flex-col border-y border-mist">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2 border-b border-mist py-2 text-sm text-trail last:border-b-0">
              <Check size={16} className="mt-0.5 shrink-0 text-summit" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => { track('plan_upgraded', { plan: 'aventurier' }); setPlan('aventurier'); }}
            className="cta-plate min-h-12 w-full px-4 py-4"
          >
            {t('paywall.cta')} — {t('paywall.price_aventurier')}
          </button>
          <button
            type="button"
            onClick={() => { track('plan_upgraded', { plan: 'explorateur' }); setPlan('explorateur'); }}
            className="cta-plate-ghost min-h-11 w-full px-4 py-3"
            title={t('paywall.explorateur_extra')}
          >
            {t('paywall.plan_explorateur')} — {t('paywall.price_explorateur')}
          </button>
          <button
            type="button"
            onClick={closePaywall}
            className="label-mono mt-1 min-h-11 text-fog hover:text-ridge"
          >
            {t('paywall.later')}
          </button>
        </div>
      </div>
    </div>
  );
}
