import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Ouverture } from '../components/Ouverture';
import { supabase } from '../lib/supabase';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';

/**
 * Home — "progressivement complexe" : une seule question visible au départ.
 * Hero « VIRE » (maquette Accueil) : bandeau photo de crête gravé d'un filet
 * encre, planche du V posée dessus, titre serif Cormorant, CTA plaque,
 * suggestions numérotées façon carnet.
 */
export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const email = useUserStore((s) => s.email);
  // Sans auth configurée (dev/démo), aucun carnet ne peut être ouvert : la
  // plaque d'entrée mène alors directement à l'accueil au lieu d'une page de
  // connexion inopérante.
  const [entered, setEntered] = useState(false);

  const start = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Nouvelle demande depuis l'accueil : on repart d'une conversation vierge.
    // Sans ça, l'ancienne génération persistée (localStorage) masque la
    // nouvelle demande et Plan réaffiche les 3 trips précédents.
    useChatStore.getState().reset();
    navigate('/plan', { state: { initialQuery: trimmed } });
  };

  const examples = [t('home.example_1'), t('home.example_2'), t('home.example_3')];

  // Tant qu'aucun carnet n'est ouvert : ouverture (PL.01) puis connexion
  // (PL.02). Un utilisateur connecté ne voit jamais cet écran.
  if (email === null && !entered) {
    return (
      <Ouverture
        onStart={() => {
          if (supabase) navigate('/login');
          else setEntered(true);
        }}
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-2">
      <section className="fade-up relative overflow-hidden rounded-trip border border-mist bg-snow">
        {/* Bandeau photo de crête (maquette Accueil) — filet encre en dessous */}
        <img
          src="/vire/vire_crete-sauvage.jpg"
          alt=""
          aria-hidden="true"
          className="h-40 w-full border-b border-mist object-cover sm:h-52"
        />

        {/* Planche d'identité VIRE — le V gravé, posé à cheval sur le bandeau */}
        <img
          src="/vire/vire_marque-v.jpg"
          alt=""
          aria-hidden="true"
          width={176}
          height={176}
          loading="lazy"
          className="glass-gold absolute right-6 top-6 z-10 hidden h-40 w-40 rotate-2 object-cover p-1 md:block"
        />

        <div className="relative z-10 flex flex-col gap-4 px-5 py-8 sm:px-10 sm:py-10">
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
              className="cta-plate flex min-h-13 items-center justify-center gap-2 px-6 py-4 disabled:translate-y-0 disabled:animate-none disabled:cursor-not-allowed disabled:bg-trail/10 disabled:text-trail/40"
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
