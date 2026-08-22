import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Leaf, Pencil, Share2, Undo2, Wallet } from 'lucide-react';
import type { Lang, TripDay } from '@triptic/shared';
import { track } from '../lib/analytics';
import { saveTrip, updateTrip } from '../lib/api';
import { DayCards } from '../components/DayCards';
import { DayEditor } from '../components/DayEditor';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { GPXExportButton } from '../components/GPXExportButton';
import { MapView } from '../components/MapView';
import { TripEditChat } from '../components/TripEditChat';
import { WeatherStrip } from '../components/WeatherStrip';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';

export function TripPage() {
  const { t, i18n } = useTranslation();
  const {
    selected,
    saved,
    setSaved,
    history,
    recomputing,
    error: recomputeError,
    applyDays,
    applyRecomputed,
    pushHistory,
    undo,
  } = useTripStore();
  const { plan } = useUserStore();
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState(false);
  /** URL publique affichée en fallback quand le presse-papiers est indisponible. */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const lang = (i18n.language as Lang) ?? 'fr';

  /** Édition (manuelle ou chat) → recalcul live + sync du trip sauvegardé. */
  const onDaysChange = (days: TripDay[]) => {
    void applyDays(days, plan).then(() => {
      const current = useTripStore.getState().selected;
      if (saved && current) void updateTrip(saved.id, current, plan);
    });
  };

  if (!selected) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('trips.not_found')}</p>
        <Link to="/plan" className="mt-4 inline-block font-semibold text-copper-deep underline">
          {t('trips.back')}
        </Link>
      </main>
    );
  }

  // Le trip est auto-sauvegardé en brouillon à la sélection : le bouton
  // « Sauvegarder » promeut le brouillon en 'saved' (PATCH — pas de doublon)
  const isSaved = Boolean(saved && saved.status !== 'draft');

  const onSave = async () => {
    if (isSaved) return;
    setActionError(false);
    try {
      if (saved) {
        const updated = await updateTrip(saved.id, selected, plan, { status: 'saved' });
        if (!updated) throw new Error('updateTrip failed');
        setSaved(updated);
      } else {
        // L'auto-save a échoué (ou n'a pas encore abouti) : POST direct
        setSaved(await saveTrip(selected, plan, false));
      }
      track('trip_saved', { mode: selected.mode });
    } catch {
      setActionError(true);
    }
  };

  const onShare = async () => {
    setActionError(false);
    try {
      let trip = saved;
      if (trip && !trip.is_public) {
        // Trip déjà sauvegardé : PATCH is_public (jamais de re-POST → pas de doublon)
        const updated = await updateTrip(trip.id, selected, plan, { is_public: true });
        if (!updated) throw new Error('updateTrip failed');
        trip = updated;
        setSaved(updated);
      } else if (!trip) {
        trip = await saveTrip(selected, plan, true);
        setSaved(trip);
      }
      if (!trip.slug) return;
      track('trip_shared', { mode: selected.mode });
      const url = `${window.location.origin}/trip/${trip.slug}`;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          setShareUrl(null);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Copie refusée (permissions) : même fallback que sans clipboard
          setShareUrl(url);
        }
      } else {
        // Contexte non sécurisé (HTTP) : pas de clipboard → URL sélectionnable
        setShareUrl(url);
      }
    } catch {
      setActionError(true);
    }
  };

  /** Fourchette € — valeur seule quand min = max (jamais « 35–35 € »). */
  const eurRange = ([min, max]: [number, number]) =>
    min === max ? `${min} €` : `${min}–${max} €`;

  const sortedWaypoints = [...selected.waypoints].sort((a, b) => a.day - b.day);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <Link to="/plan" className="flex items-center gap-1 text-sm text-ridge hover:text-summit">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('trips.back')}
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-badge bg-summit/10 px-2 py-0.5 text-xs font-semibold text-copper-deep">
            {t(`mode.${selected.mode}`)}
          </span>
          <DifficultyBadge level={selected.difficulty} />
        </div>
        <h1 className="font-display text-3xl font-bold text-trail">{selected.title}</h1>
        <p className="text-sm text-ridge">{selected.summary}</p>
        <p className="font-mono text-xs text-ridge">
          {t('trips.days_count', { count: selected.duration_days })} · {Math.round(selected.distance_km)} km ·{' '}
          {t('trips.elevation')} {Math.round(selected.elevation_gain_m)} m ·{' '}
          {Math.round(selected.daily_distance_km)} km {t('trips.per_day')}
        </p>
      </header>

      <MapView
        waypoints={selected.waypoints}
        days={selected.days}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaved}
          className="flex min-h-11 items-center gap-2 rounded-2xl bg-gold px-4 py-2.5 font-display text-base font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:bg-pine disabled:text-snow"
        >
          <Bookmark size={16} aria-hidden="true" />
          {isSaved ? t('trips.saved') : t('trips.save')}
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

      {actionError && (
        <p role="alert" className="rounded-xl bg-storm/10 px-4 py-3 text-sm font-semibold text-storm">
          {t('trips.error_action')}
        </p>
      )}

      {shareUrl && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-mist bg-snow p-4">
          <p className="text-sm text-ridge">{t('trips.copy_manual')}</p>
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label={t('trips.share')}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-mist bg-terrain px-3 py-2.5 font-mono text-xs text-trail"
          />
        </div>
      )}

      {(selected.budget || (selected.co2_kg !== undefined && selected.co2_kg > 0)) && (
        <section
          aria-labelledby="budget-title"
          className="flex flex-col gap-3 rounded-trip border border-mist bg-snow p-5"
        >
          <h2 id="budget-title" className="flex items-center gap-2 font-display text-xl font-bold text-trail">
            <Wallet size={18} className="text-summit" aria-hidden="true" />
            {t('budget.title')}
          </h2>
          {selected.budget && (
            <dl className="flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ridge">{t('budget.fuel')}</dt>
                <dd className="font-mono text-trail">{selected.budget.fuel_eur} €</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ridge">{t('budget.tolls')}</dt>
                <dd className="font-mono text-trail">{eurRange(selected.budget.tolls_eur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ridge">{t('budget.nights')}</dt>
                <dd className="font-mono text-trail">{eurRange(selected.budget.nights_eur)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ridge">{t('budget.meals')}</dt>
                <dd className="font-mono text-trail">{eurRange(selected.budget.meals_eur)}</dd>
              </div>
              {selected.budget.activities_eur > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ridge">{t('budget.activities')}</dt>
                  <dd className="font-mono text-trail">{selected.budget.activities_eur} €</dd>
                </div>
              )}
              <div className="mt-1 flex justify-between border-t border-mist pt-2 font-semibold">
                <dt className="text-trail">{t('budget.total')}</dt>
                <dd className="font-mono text-trail">{eurRange(selected.budget.total_eur)}</dd>
              </div>
            </dl>
          )}
          {selected.co2_kg !== undefined && selected.co2_kg > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-ridge">
              <Leaf size={15} className="text-pine" aria-hidden="true" />
              <span>
                {t('budget.co2')} <strong className="font-mono">≈ {selected.co2_kg} kg CO₂e</strong>
              </span>
            </p>
          )}
          <p className="text-xs text-fog">{t('budget.note')}</p>
        </section>
      )}

      {selected.days && selected.days.length > 0 && (
        <>
          <WeatherStrip trip={selected} plan={plan} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              aria-pressed={editing}
              className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
                editing
                  ? 'border-summit bg-summit/10 text-copper-deep'
                  : 'border-mist text-trail hover:border-summit'
              }`}
            >
              <Pencil size={15} aria-hidden="true" />
              {editing ? t('editor.done') : t('editor.edit')}
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={undo}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-mist px-4 py-2.5 text-sm font-semibold text-trail transition-colors hover:border-summit"
              >
                <Undo2 size={15} aria-hidden="true" />
                {t('editor.undo')}
              </button>
            )}
            {recomputing && (
              <span className="text-xs text-fog" aria-live="polite">
                {t('editor.recomputing')}
              </span>
            )}
            {recomputeError && !recomputing && (
              <span role="alert" className="text-xs font-semibold text-storm">
                {t('editor.recompute_error')}
              </span>
            )}
          </div>

          {editing ? (
            <DayEditor days={selected.days} busy={recomputing} onChange={onDaysChange} />
          ) : (
            <DayCards days={selected.days} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
          )}

          <TripEditChat
            trip={selected}
            lang={lang}
            plan={plan}
            onBeforeApply={pushHistory}
            onApply={(payload) => {
              applyRecomputed(payload);
              const current = useTripStore.getState().selected;
              if (saved && current) void updateTrip(saved.id, current, plan);
            }}
          />
        </>
      )}

      {(!selected.days || selected.days.length === 0) && (
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
              <span className="font-mono text-xs font-semibold text-copper-deep">
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
      )}
    </main>
  );
}
