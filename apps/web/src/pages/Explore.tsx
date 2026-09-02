import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Crosshair, Footprints, Mountain, Plus, Search, Sparkles } from 'lucide-react';
import type { Lang, PlaceKind } from '@triptic/shared';
import {
  ApiError,
  parseExploreFilters,
  searchArea,
  searchTrails,
  type ExploreBbox,
  type TrailResult,
} from '../lib/api';
import {
  activityFromPlace,
  addActivityToDay,
  EXPLORE_CHIPS,
  type ExplorePlace,
} from '../lib/explore';
import { ExploreMap } from '../components/ExploreMap';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';

/** Zone par défaut (Vosges) quand la carte n'a pas encore remonté ses bounds. */
const DEFAULT_BBOX: ExploreBbox = { south: 47.8, west: 6.8, north: 48.3, east: 7.4 };

/**
 * Clé i18n du message d'échec — le serveur distingue « base de lieux absente »
 * (503 db_unavailable), « routeur absent » (503 routing_unavailable) et une
 * vraie panne ; l'UI doit le dire au lieu d'un « la recherche a échoué ».
 * Panne réseau (fetch rejeté) = pas d'ApiError.
 */
function errorKeyFor(error: unknown): string {
  if (!(error instanceof ApiError)) return 'explore.error_network';
  if (error.status === 503 && error.code === 'db_unavailable') {
    return 'explore.error_db_unavailable';
  }
  if (error.status === 503 && error.code === 'routing_unavailable') {
    return 'explore.error_routing_unavailable';
  }
  return 'explore.error';
}

/**
 * Écran « Explorer » (roadmap 4.2/4.3) : carte navigable + envie du jour en
 * langage naturel → filtres stricts, bouton « chercher dans cette zone »,
 * résultats triés par pertinence avec temps de trajet, ajout en 1 tap au
 * programme du trip sélectionné. Le bouton géoloc couvre l'usage terrain
 * (« autour de moi », spots de nuit via la puce Nuit).
 */
