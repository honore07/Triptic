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
 * La fiche d'une journée : relevé chiffré, profil des montées et déroulé des
 * temps forts. Le profil se lit sur les dénivelés réellement portés par les
 * activités — pas de courbe lissée qui suggérerait une précision qu'on n'a
 * pas (un vrai profil au point demanderait l'altimétrie serveur).
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
    <section aria-labelledby="etape-title" className="fade-up flex flex-col gap-4">
      <div className="flex items-center gap-3 border-b border-mist pb-3">
        <img
          src={ACTIVITY_ENGRAVINGS[type]}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-14 w-14 shrink-0 rounded-full border border-mist object-cover"
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
          <ul className="flex h-24 items-end gap-1.5 border-b border-mist">
            {climbs.map((climb) => (
              <li
                key={climb.i}
                className="flex flex-1 flex-col items-center justify-end"
                title={`${climb.title} — ${climb.gain} m`}
              >
                <span
                  className="w-full bg-summit"
                  style={{ height: `${Math.max(6, (climb.gain / maxGain) * 100)}%` }}
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

      <ol className="flex flex-col">
        {day.activities.map((activity, i) => {
          const Icon = ACTIVITY_ICONS[activity.type] ?? Bike;
          return (
            <li
              key={i}
              className="flex items-start gap-3 border-b border-mist py-3 last:border-b-0"
            >
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
