import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUp, Bike, Caravan, Footprints, Lock, Mic, Square } from 'lucide-react';
import { PLANS, type Trip, type TripMode } from '@triptic/shared';
import { track } from '../lib/analytics';
import { listTrips } from '../lib/api';
import { formatDistance } from '../lib/units';
import { useDictation } from '../hooks/useDictation';
import { Ouverture } from '../components/Ouverture';
import { supabase } from '../lib/supabase';
import { useChatStore } from '../store/chatStore';
import { useProfileStore } from '../store/profileStore';
import { useUserStore } from '../store/userStore';

/** Van life en premier plan, puis trek, puis bikepacking (objectif produit). */
const MODES: Array<{ key: TripMode; Icon: typeof Caravan }> = [
  { key: 'roadtrip', Icon: Caravan },
  { key: 'trek', Icon: Footprints },
  { key: 'bikepacking', Icon: Bike },
];

/** Gravure de repli quand un trip n'a pas encore de photo : la marque. */
const FALLBACK_THUMB = '/vire/vire_logo-compas.webp';

/**
 * Home — planche PL.03 « ACCUEIL ».
 * En-tête de planche et sélecteur de mode sur le papier, puis le village
 * alpin en fond plein cadre — comme l'ouverture. La question, le bandeau de
 * saisie et les reprises se posent dessus ; rien ne quitte l'image.
 *
 * Tant qu'aucun carnet n'est ouvert, l'ouverture (PL.01) précède cet écran.
 */