export function Explore() {
  const { t, i18n } = useTranslation();
  const { plan } = useUserStore();
  const { selected, applyDays } = useTripStore();
  const lang = (i18n.language as Lang) ?? 'fr';

  const [bbox, setBbox] = useState<ExploreBbox>(DEFAULT_BBOX);
  const [wish, setWish] = useState('');
  const [activeKinds, setActiveKinds] = useState<Set<PlaceKind>>(new Set());
  const [results, setResults] = useState<ExplorePlace[]>([]);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [from, setFrom] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'searching' | 'error'>('idle');
  const [errorKey, setErrorKey] = useState('explore.error');
  const [geoError, setGeoError] = useState(false);
  const [searched, setSearched] = useState(false);
  const [targetDay, setTargetDay] = useState(1);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  // Mode boucles rando (5.2) : distance cible + tracé sélectionné sur la carte
  const [trailMode, setTrailMode] = useState(false);
  const [targetKm, setTargetKm] = useState(12);
  const [trails, setTrails] = useState<TrailResult[]>([]);
  const [selectedTrail, setSelectedTrail] = useState<TrailResult | null>(null);

  const toggleChip = (kinds: PlaceKind[]) => {
    setActiveKinds((prev) => {
      const next = new Set(prev);
      const allActive = kinds.every((k) => next.has(k));
      for (const k of kinds) {
        if (allActive) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const runSearch = async (kinds: Set<PlaceKind> = activeKinds) => {
    setStatus('searching');
    try {
      if (trailMode) {
        const center = {
          lat: (bbox.south + bbox.north) / 2,
          lng: (bbox.west + bbox.east) / 2,
        };
        setTrails(await searchTrails(from ?? center, 10000, targetKm));
        setResults([]);
      } else {
        const mode =
          selected?.mode === 'bikepacking' ? 'bike' : selected?.mode === 'trek' ? 'foot' : 'car';
        setResults(await searchArea(bbox, [...kinds], from, mode));
        setTrails([]);
        setSelectedTrail(null);
      }
      setSearched(true);
      setStatus('idle');
    } catch (error) {
      setErrorKey(errorKeyFor(error));
      setStatus('error');
    }
  };

  /** Envie du jour → filtres IA (kinds stricts) puis recherche immédiate. */
  const parseWish = async () => {
    const text = wish.trim();
    if (!text || status !== 'idle') return;
    setStatus('parsing');
    let next: Set<PlaceKind> | null = null;
    try {
      const filters = await parseExploreFilters(text, lang, plan);
      next = new Set<PlaceKind>(filters.kinds);
      setActiveKinds(next);
    } catch (error) {
      // Les boucles rando ignorent les kinds et sont servies sans base : un
      // service de filtres HS ne doit pas bloquer ce mode en amont.
      if (!trailMode) {
        setErrorKey(errorKeyFor(error));
        setStatus('error');
        return;
      }
    }
    await runSearch(next ?? activeKinds);
  };

  const locate = () => {
    // API absente (contexte non sécurisé HTTP) ou refus utilisateur → message visible
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }
    setGeoError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setFrom(point);
        setCenter([point.lng, point.lat]);
      },
      () => setGeoError(true),
    );
  };

  const addToDay = (place: ExplorePlace) => {
    if (!selected?.days?.length) return;
    void applyDays(addActivityToDay(selected.days, targetDay, activityFromPlace(place)), plan);
    setAddedIds((prev) => new Set(prev).add(place.id));
  };

  const busy = status === 'parsing' || status === 'searching';

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <div className="fade-up flex items-baseline justify-between border-b border-mist pb-2">
        <p className="font-display text-xl font-semibold tracking-[0.2em] text-trail">
          {t('app.name')}
        </p>
        <p className="label-mono text-fog">{t('explore.nav')}</p>
      </div>
      <header className="fade-up flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold leading-tight text-trail">
          {t('explore.title')}
        </h1>
        <p className="font-display text-base italic leading-snug text-ridge">{t('explore.hint')}</p>
      </header>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void parseWish();
        }}
      >
        <input
          type="text"
          value={wish}
          onChange={(e) => setWish(e.target.value)}
          placeholder={t('explore.prompt_placeholder')}
          aria-label={t('explore.prompt_placeholder')}
          disabled={busy}
          className="min-h-12 flex-1 border border-mist bg-snow px-4 font-display text-base italic text-trail shadow-[3px_3px_0_rgba(34,34,34,0.5)] placeholder:text-fog disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !wish.trim()}
          aria-label={t('explore.parse')}
          className="cta-plate flex min-h-12 items-center gap-2 px-4"
        >
          <Sparkles size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{t('explore.parse')}</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('explore.filters_label')}>
        {EXPLORE_CHIPS.map((chip) => {
          const active = chip.kinds.every((k) => activeKinds.has(k));
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              disabled={busy}
              onClick={() => toggleChip(chip.kinds)}
              className={`min-h-11 border px-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                active ? 'border-mist bg-summit text-snow' : 'border-mist bg-snow text-trail hover:bg-sky'
              }`}
            >
              {t(`explore.chip_${chip.key}`)}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={trailMode}
          disabled={busy}
          onClick={() => {
            setTrailMode(!trailMode);
            setSelectedTrail(null);
          }}
          className={`flex min-h-11 items-center gap-1.5 border px-3.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
            trailMode ? 'border-mist bg-pine text-snow' : 'border-mist bg-snow text-trail hover:bg-sky'
          }`}
        >
          <Footprints size={15} aria-hidden="true" />
          {t('explore.chip_trails')}
        </button>
        <button
          type="button"
          onClick={locate}
          className="cta-plate-ghost ml-auto flex min-h-11 items-center gap-1.5 px-3.5"
        >
          <Crosshair size={15} aria-hidden="true" />
          {t('explore.locate')}
        </button>
      </div>

      {geoError && (
        <p role="alert" className="border border-storm-deep bg-storm-tint px-4 py-3 text-sm text-storm-deep">
          {t('explore.locate_error')}
        </p>
      )}

      {trailMode && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ridge">
          {t('explore.target_km')}
          <input
            type="number"
            min={1}
            max={60}
            value={targetKm}
            disabled={busy}
            onChange={(e) => setTargetKm(Number(e.target.value) || 12)}
            className="min-h-10 w-20 border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
          />
          km
        </label>
      )}

      <div className="relative">
        <ExploreMap
          results={results}
          trace={selectedTrail?.geometry ?? null}
          center={center}
          onBoundsChange={setBbox}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSearch()}
          className="cta-plate absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 px-5 disabled:opacity-60"
        >
          <Search size={16} aria-hidden="true" />
          {status === 'searching' ? t('explore.searching') : t('explore.search_area')}
        </button>
      </div>

      <p className="label-mono text-fog">{t('explore.coverage_note')}</p>

      {status === 'error' && (
        <p
          role="alert"
          className={`border px-4 py-3 text-sm ${
            // Service manquant (503) : ce n'est ni la faute de l'utilisateur ni
            // une panne — ton « warning », pas « erreur ».
            errorKey === 'explore.error_db_unavailable' ||
            errorKey === 'explore.error_routing_unavailable'
              ? 'border-amber-deep bg-amber-tint text-amber-deep'
              : 'border-storm-deep bg-storm-tint text-storm-deep'
          }`}
        >
          {t(errorKey)}
        </p>
      )}

      {selected?.days && selected.days.length > 0 && results.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ridge">
          {t('explore.day_label')}
          <select
            value={targetDay}
            onChange={(e) => setTargetDay(Number(e.target.value))}
            className="min-h-10 border border-mist bg-snow px-2 text-sm font-normal text-trail"
          >
            {selected.days.map((d) => (
              <option key={d.day} value={d.day}>
                {t('trips.day')} {d.day} — {d.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <section aria-label={t('explore.results_title')} className="flex flex-col">
        {searched &&
          results.length === 0 &&
          (!trailMode || trails.length === 0) &&
          status === 'idle' && (
            <p className="border border-mist bg-terrain px-4 py-3 font-display text-base italic text-ridge">
              {t('explore.no_results')}
            </p>
          )}
        {trailMode &&
          trails.map((trail) => (
            <button
              key={trail.id}
              type="button"
              onClick={() => setSelectedTrail(trail)}
              aria-pressed={selectedTrail?.id === trail.id}
              className={`flex items-center gap-3 border border-b-0 px-4 py-3 text-left text-sm transition-colors last:border-b ${
                selectedTrail?.id === trail.id ? 'border-summit bg-sky' : 'border-mist bg-snow hover:bg-sky'
              }`}
            >
              <Footprints size={16} className="shrink-0 text-pine" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-lg font-semibold leading-tight text-trail">
                  {trail.generated ? t('explore.generated_loop') : trail.name}
                </span>
                {trail.summary && (
                  <span className="block truncate text-xs text-fog">{trail.summary}</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 font-mono text-xs text-ridge">
                <span>{trail.distance_km} km</span>
                <span className="flex items-center gap-1">
                  <Clock size={13} aria-hidden="true" />≈{' '}
                  {Math.floor(trail.duration_min / 60)}h
                  {String(trail.duration_min % 60).padStart(2, '0')}
                </span>
                {trail.elevation_gain_m !== undefined && (
                  <span className="flex items-center gap-1">
                    <Mountain size={13} aria-hidden="true" />
                    {trail.elevation_gain_m} m
                  </span>
                )}
              </span>
            </button>
          ))}
        {results.map((place) => (
          <article
            key={place.id}
            className="flex items-center gap-3 border border-b-0 border-mist bg-snow px-4 py-3 text-sm last:border-b"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-display text-lg font-semibold leading-tight text-trail">
                <span className="truncate">{place.name}</span>
                {place.notoriety >= 60 && (
                  <span className="label-mono shrink-0 border border-mist bg-snow px-1.5 py-0.5 text-copper-deep">
                    {t('explore.must_see')}
                  </span>
                )}
              </p>
              <p className="label-mono truncate text-fog">
                {t(`places.kind_${place.kind}`, place.kind)}
                {place.summary ? ` · ${place.summary}` : ''}
              </p>
            </div>
            {place.travel_min !== undefined && (
              <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-ridge">
                <Clock size={13} aria-hidden="true" />≈ {place.travel_min} min
              </span>
            )}
            {selected?.days && selected.days.length > 0 && (
              <button
                type="button"
                disabled={addedIds.has(place.id)}
                onClick={() => addToDay(place)}
                aria-label={`${t('explore.add_to_day')} — ${place.name}`}
                className="cta-plate flex min-h-10 shrink-0 items-center gap-1 px-3 disabled:translate-y-0 disabled:bg-pine disabled:text-snow"
              >
                <Plus size={14} aria-hidden="true" />
                {addedIds.has(place.id) ? t('explore.added') : t('explore.add_to_day')}
              </button>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
