import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Bike, Caravan, Footprints, Lock } from 'lucide-react';
import { PLANS, type Trip, type TripMode } from '@triptic/shared';
import { track } from '../lib/analytics';
import { listTrips } from '../lib/api';
import { Ouverture } from '../components/Ouverture';
import { supabase } from '../lib/supabase';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';

/** Van life en premier plan, puis trek, puis bikepacking (objectif produit). */
const MODES: Array<{ key: TripMode; Icon: typeof Caravan }> = [
  { key: 'roadtrip', Icon: Caravan },
  { key: 'trek', Icon: Footprints },
  { key: 'bikepacking', Icon: Bike },
];

/** Gravure de repli quand un trip n'a pas encore de photo. */
const FALLBACK_THUMB = '/vire/vire_pic-boussole.jpg';

/**
 * Home — planche PL.03 « ACCUEIL ».
 * En-tête de planche, sélecteur de mode, bandeau photo gravé de la question,
 * planche de saisie posée dessus, plaque « tracer trois vires », puis la
 * reprise des carnets précédents et le pied de page géodésique.
 *
 * Tant qu'aucun carnet n'est ouvert, l'ouverture (PL.01) précède cet écran.
 */
export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<TripMode | null>(null);
  const [recent, setRecent] = useState<Trip[]>([]);
  const email = useUserStore((s) => s.email);
  const plan = useUserStore((s) => s.plan);
  const openPaywall = useUserStore((s) => s.openPaywall);
  // Sans auth configurée (dev/démo), aucun carnet ne peut être ouvert : la
  // plaque d'entrée mène alors directement à l'accueil au lieu d'une page de
  // connexion inopérante.
  const [entered, setEntered] = useState(false);
  const allowedModes = PLANS[plan].limits.modes;

  // Reprise des carnets — silencieuse : l'accueil reste utilisable si l'API
  // est injoignable (hors ligne, serveur local éteint).
  useEffect(() => {
    let alive = true;
    void listTrips(plan)
      .then((trips) => {
        if (alive) setRecent(trips.slice(0, 3));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [plan]);

  const start = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Nouvelle demande depuis l'accueil : on repart d'une conversation vierge.
    // Sans ça, l'ancienne génération persistée (localStorage) masque la
    // nouvelle demande et Plan réaffiche les 3 trips précédents.
    const chat = useChatStore.getState();
    chat.reset();
    chat.setMode(mode);
    navigate('/plan', { state: { initialQuery: trimmed } });
  };

  const pickMode = (key: TripMode) => {
    if (!allowedModes.includes(key)) {
      openPaywall();
      return;
    }
    setMode((prev) => {
      const next = prev === key ? null : key;
      if (next) track('mode_selected', { mode: next });
      return next;
    });
  };

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

  const examples = [t('home.example_1'), t('home.example_2'), t('home.example_3')];
  const question = t(`home.question_${mode ?? 'roadtrip'}`);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pb-12 pt-2">
      {/* En-tête de planche — marque à gauche, numéro d'étape à droite */}
      <div className="fade-up flex items-baseline justify-between border-b border-mist pb-2">
        <p className="font-display text-xl font-semibold tracking-[0.2em] text-trail">
          {t('app.name')}
        </p>
        <p className="label-mono text-fog">{t('home.plate')}</p>
      </div>

      {/* Sélecteur de mode — filet encre continu, segment actif à l'accent */}
      <div
        role="group"
        aria-label={t('home.mode_label')}
        className="fade-up flex border border-mist"
        style={{ animationDelay: '60ms' }}
      >
        {MODES.map(({ key, Icon }, i) => {
          const active = mode === key;
          const locked = !allowedModes.includes(key);
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              // Verrouillé : le nom accessible porte le mode ET la raison —
              // un `title` seul évince le texte visible du calcul de nom et
              // le lecteur d'écran n'annonce plus de quel mode il s'agit.
              {...(locked
                ? { 'aria-label': `${t(`mode.${key}`)} — ${t('home.mode_locked')}` }
                : {})}
              onClick={() => pickMode(key)}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                i > 0 ? 'border-l border-mist' : ''
              } ${
                active
                  ? 'bg-summit text-snow'
                  : locked
                    ? 'bg-snow text-fog'
                    : 'bg-snow text-trail hover:bg-sky'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {t(`mode.${key}`)}
              {locked && <Lock size={11} aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <form
        className="fade-up flex flex-col gap-4"
        style={{ animationDelay: '120ms' }}
        onSubmit={(e) => {
          e.preventDefault();
          start(query);
        }}
      >
        {/* Bandeau photo — la question est gravée dessus */}
        <section className="relative">
          <img
            src="/vire/vire_crete-sauvage.jpg"
            alt=""
            aria-hidden="true"
            className="h-44 w-full border border-mist object-cover sm:h-56"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-trail/80 via-trail/30 to-trail/10"
          />
          <h1 className="absolute inset-x-4 bottom-4 font-display text-3xl font-semibold leading-tight text-cloud sm:text-4xl">
            {question}
          </h1>
        </section>

        {/* Planche de saisie posée à cheval sur le bandeau */}
        <div className="glass-gold relative z-10 -mt-10 mx-3 flex flex-col gap-3 p-4">
          <label htmlFor="home-query" className="sr-only">
            {t('home.question')}
          </label>
          <textarea
            id="home-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.placeholder')}
            rows={3}
            className="w-full resize-none bg-transparent font-display text-lg italic leading-snug text-trail placeholder:text-fog focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) start(query);
            }}
          />
          <div className="flex items-end justify-between gap-3">
            {/* Ajouts rapides — complètent la demande en un tap (aucune
             * détection automatique : ce sont des raccourcis de saisie). */}
            <div
              role="group"
              aria-label={t('home.quick_add')}
              className="flex flex-wrap gap-1.5"
            >
              {[1, 2, 3].map((n) => {
                const chip = t(`home.chip_${n}`);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      setQuery((prev) => (prev.trim() ? `${prev.trim()}, ${chip}` : chip))
                    }
                    className="min-h-8 border border-mist bg-cloud px-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ridge transition-colors hover:bg-sky"
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={!query.trim()}
              aria-label={t('home.send')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mist bg-summit text-cloud transition-colors hover:bg-copper-deep disabled:bg-terrain disabled:text-fog"
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!query.trim()}
          className="cta-plate flex min-h-13 items-center justify-center px-6 py-4"
        >
          {t('home.cta')}
        </button>
      </form>

      {/* Reprendre — carnets déjà tracés ; à défaut, de quoi s'inspirer */}
      <section className="fade-up flex flex-col gap-2" style={{ animationDelay: '200ms' }}>
        <p className="label-mono text-fog">
          {recent.length > 0 ? t('home.resume') : t('home.examples_title')}
        </p>

        {recent.length > 0
          ? recent.map((trip) => (
              <Link
                key={trip.id}
                to={`/trips/${trip.id}`}
                className="group flex items-center gap-3 border border-mist bg-snow p-2 transition-colors hover:bg-sky"
              >
                <img
                  src={trip.cover_photo ?? FALLBACK_THUMB}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-11 w-16 shrink-0 border border-mist object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="label-mono text-fog">
                    {t(`mode.${trip.mode as TripMode}`)} ·{' '}
                    {t('home.days', { count: trip.metadata.duration_days })}
                  </span>
                  <span className="truncate font-display text-lg font-semibold text-trail">
                    {trip.title}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-ridge">
                  {Math.round(trip.metadata.distance_km)} km
                </span>
              </Link>
            ))
          : examples.map((example, i) => (
              <button
                key={example}
                type="button"
                onClick={() => start(example)}
                className="flex items-center gap-3 border border-mist bg-snow px-3 py-3 text-left transition-colors hover:bg-sky"
              >
                <span
                  className="shrink-0 font-mono text-[11px] font-bold tracking-widest text-copper-deep"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-sm text-ridge">{example}</span>
              </button>
            ))}
      </section>

      {/* Pied de planche — région pilote et son relevé */}
      <div className="flex items-center justify-between border-t border-mist pt-2">
        <p className="label-mono text-fog">{t('home.region')}</p>
        <p className="font-mono text-[10px] tracking-[0.14em] text-fog">{t('home.coords')}</p>
      </div>
    </main>
  );
}
