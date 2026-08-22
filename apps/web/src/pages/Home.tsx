import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';

/**
 * Home — "progressivement complexe" : une seule question visible au départ.
 * Hero « Acrylique » : ciel peint, taches de peinture dérivantes, brume,
 * titre serif Cormorant, suggestions numérotées façon carnet.
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
      <section className="fade-up painted-sky relative overflow-hidden rounded-trip border border-mist px-5 py-10 sm:px-10 sm:py-14">
        {/* Taches de peinture dérivantes */}
        <div
          className="hero-blob absolute -left-16 -top-20 h-64 w-64 bg-summit/30"
          aria-hidden="true"
        />
        <div
          className="hero-blob hero-blob-slow absolute -bottom-24 -right-10 h-72 w-72 bg-copper-deep/20"
          aria-hidden="true"
        />
        <div
          className="hero-blob absolute right-1/4 top-1/3 h-40 w-40 bg-pine/15"
          aria-hidden="true"
          style={{ animationDelay: '-11s' }}
        />
        {/* Brume traversante */}
        <div
          className="pointer-events-none absolute inset-x-0 top-1/3 h-24 overflow-hidden"
          aria-hidden="true"
        >
          <div className="hero-mist absolute inset-0" />
        </div>

        {/* Planche d'identité VIRE — le V gravé, posé comme une plaque imprimée */}
        <img
          src="/vire/vire_marque-v.jpg"
          alt=""
          aria-hidden="true"
          width={176}
          height={176}
          loading="lazy"
          className="glass-gold absolute right-6 top-6 z-10 hidden h-44 w-44 rotate-2 object-cover p-1 md:block"
        />

        <div className="relative z-10 flex flex-col gap-4">
          <h1
            className="fade-up font-display text-5xl font-bold leading-[1.02] tracking-tight text-trail [text-shadow:0_1px_3px_rgba(255,255,255,.5)] sm:text-6xl"
            style={{ animationDelay: '80ms' }}
          >
            {t('home.headline')}
          </h1>
          <p
            className="fade-up label-mono text-copper-deep"
            style={{ animationDelay: '140ms' }}
          >
            {t('app.tagline')}
          </p>
          <p
            className="fade-up max-w-md text-sm leading-relaxed text-ridge"
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
              className="glass w-full resize-none rounded-trip p-4 text-sm text-trail shadow-xl placeholder:text-fog"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(query);
              }}
            />
            <button
              type="submit"
              disabled={!query.trim()}
              className="glow-cta flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 py-3 font-display text-lg font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep hover:text-snow disabled:translate-y-0 disabled:animate-none disabled:cursor-not-allowed disabled:bg-trail/10 disabled:text-trail/40"
            >
              <Sparkles size={18} aria-hidden="true" />
              {t('home.cta')}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>

      <div className="fade-up flex w-full flex-col gap-2" style={{ animationDelay: '340ms' }}>
        <p className="label-mono text-fog">{t('home.examples_title')}</p>
        {examples.map((example, i) => (
          <button
            key={example}
            type="button"
            onClick={() => start(example)}
            className="fade-up glass group flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm text-ridge shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-copper-deep hover:text-trail hover:shadow-md"
            style={{ animationDelay: `${380 + i * 60}ms` }}
          >
            <span
              className="shrink-0 font-mono text-[11px] font-bold tracking-widest text-copper-deep"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span className="flex-1">{example}</span>
            <ArrowRight
              size={14}
              className="shrink-0 text-fog transition-transform duration-200 group-hover:translate-x-1 group-hover:text-copper-deep"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </main>
  );
}