export function Home() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<TripMode | null>(null);
  const [recent, setRecent] = useState<Trip[]>([]);
  const email = useUserStore((s) => s.email);
  const plan = useUserStore((s) => s.plan);
  const openPaywall = useUserStore((s) => s.openPaywall);
  const units = useProfileStore((s) => s.units);
  // Sans auth configurée (dev/démo), aucun carnet ne peut être ouvert : la
  // plaque d'entrée mène alors directement à l'accueil au lieu d'une page de
  // connexion inopérante.
  const [entered, setEntered] = useState(false);
  const allowedModes = PLANS[plan].limits.modes;

  // Dictée : chaque bout de phrase reconnu s'ajoute à la demande en cours,
  // il ne la remplace pas — on peut commencer au clavier et finir à la voix.
  const dictation = useDictation({
    lang: i18n.language,
    onText: (said) => setQuery((prev) => (prev.trim() ? `${prev.trim()} ${said}` : said)),
  });

  // Reprise des carnets — silencieuse : l'accueil reste utilisable si l'API
  // est injoignable (hors ligne, serveur local éteint).
  useEffect(() => {
    // Auth configurée et personne de connecté : la liste répondrait 401 —
    // on ne la demande pas, les inspirations tiennent l'accueil.
    if (supabase && !email) {
      setRecent([]);
      return;
    }
    let alive = true;
    void listTrips(plan)
      .then((trips) => {
        if (alive) setRecent(trips.slice(0, 3));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [plan, email]);

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
    <main className="flex w-full flex-col">
      {/* Fond plein écran — posé derrière TOUT, en-tête et pied de page
       * compris. `fixed` le fait déborder de la colonne et de <main> ;
       * -z-10 le laisse sous le contenu sans masquer le fond de body. */}
      <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden">
        <img
          src="/vire/vire_vallee-glacier.webp"
          alt=""
          fetchPriority="high"
          className="hero-drift h-full w-full object-cover"
        />
        {/* Voile en trois temps, chaque palier calé sur ce qui se pose
         * dessus : papier en haut (l'en-tête reste en encre sombre),
         * quasi transparent au milieu (l'image respire), encre en bas
         * (la question et la saisie sont en clair). */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(244,241,234,0.94)_0%,rgba(244,241,234,0.72)_12%,rgba(244,241,234,0.18)_30%,rgba(17,17,17,0.35)_40%,rgba(17,17,17,0.70)_50%,rgba(17,17,17,0.90)_100%)]" />
      </div>

      {/* En-tête de planche et sélecteur de mode */}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2">
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
      </div>

      {/* La saisie se pose en bas du premier écran, sur le fond */}
      <section className="flex min-h-[max(26rem,66svh)] flex-col justify-end">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-6 pt-10">
          <h1 className="mask-reveal font-display text-3xl font-semibold leading-tight text-cloud sm:text-4xl">
            <span>{question}</span>
          </h1>

          <form
            className="fade-up"
            style={{ animationDelay: '80ms' }}
            onSubmit={(e) => {
              e.preventDefault();
              start(query);
            }}
          >
            {/* Bandeau de saisie — arrondi et fin, posé sur le paysage.
             * Seul endroit de l'app aux angles adoucis : c'est le geste
             * d'une barre de recherche, pas une planche gravée. */}
            <div className="search-bar flex items-center gap-2 rounded-[22px] border border-mist bg-snow/95 py-1 pl-4 pr-1 shadow-[3px_3px_0_rgba(34,34,34,0.5)]">
              <label htmlFor="home-query" className="sr-only">
                {t('home.question')}
              </label>
              <textarea
                id="home-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('home.placeholder')}
                rows={1}
                className="max-h-28 min-h-9 flex-1 resize-none self-center bg-transparent py-1.5 font-display text-lg italic leading-snug text-trail placeholder:text-fog focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    start(query);
                  }
                }}
              />

              {/* Micro — masqué là où le navigateur ne sait pas dicter, plutôt
               * qu'un bouton qui ne ferait rien (Firefox). */}
              {dictation.supported && (
                <button
                  type="button"
                  onClick={dictation.toggle}
                  aria-pressed={dictation.listening}
                  aria-label={dictation.listening ? t('home.dictate_stop') : t('home.dictate')}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mist transition-colors ${
                    dictation.listening
                      ? 'bg-storm text-snow'
                      : 'bg-cloud text-trail hover:bg-sky'
                  }`}
                >
                  {dictation.listening ? (
                    <Square size={14} fill="currentColor" aria-hidden="true" />
                  ) : (
                    <Mic size={17} aria-hidden="true" />
                  )}
                </button>
              )}

              <button
                type="submit"
                disabled={!query.trim()}
                aria-label={t('home.cta')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mist bg-summit text-cloud transition-colors hover:bg-copper-deep disabled:bg-terrain disabled:text-fog"
              >
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            </div>
          </form>

          {/* Reprises ou inspirations — juste sous le bandeau, encore dans
           * l'image. Ni titre ni numérotation : ce sont des appuis, pas une
           * section. */}
          <ul className="fade-up flex flex-col" style={{ animationDelay: '160ms' }}>
            {recent.length > 0
              ? recent.map((trip) => (
                  <li key={trip.id}>
                    <Link
                      to={`/trips/${trip.id}`}
                      className="flex min-h-11 items-center gap-3 border-t border-cloud/20 py-2.5 transition-colors hover:bg-cloud/10"
                    >
                      <img
                        src={trip.cover_photo ?? FALLBACK_THUMB}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="h-9 w-14 shrink-0 border border-cloud/30 object-cover"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="label-mono text-cloud/70">
                          {t(`mode.${trip.mode as TripMode}`)} ·{' '}
                          {t('home.days', { count: trip.metadata.duration_days })}
                        </span>
                        <span className="truncate font-display text-base text-cloud">
                          {trip.title}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-cloud/70">
                        {formatDistance(trip.metadata.distance_km, units)}
                      </span>
                    </Link>
                  </li>
                ))
              : examples.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => start(example)}
                      className="flex min-h-11 w-full items-center border-t border-cloud/20 py-2.5 text-left text-sm text-cloud/90 transition-colors hover:bg-cloud/10 hover:text-cloud"
                    >
                      {example}
                    </button>
                  </li>
                ))}
          </ul>
        </div>
      </section>

    </main>
  );
}
