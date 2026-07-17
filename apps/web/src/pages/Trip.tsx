import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Share2 } from 'lucide-react';
import { saveTrip } from '../lib/api';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { GPXExportButton } from '../components/GPXExportButton';
import { MapView } from '../components/MapView';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';

export function TripPage() {
  const { t } = useTranslation();
  const { selected, saved, setSaved } = useTripStore();
  const { plan } = useUserStore();
  const [copied, setCopied] = useState(false);

  if (!selected) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('trips.not_found')}</p>
        <Link to="/plan" className="mt-4 inline-block font-semibold text-summit underline">
          {t('trips.back')}
        </Link>
      </main>
    );
  }

  const onSave = async () => {
    if (saved) return;
    setSaved(await saveTrip(selected, plan, false));
  };

  const onShare = async () => {
    let trip = saved;
    if (!trip || !trip.is_public) {
      trip = await saveTrip(selected, plan, true);
      setSaved(trip);
    }
    if (trip.slug) {
      await navigator.clipboard.writeText(`${window.location.origin}/trip/${trip.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sortedWaypoints = [...selected.waypoints].sort((a, b) => a.day - b.day);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <Link to="/plan" className="flex items-center gap-1 text-sm text-ridge hover:text-summit">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('trips.back')}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-badge bg-summit/10 px-2 py-0.5 text-xs font-medium text-summit">
            {t(`mode.${selected.mode}`)}
          </span>
          <DifficultyBadge level={selected.difficulty} />
        </div>
        <h1 className="font-display text-3xl font-bold text-trail">{selected.title}</h1>
        <p className="text-sm text-ridge">{selected.summary}</p>
        <p className="font-mono text-xs text-ridge">
          {selected.duration_days} {t('trips.days')} · {Math.round(selected.distance_km)} km ·{' '}
          {t('trips.elevation')} {Math.round(selected.elevation_gain_m)} m ·{' '}
          {Math.round(selected.daily_distance_km)} km {t('trips.per_day')}
        </p>
      </header>

      <MapView waypoints={selected.waypoints} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={Boolean(saved)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-summit px-4 py-2.5 text-sm font-semibold text-snow transition-colors hover:bg-summit/90 disabled:bg-pine"
        >
          <Bookmark size={16} aria-hidden="true" />
          {saved ? t('trips.saved') : t('trips.save')}
        </button>
        <GPXExportButton tripId={saved?.id ?? null} title={selected.title} />
        <button
          type="button"
          onClick={onShare}
          className="flex min-h-11 items-center gap-2 rounded-xl border border-mist px-4 py-2.5 text-sm font-semibold text-trail transition-colors hover:border-summit"
        >
          <Share2 size={16} aria-hidden="true" />
          {copied ? t('trips.copied') : t('trips.share')}
        </button>
      </div>

      <section aria-labelledby="waypoints-title" className="flex flex-col gap-2">
        <h2 id="waypoints-title" className="font-display text-xl font-bold text-trail">
          {t('trips.waypoints_title')}
        </h2>
        <ol className="flex flex-col gap-1.5">
          {sortedWaypoints.map((waypoint, i) => (
            <li
              key={`${waypoint.name}-${i}`}
              className="flex items-center gap-3 rounded-xl bg-snow px-4 py-2.5 text-sm shadow-sm"
            >
              <span className="font-mono text-xs font-semibold text-summit">
                {t('trips.day')} {waypoint.day}
              </span>
              <span className="font-medium text-trail">{waypoint.name}</span>
              {waypoint.note && <span className="text-xs text-fog">{waypoint.note}</span>}
              <span className="ml-auto font-mono text-[10px] text-fog">
                {waypoint.lat.toFixed(4)}, {waypoint.lng.toFixed(4)}
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
