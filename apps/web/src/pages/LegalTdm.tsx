import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';

/**
 * /legal/tdm — notice publique de fouille de textes et de données (TDM),
 * accessible sans auth. Résumé public de docs/legal/LIA-tdm.md :
 * quoi / pourquoi / base légale (art. L.122-5-3 CPI, directive (UE) 2019/790) /
 * opt-out respecté (registre tdm_sources) / contact d'opposition.
 * Les corps de texte restent en français (la version française fait foi) —
 * titres et navigation traduits (fr/en/de).
 */

const CONTACT_EMAIL = 'jules.million07@gmail.com';

const SECTIONS = ['what', 'why', 'legal', 'optout', 'rights'] as const;

export function LegalTdm() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-4">
      <header className="fade-up flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-trail">
          {t('legal.tdm_title')}
        </h1>
        <p className="text-sm leading-relaxed text-ridge">{t('legal.tdm_intro')}</p>
        <p className="self-start rounded-badge bg-terrain px-3 py-1.5 text-xs font-medium text-ridge">
          {t('legal.french_prevails')}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {SECTIONS.map((id, i) => (
          <section
            key={id}
            className="fade-up border border-mist bg-snow p-4"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <h2 className="font-display text-base font-bold text-trail">
              {t(`legal.tdm_${id}_title`)}
            </h2>
            {/* Corps juridique en français quelle que soit la langue de l'UI */}
            <p lang="fr" className="mt-2 text-sm leading-relaxed text-ridge">
              {t(`legal.tdm_${id}_body`)}
            </p>
          </section>
        ))}
      </div>

      <p className="flex flex-wrap items-center gap-2 text-sm text-ridge">
        <Mail size={15} className="shrink-0 text-summit" aria-hidden="true" />
        <span>{t('legal.tdm_contact_label')}</span>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex min-h-11 items-center font-medium text-copper-deep underline underline-offset-2 hover:text-trail"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </main>
  );
}
