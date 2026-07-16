import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Compass } from 'lucide-react';

/**
 * Home — "progressivement complexe" : une seule question visible au départ.
 */
export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const start = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    navigate('/plan', { state: { initialQuery: trimmed } });
  };

  const examples = [t('home.example_1'), t('home.example_2'), t('home.example_3')];

  return (
    <main className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-summit">
          <Compass size={28} className="text-snow" aria-hidden="true" />
        </span>
        <h1 className="font-display text-4xl font-bold tracking-tight text-trail">TRIPTIC</h1>
        <p className="font-mono text-xs uppercase tracking-widest text-ridge">{t('app.tagline')}</p>
        <p className="max-w-md text-sm text-ridge">{t('app.promise')}</p>
      </div>

      <form
        className="flex w-full flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(query);
        }}
      >
        <label htmlFor="home-query" className="font-display text-lg font-semibold text-trail">
          {t('home.question')}
        </label>
        <textarea
          id="home-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('home.placeholder')}
          rows={3}
          className="w-full resize-none rounded-trip border border-mist bg-snow p-4 text-sm text-trail placeholder:text-fog"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(query);
          }}
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-summit px-6 py-3 font-semibold text-snow transition-colors hover:bg-summit/90 disabled:cursor-not-allowed disabled:bg-fog"
        >
          {t('home.cta')}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>

      <div className="flex w-full flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-fog">
          {t('home.examples_title')}
        </p>
        {examples.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => start(example)}
            className="rounded-xl border border-mist bg-snow px-4 py-2.5 text-left text-sm text-ridge transition-colors hover:border-summit hover:text-trail"
          >
            {example}
          </button>
        ))}
      </div>
    </main>
  );
}
