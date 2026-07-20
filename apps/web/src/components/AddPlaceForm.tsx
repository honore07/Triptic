import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LocateFixed, MapPinPlus, Send } from 'lucide-react';
import { submitPlace } from '../lib/api';

/** Types proposables par les utilisateurs (sous-ensemble UI de PlaceKind). */
const KINDS = [
  'waterfall',
  'viewpoint',
  'lake',
  'peak',
  'refuge',
  'camp',
  'castle',
  'village',
  'poi',
] as const;

type Status = 'idle' | 'sending' | 'pending' | 'merged' | 'error';

/**
 * AddPlaceForm — contribution utilisateur à la base de lieux (phase E).
 * Le lieu entre en statut "pending" côté serveur et sera modéré avant
 * d'alimenter les générations de trips.
 */
export function AddPlaceForm() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('waterfall');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [summary, setSummary] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition((pos) => {
      setLat(pos.coords.latitude.toFixed(5));
      setLng(pos.coords.longitude.toFixed(5));
    });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    try {
      const result = await submitPlace({
        name: name.trim(),
        kind,
        lat: Number(lat),
        lng: Number(lng),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
      });
      setStatus(result);
      if (result === 'pending') {
        setName('');
        setSummary('');
      }
    } catch {
      setStatus('error');
    }
  };

  const inputClass =
    'w-full rounded-xl border border-mist bg-snow px-3 py-2.5 text-sm text-trail placeholder:text-fog focus:border-summit focus:outline-none focus:ring-2 focus:ring-summit/30';

  return (
    <section
      aria-labelledby="add-place-title"
      className="fade-up rounded-trip border border-mist bg-snow p-5 shadow-lg sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/20">
          <MapPinPlus size={18} className="text-copper-deep" aria-hidden="true" />
        </span>
        <div>
          <h2 id="add-place-title" className="font-display text-lg font-bold text-trail">
            {t('places.title')}
          </h2>
          <p className="text-xs text-ridge">{t('places.hint')}</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="place-name" className="text-sm font-semibold text-trail">
            {t('places.name_label')}
          </label>
          <input
            id="place-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('places.name_placeholder')}
            required
            minLength={2}
            maxLength={120}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place-kind" className="text-sm font-semibold text-trail">
            {t('places.kind_label')}
          </label>
          <select
            id="place-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className={inputClass}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`places.kind_${k}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="place-lat" className="text-sm font-semibold text-trail">
              {t('places.lat_label')}
            </label>
            <input
              id="place-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              required
              className={`${inputClass} font-mono`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="place-lng" className="text-sm font-semibold text-trail">
              {t('places.lng_label')}
            </label>
            <input
              id="place-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              required
              className={`${inputClass} font-mono`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={useMyLocation}
          className="flex items-center gap-1.5 self-start text-sm font-semibold text-copper-deep hover:underline"
        >
          <LocateFixed size={15} aria-hidden="true" />
          {t('places.use_location')}
        </button>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="place-summary" className="text-sm font-semibold text-trail">
            {t('places.summary_label')}
          </label>
          <textarea
            id="place-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t('places.summary_placeholder')}
            maxLength={200}
            rows={2}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'sending'}
          className="glow-cta flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3 font-display font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:opacity-60"
        >
          <Send size={18} aria-hidden="true" />
          {status === 'sending' ? t('places.sending') : t('places.submit')}
        </button>

        <p aria-live="polite" className="min-h-5 text-sm">
          {status === 'pending' && (
            <span className="font-semibold text-pine">{t('places.success_pending')}</span>
          )}
          {status === 'merged' && (
            <span className="font-semibold text-ridge">{t('places.success_merged')}</span>
          )}
          {status === 'error' && (
            <span className="font-semibold text-storm">{t('places.error')}</span>
          )}
        </p>
      </form>
    </section>
  );
}
