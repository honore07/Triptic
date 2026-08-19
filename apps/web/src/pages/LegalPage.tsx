import { useTranslation } from 'react-i18next';

type LegalSection = 'mentions' | 'privacy' | 'terms';

/** Sous-clés (title exclu) de chaque section légale — ordre d'affichage. */
const BLOCKS: Record<LegalSection, string[]> = {
  mentions: ['editor', 'hosting', 'contact'],
  privacy: ['data', 'purpose', 'processors', 'rights', 'cookies', 'retention'],
  terms: ['service', 'account', 'content', 'liability', 'changes'],
};

/**
 * Page légale générique — mentions légales, politique de confidentialité ou
 * CGU selon la section. Contenu 100 % i18n (fr/en/de), paragraphes séparés
 * par \n\n dans les locales.
 */
export function LegalPage({ section }: { section: LegalSection }) {
  const { t } = useTranslation();
  const intro = section === 'mentions' ? null : t(`legal.${section}.intro`);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="font-display text-2xl font-bold text-trail">
        {t(`legal.${section}.title`)}
      </h1>
      {intro && <p className="mt-3 text-sm leading-relaxed text-ridge">{intro}</p>}
      {BLOCKS[section].map((block) => (
        <section key={block} className="mt-8">
          <h2 className="font-display text-lg font-semibold text-trail">
            {t(`legal.${section}.${block}_title`)}
          </h2>
          {t(`legal.${section}.${block}_body`)
            .split('\n\n')
            .map((paragraph, i) => (
              <p key={i} className="mt-3 text-sm leading-relaxed text-ridge">
                {paragraph}
              </p>
            ))}
        </section>
      ))}
    </main>
  );
}
