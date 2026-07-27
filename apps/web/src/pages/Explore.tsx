import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Crosshair, Plus, Search, Sparkles } from 'lucide-react';
import type { Lang, PlaceKind } from '@triptic/shared';
import { parseExploreFilters, searchArea, type ExploreBbox } from '../lib/api';
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
  const [searched, setSearched] = useState(false);
  const [targetDay, setTargetDay] = useState(1);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

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
      const mode = selected?.mode === 'bikepacking' ? 'bike' : selected?.mode === 'trek' ? 'foot' : 'car';
      setResults(await searchArea(bbox, [...kinds], from, mode));
      setSearched(true);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  /** Envie du jour → filtres IA (kinds stricts) puis recherche immédiate. */
  const parseWish = async () => {
    const text = wish.trim();
    if (!text || status !== 'idle') return;
    setStatus('parsing');
    try {
      const filters = await parseExploreFilters(text, lang, plan);
      const next = new Set<PlaceKind>(filters.kinds);
      setActiveKinds(next);
      await runSearch(next);
    } catch {
      setStatus('error');
    }
  };

  const locate = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setFrom(point);
      setCenter([point.lng, point.lat]);
    });
  };

  const addToDay = (place: ExplorePlace) => {
    if (!selected?.days?.length) return;
    void applyDays(addActivityToDay(selected.days, targetDay, activityFromPlace(place)), plan);
    setAddedIds((prev) => new Set(prev).add(place.id));
  };

  const busy = status === 'parsing' || status === 'searching';

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold text-trail">{t('explore.title')}</h1>
        <p className="text-sm text-ridge">{t('explore.hint')}</p>
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
          className="min-h-12 flex-1 rounded-xl border border-mist bg-snow px-4 text-sm text-trail shadow-sm placeholder:text-fog disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !wish.trim()}
          className="flex min-h-12 items-center gap-2 rounded-xl bg-gold px-4 font-display text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:bg-mist disabled:text-fog"
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
              className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors ${
                active
                  ? 'border-summit bg-summit/10 text-copper-deep'
                  : 'border-mist bg-snow text-ridge hover:border-summit'
              }`}
            >
              {t(`explore.chip_${chip.key}`)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={locate}
          className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full border border-mist bg-snow px-4 text-sm font-semibold text-ridge transition-colors hover:border-summit"
        >
          <Crosshair size={15} aria-hidden="true" />
          {t('explore.locate')}
        </button>
      </div>

      <div className="relative">
        <ExploreMap results={results} center={center} onBoundsChange={setBbox} />
        <button
          type="button"
          disabled={busy}
          onClick={() => void runSearch()}
          className="glow-cta absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-gold px-5 font-display text-sm font-bold text-trail shadow-lg transition-all duration-200 hover:bg-gold-deep disabled:opacity-60"
        >
          <Search size={16} aria-hidden="true" />
          {status === 'searching' ? t('explore.searching') : t('explore.search_area')}
        </button>
      </div>

      <p className="text-xs text-fog">{t('explore.coverage_note')}</p>

      {status === 'error' && (
        <p role="alert" className="rounded-xl bg-storm/10 px-4 py-3 text-sm text-storm">
          {t('explore.error')}
        </p>
      )}

      {selected?.days && selected.days.length > 0 && results.length > 0 && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ridge">
          {t('explore.day_label')}
          <select
            value={targetDay}
            onChange={(e) => setTargetDay(Number(e.target.value))}
            className="min-h-10 rounded-lg border border-mist bg-snow px-2 text-sm font-normal text-trail"
          >
            {selected.days.map((d) => (
              <option key={d.day} value={d.day}>
                {t('trips.day')} {d.day} — {d.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <section aria-label={t('explore.results_title')} className="flex flex-col gap-1.5">
        {searched && results.length === 0 && status === 'idle' && (
          <p className="rounded-xl bg-terrain px-4 py-3 text-sm text-ridge">
            {t('explore.no_results')}
          </p>
        )}
        {results.map((place) => (
          <article
            key={place.id}
            className="flex items-center gap-3 rounded-xl bg-snow px-4 py-2.5 text-sm shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 font-medium text-trail">
                <span className="truncate">{place.name}</span>
                {place.notoriety >= 60 && (
                  <span className="shrink-0 rounded-badge bg-gold/20 px-1.5 py-0.5 text-[10px] font-semibold text-copper-deep">
                    {t('explore.must_see')}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-fog">
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
                className="flex min-h-10 shrink-0 items-center gap-1 rounded-lg bg-gold px-3 text-xs font-bold text-trail transition-colors hover:bg-gold-deep disabled:bg-pine disabled:text-snow"
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
