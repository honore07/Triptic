import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Compass, MapPin, Sparkles } from 'lucide-react';

/**
 * Home — "progressivement complexe" : une seule question visible au départ.
 * Hero sombre (trail) avec halos copper/gold animés — ambiance chill & aventure.
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-2">
      <section className="fade-up relative overflow-hidden rounded-[24px] bg-trail px-5 py-10 sm:px-10 sm:py-14">
        {/* Halos animés en fond */}
        <div
          className="hero-blob absolute -left-16 -top-20 h-64 w-64 rounded-full bg-summit/50"
          aria-hidden="true"
        />
        <div
          className="hero-blob hero-blob-slow absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-gold/40"
          aria-hidden="true"
        />
        <div
          className="hero-blob absolute right-1/4 top-1/3 h-40 w-40 rounded-full bg-sky/30"
          aria-hidden="true"
          style={{ animationDelay: '-11s' }}
        />

        <div className="relative z-10 flex flex-col items-center gap-4 text-center">
          <span className="fade-up flex h-14 w-14 items-center justify-center rounded-2xl bg-gold shadow-lg">
            <Compass size={28} className="text-trail" aria-hidden="true" />
          </span>
          <h1
            className="fade-up font-display text-4xl font-bold tracking-tight text-snow sm:text-5xl"
            style={{ animationDelay: '80ms' }}
          >
            {t('home.headline')}
          </h1>
          <p
            className="fade-up font-mono text-xs uppercase tracking-widest text-gold"
            style={{ animationDelay: '140ms' }}
          >
            {t('app.tagline')}
          </p>
          <p
            className="fade-up max-w-md text-sm leading-relaxed text-sky"
            style={{ animationDelay: '200ms' }}
          >
            {t('app.promise')}
          </p>

          <form
            className="fade-up mt-2 flex w-full flex-col gap-3"
            style={{ animationDelay: '260ms' }}
            onSubmit={(e) => {
              e.preventDefault();
              start(query);
            }}
          >
            <label htmlFor="home-query" className="sr-only">
              {t('home.question')}
            </label>
            <textarea
              id="home-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('home.placeholder')}
              rows={3}
              className="w-full resize-none rounded-trip border border-snow/10 bg-snow p-4 text-sm text-trail shadow-xl placeholder:text-fog"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(query);
              }}
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="glow-cta flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3 font-display font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:animate-none disabled:cursor-not-allowed disabled:bg-snow/20 disabled:text-snow/50"
            >
              <Sparkles size={18} aria-hidden="true" />
              {t('home.cta')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      <div className="fade-up flex w-full flex-col gap-2" style={{ animationDelay: '340ms' }}>
        <p className="text-xs font-medium uppercase tracking-wide text-fog">
          {t('home.examples_title')}
        </p>
        {examples.map((example, i) => (
          <button
            key={example}
            type="button"
            onClick={() => start(example)}
            className="fade-up group flex items-center gap-3 rounded-xl border border-mist bg-snow px-4 py-3 text-left text-sm text-ridge shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-summit hover:text-trail hover:shadow-md"
            style={{ animationDelay: `${380 + i * 60}ms` }}
          >
            <MapPin
              size={15}
              className="shrink-0 text-summit transition-transform duration-200 group-hover:scale-125"
              aria-hidden="true"
            />
            {example}
          </button>
        ))}
      </div>
    </main>
  );
}
