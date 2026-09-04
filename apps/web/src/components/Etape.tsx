import { useTranslation } from 'react-i18next';
import {
  BedDouble,
  Bike,
  Car,
  Footprints,
  Landmark,
  Moon,
  UtensilsCrossed,
} from 'lucide-react';
import { dateForTripDay, type ActivityType, type TripDay } from '@triptic/shared';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
import { thumbnailUrl } from './DayCards';

const ACTIVITY_ICONS: Record<ActivityType, typeof Car> = {
  drive: Car,
  hike: Footprints,
  visit: Landmark,
  meal: UtensilsCrossed,
  camp: Moon,
  rest: BedDouble,
};

/** Gravure de médaillon par nature de journée (mêmes objets que PL.09). */
const ACTIVITY_ENGRAVINGS: Record<ActivityType, string> = {
  drive: '/vire/vire_logo-compas.webp',
  hike: '/vire/vire_pic-chaussures.jpg',
  visit: '/vire/vire_char-carte.jpg',
  meal: '/vire/vire_pic-sac.jpg',
  camp: '/vire/vire_pic-lanterne.jpg',
  rest: '/vire/vire_pic-corde.jpg',
};

/** hh h mm — jamais « 370 min ». */
function asHours(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

interface EtapeProps {
  day: TripDay;
  /** Date de départ du trip — donne la date réelle de la journée. */
  startDate?: string | undefined;
}

/**
 * Étape — planche PL.11 « ÉTAPE ».
 * La fiche d'une journée. La photo réelle du jour ouvre la planche quand
 * elle existe (c'est le terrain), la gravure de l'objet du jour sinon ; puis
 * le relevé chiffré, le profil des montées qui se dressent, et le déroulé des
 * temps forts le long d'un filet, comme les heures d'un carnet de course.
 * Le profil se lit sur les dénivelés réellement portés par les activités —
 * pas de courbe lissée qui suggérerait une précision qu'on n'a pas.
 */
export function Etape({ day, startDate }: EtapeProps) {
  const { t, i18n } = useTranslation();
  const units = useProfileStore((s) => s.units);
  const type = day.activities[0]?.type ?? 'hike';

  const distance = (day.segments ?? []).reduce((s, seg) => s + seg.distance_km, 0);
  const minutes = (day.segments ?? []).reduce((s, seg) => s + seg.duration_min, 0);
  const gain = day.activities.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0);

  const iso = startDate ? dateForTripDay(startDate, day.day) : null;
  const dateLabel = iso
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
        new Date(iso),
      )
    : null;

  // Montées de la journée, dans l'ordre — l'échelle est celle de la plus forte
  const climbs = day.activities
    .map((a, i) => ({ i, title: a.title, gain: a.elevation_gain_m ?? 0 }))
    .filter((c) => c.gain > 0);
  const maxGain = Math.max(...climbs.map((c) => c.gain), 1);

  const releve = [
    { label: t('trips.distance'), value: distance > 0 ? formatDistance(distance, units) : '—' },
    { label: t('trips.elevation'), value: gain > 0 ? formatElevation(gain, units) : '—' },
    { label: t('etape.time'), value: minutes > 0 ? asHours(minutes) : '—' },
  ];

  return (
    <section aria-labelledby="etape-title" className="ink-reveal flex flex-col gap-4">
      {/* Tête de planche : la photo du jour, ou l'objet du jour en médaillon */}
      {day.photo_url ? (
        <header className="relative -mx-4 overflow-hidden border-y border-mist bg-trail text-cloud sm:mx-0 sm:border">
          <img
            src={thumbnailUrl(day.photo_url, 1200)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="hero-drift absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(17,17,17,0.15)_0%,rgba(17,17,17,0.55)_45%,rgba(17,17,17,0.94)_100%)]"
          />
          <div className="relative flex min-h-[15rem] flex-col justify-end gap-1 p-4 sm:min-h-[18rem] sm:p-5">
            <p className="label-mono text-cloud/80">
              {t('trips.day')} {String(day.day).padStart(2, '0')}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </p>
            <h2
              id="etape-title"
              className="on-photo font-display text-3xl font-semibold leading-tight text-cloud sm:text-4xl"
            >
              {day.title}
            </h2>
          </div>
        </header>
      ) : (
        <div className="flex items-center gap-3 border-b border-mist pb-3">
          <img
            src={ACTIVITY_ENGRAVINGS[type]}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-17 w-17 shrink-0 rounded-full border border-mist object-cover"
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="label-mono text-fog">
              {t('trips.day')} {String(day.day).padStart(2, '0')}
              {dateLabel ? ` · ${dateLabel}` : ''}
            </p>
            <h2
              id="etape-title"
              className="font-display text-2xl font-semibold leading-tight text-trail"
            >
              {day.title}
            </h2>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-3 border border-mist">
        {releve.map(({ label, value }, i) => (
          <div
            key={label}
            className={`flex flex-col gap-0.5 p-2.5 ${i < 2 ? 'border-r border-mist' : ''}`}
          >
            <dt className="label-mono text-fog">{label}</dt>
            <dd className="font-display text-xl font-semibold leading-none text-trail">{value}</dd>
          </div>
        ))}
      </dl>

      {climbs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <p className="label-mono text-fog">{t('etape.profile')}</p>
            <p className="label-mono text-fog">{formatElevation(maxGain, units)} max</p>
          </div>
          {/* Les montées se dressent l'une après l'autre, depuis la ligne de sol */}
          <ul className="flex h-24 items-end gap-1.5 border-b border-mist">
            {climbs.map((climb, n) => (
              <li
                key={climb.i}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${climb.title} — ${climb.gain} m`}
              >
                <span
                  className="bar-grow w-full bg-summit"
                  style={{
                    height: `${Math.max(6, (climb.gain / maxGain) * 100)}%`,
                    animationDelay: `${120 + n * 90}ms`,
                  }}
                />
                <span className="sr-only">
                  {climb.title} — {climb.gain} m
                </span>
              </li>
            ))}
          </ul>
          <p className="label-mono text-fog">{t('etape.profile_note')}</p>
        </div>
      )}

      {/* Le déroulé du jour, le long d'un filet — chaque temps fort est un
       * point rouille sur la ligne, comme une heure relevée au carnet. */}
      <ol className="relative flex flex-col border-l border-mist pl-5">
        {day.activities.map((activity, i) => {
          const Icon = ACTIVITY_ICONS[activity.type] ?? Bike;
          return (
            <li
              key={i}
              className="fade-up relative flex items-start gap-3 border-b border-mist py-3 last:border-b-0"
              style={{ animationDelay: `${160 + i * 70}ms` }}
            >
              <span
                aria-hidden="true"
                className="absolute -left-[1.45rem] top-4 h-2.5 w-2.5 rounded-full border border-mist bg-summit"
              />
              <Icon size={16} className="mt-1 shrink-0 text-summit" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="label-mono text-fog">
                  {t(`time.${activity.time_of_day}`)} · {t(`activity.${activity.type}`)}
                </p>
                <p className="font-display text-lg font-semibold leading-tight text-trail">
                  {activity.title}
                </p>
                {activity.description && (
                  <p className="mt-0.5 text-sm leading-relaxed text-ridge">
                    {activity.description}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-right font-mono text-xs text-ridge">
                {activity.distance_km ? <span className="block">{activity.distance_km} km</span> : null}
                {activity.elevation_gain_m ? (
                  <span className="block text-fog">+ {activity.elevation_gain_m} m</span>
                ) : null}
                {activity.cost_estimate ? (
                  <span className="block text-fog">{activity.cost_estimate} €</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
