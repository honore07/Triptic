import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PlaceKind, TripActivity, TripDay } from '@triptic/shared';
import { searchArea } from '../lib/api';
import { activityFromPlace, type ExplorePlace } from '../lib/explore';

/** Où l'on peut passer la nuit, selon la base de lieux. */
const NIGHT_KINDS: PlaceKind[] = ['camp', 'refuge'];

/** Fenêtre de recherche autour de la fin d'étape (~15 km). */
const BBOX_DEG = 0.15;

const FILTERS = ['all', 'camp', 'refuge'] as const;
type Filter = (typeof FILTERS)[number];

/** Gravures d'abri — un emplacement sans photo garde un objet d'expédition. */
const KIND_ENGRAVING: Record<string, string> = {
  camp: '/vire/vire_pic-lanterne.jpg',
  refuge: '/vire/vire_char-fanion.jpg',
};

interface NuiteeProps {
  /** Journée dont on cherche la nuitée — sa dernière activité fixe le point. */
  day: TripDay;
  /** Ajoute l'emplacement retenu comme nuit de cette journée. */
  onAdd: (activity: TripActivity) => void;
}

/**
 * Nuitée — planche PL.10 « SPOTS DE NUIT ».
 * Les emplacements réels de la base autour de la fin d'étape, avec leur
 * temps de trajet depuis ce point. Aucun service inventé : on n'affiche que
 * ce que la base sait (nature du lieu, distance, description).
 */
export function Nuitee({ day, onAdd }: NuiteeProps) {
  const { t } = useTranslation();
  const [places, setPlaces] = useState<ExplorePlace[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const last = day.activities[day.activities.length - 1];
  const mode = day.segments?.[0]?.mode ?? 'car';

  useEffect(() => {
    if (!last) return;
    let alive = true;
    setPlaces(null);
    setFailed(false);
    void searchArea(
      {
        south: last.lat - BBOX_DEG,
        north: last.lat + BBOX_DEG,
        west: last.lng - BBOX_DEG,
        east: last.lng + BBOX_DEG,
      },
      NIGHT_KINDS,
      { lat: last.lat, lng: last.lng },
      mode,
    )
      .then((found) => {
        if (alive) setPlaces(found);
      })
      .catch(() => {
        // Base injoignable : on le dit, on ne montre pas une liste vide
        // qui laisserait croire qu'il n'y a rien à dormir dans le coin.
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [last, mode]);

  if (!last) return null;

  const shown = (places ?? []).filter((p) => filter === 'all' || p.kind === filter);

  return (
    <section aria-labelledby="nuitee-title" className="fade-up flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-mist pb-2">
        <p className="label-mono text-fog">{t('nuitee.plate')}</p>
        <p className="label-mono text-fog">
          {t('trips.day')} {String(day.day).padStart(2, '0')}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <h2
          id="nuitee-title"
          className="font-display text-3xl font-semibold leading-tight text-trail"
        >
          {t('nuitee.title')}
        </h2>
        <p className="font-display text-base italic leading-snug text-ridge">
          {t('nuitee.hint', { place: last.title })}
        </p>
      </div>

      <div role="group" aria-label={t('nuitee.filter_label')} className="flex border border-mist">
        {FILTERS.map((key, i) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`min-h-11 flex-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
              i > 0 ? 'border-l border-mist' : ''
            } ${filter === key ? 'bg-summit text-snow' : 'bg-snow text-trail hover:bg-sky'}`}
          >
            {t(`nuitee.filter_${key}`)}
          </button>
        ))}
      </div>

      {failed && (
        <p role="alert" className="border border-storm bg-storm-tint px-3 py-2 text-sm text-storm-deep">
          {t('nuitee.error')}
        </p>
      )}
      {!failed && places === null && (
        <p className="text-sm text-fog" aria-live="polite">
          {t('nuitee.loading')}
        </p>
      )}
      {!failed && places !== null && shown.length === 0 && (
        <p className="text-sm text-ridge">{t('nuitee.empty')}</p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {shown.map((place) => (
          <li key={place.id} className="plate-hover ink-reveal flex flex-col gap-3 border border-mist bg-snow p-3">
            <div className="flex items-start gap-3">
              <img
                src={KIND_ENGRAVING[place.kind] ?? KIND_ENGRAVING.camp}
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-full border border-mist object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="label-mono text-fog">{t(`places.kind_${place.kind}`)}</p>
                <p className="font-display text-xl font-semibold leading-tight text-trail">
                  {place.name}
                </p>
              </div>
              {place.travel_min !== undefined && (
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="label-mono text-fog">{t('nuitee.detour')}</span>
                  <span className="font-display text-lg font-semibold text-trail">
                    {place.travel_min} min
                  </span>
                </div>
              )}
            </div>

            {place.summary && (
              <p className="text-sm leading-relaxed text-ridge">{place.summary}</p>
            )}

            <button
              type="button"
              onClick={() => onAdd(activityFromPlace(place, 'evening'))}
              className="cta-plate flex min-h-11 items-center justify-center px-4 py-2.5"
            >
              {t('nuitee.add')}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
