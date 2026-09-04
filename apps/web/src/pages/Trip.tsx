import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, Leaf, Pencil, Share2, Undo2, Wallet } from 'lucide-react';
import type { Lang, TripDay } from '@triptic/shared';
import { track } from '../lib/analytics';
import { saveTrip, updateTrip } from '../lib/api';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
import { DayCards } from '../components/DayCards';
import { DayEditor } from '../components/DayEditor';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { Etape } from '../components/Etape';
import { GPXExportButton } from '../components/GPXExportButton';
import { MapView } from '../components/MapView';
import { RoutePreview } from '../components/RoutePreview';
import { MAP_COLORS } from '../lib/mapColors';
import { Nuitee } from '../components/Nuitee';
import { TripEditChat } from '../components/TripEditChat';
import { WeatherStrip } from '../components/WeatherStrip';
import type { WeatherDayPayload } from '../lib/api';
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
  const units = useProfileStore((s) => s.units);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState(false);
  /** URL publique affichée en fallback quand le presse-papiers est indisponible. */
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  /** Prévisions chargées par le bandeau météo — l'heure par heure de l'étape en vient. */
  const [weatherDays, setWeatherDays] = useState<WeatherDayPayload[] | null>(null);
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
  // La nuitée ne se propose que sur une journée ouverte : sans choix, pas de
  // liste d'emplacements en vrac sous l'itinéraire.
  const nightDay = selectedDay === null ? null : (selected.days?.find((d) => d.day === selectedDay) ?? null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <Link to="/plan" className="flex items-center gap-1 text-sm text-ridge hover:text-summit">
        <ArrowLeft size={16} aria-hidden="true" />
        {t('trips.back')}
      </Link>

      {/* Tête d'itinéraire — la photo réelle de la vire choisie, plein cadre :
       * c'est le terrain, la seule image non gravée avec la carte. Le relevé
       * se pose sur l'encre du bas ; sans photo, le tracé se dessine sur
       * l'encre. */}
      <header className="hero-open relative -mx-4 overflow-hidden border-y border-mist bg-trail text-cloud sm:mx-0 sm:border">
        <div aria-hidden="true" className="absolute inset-0">
          {selected.photo_url ? (
            <img
              src={selected.photo_url}
              alt=""
              fetchPriority="high"
              className="hero-drift h-full w-full object-cover"
            />
          ) : (
            <RoutePreview
              waypoints={selected.waypoints}
              className="h-full w-full p-10 opacity-60"
              stroke={MAP_COLORS.gold}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(17,17,17,0.45)_0%,rgba(17,17,17,0.10)_24%,rgba(17,17,17,0.80)_50%,rgba(17,17,17,0.94)_68%,rgba(17,17,17,0.97)_100%)]" />
        </div>

        <div className="relative flex min-h-[22rem] flex-col justify-end gap-4 p-4 sm:min-h-[26rem] sm:p-6">
          <div className="absolute inset-x-4 top-4 flex items-center justify-between sm:inset-x-6 sm:top-5">
            <p className="label-mono flex items-center gap-2 border border-cloud/30 bg-trail/80 py-1 pl-1 pr-2.5 text-cloud">
              {/* Carte et règle — l'outil de celui qui relève un itinéraire */}
              <img
                src="/vire/vire_nav-carte.webp"
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-6 w-6 shrink-0 rounded-full border border-cloud/40 object-cover"
              />
              {t('itineraire.plate')}
            </p>
            <div className="flex items-center gap-2">
              <span className="label-mono border border-cloud/30 bg-trail/80 px-2 py-1 text-gold">
                {t(`mode.${selected.mode}`)}
              </span>
              <DifficultyBadge level={selected.difficulty} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="on-photo font-display text-3xl font-semibold leading-tight text-cloud sm:text-5xl">
              {selected.title}
            </h1>
            <p className="max-w-2xl font-display text-base italic leading-snug text-sky sm:text-lg">
              {selected.summary}
            </p>
          </div>

          {/* Relevé de l'itinéraire — étiquettes mono, valeurs en serif, sur l'encre */}
          <dl className="grid grid-cols-2 divide-cloud/25 border-y border-cloud/30 sm:grid-cols-4 sm:divide-x">
            {[
              {
                label: t('trips.days'),
                value: t('trips.days_count', { count: selected.duration_days }),
              },
              { label: t('trips.distance'), value: formatDistance(selected.distance_km, units) },
              {
                label: t('trips.elevation'),
                value: formatElevation(selected.elevation_gain_m, units),
              },
              {
                label: t('trips.per_day'),
                value: formatDistance(selected.daily_distance_km, units),
              },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5 px-2.5 py-2.5">
                <dt className="label-mono text-cloud/65">{label}</dt>
                <dd className="font-display text-xl font-semibold leading-none text-cloud">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <MapView
        waypoints={selected.waypoints}
        days={selected.days}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          onClick={onSave}
          disabled={isSaved}
          className="cta-plate flex min-h-11 items-center justify-center gap-2 px-4 py-2.5 disabled:translate-y-0 disabled:bg-pine disabled:text-snow"
        >
          <Bookmark size={16} aria-hidden="true" />
          {isSaved ? t('trips.saved') : t('trips.save')}
        </button>
        <GPXExportButton tripId={saved?.id ?? null} title={selected.title} />
        <button
          type="button"
          onClick={onShare}
          className="cta-plate-ghost flex min-h-11 items-center justify-center gap-2 px-4 py-2.5"
        >
          <Share2 size={16} aria-hidden="true" />
          {copied ? t('trips.copied') : t('trips.share')}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="border border-storm-deep bg-storm-tint px-4 py-3 text-sm font-semibold text-storm-deep">
          {t('trips.error_action')}
        </p>
      )}

      {shareUrl && (
        <div className="flex flex-col gap-1.5 border border-mist bg-snow p-4">
          <p className="text-sm text-ridge">{t('trips.copy_manual')}</p>
          <input
            type="text"
            readOnly
            value={shareUrl}
            aria-label={t('trips.share')}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full border border-mist bg-terrain px-3 py-2.5 font-mono text-xs text-trail"
          />
        </div>
      )}

      {selected.days && selected.days.length > 0 && (
        <>
          <WeatherStrip trip={selected} plan={plan} onLoaded={setWeatherDays} />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              aria-pressed={editing}
              className={`flex min-h-11 items-center gap-2 px-4 py-2.5 ${
                editing ? 'cta-plate' : 'cta-plate-ghost'
              }`}
            >
              <Pencil size={15} aria-hidden="true" />
              {editing ? t('editor.done') : t('editor.edit')}
            </button>
            {history.length > 0 && (
              <button
                type="button"
                onClick={undo}
                className="cta-plate-ghost flex min-h-11 items-center gap-2 px-4 py-2.5"
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

          {/* Fiche d'étape (PL.11) puis nuitée (PL.10) — pour la journée ouverte */}
          {!editing && nightDay && (
            <Etape
              day={nightDay}
              startDate={selected.start_date}
              forecast={weatherDays?.find((d) => d.day === nightDay.day)?.forecast ?? null}
            />
          )}

          {!editing && nightDay && (
            <Nuitee
              day={nightDay}
              onAdd={(activity) =>
                onDaysChange(
                  selected.days!.map((d) =>
                    d.day === nightDay.day ? { ...d, activities: [...d.activities, activity] } : d,
                  ),
                )
              }
            />
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


      {(!selected.days || selected.days.length === 0) && (
      <section aria-labelledby="waypoints-title" className="flex flex-col gap-2">
        <h2 id="waypoints-title" className="font-display text-xl font-bold text-trail">
          {t('trips.waypoints_title')}
        </h2>
        <ol className="flex flex-col gap-1.5">
          {sortedWaypoints.map((waypoint, i) => (
            <li
              key={`${waypoint.name}-${i}`}
              className="flex items-center gap-3 border border-b-0 border-mist bg-snow px-4 py-2.5 text-sm last:border-b"
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
