import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { PlacePhoto } from '../lib/api';

interface Props {
  title: string;
  photos: PlacePhoto[];
  loading: boolean;
  onClose: () => void;
}

/**
 * Carrousel de photos réelles d'un lieu, ouvert depuis un marqueur de la
 * carte. Crédit auteur affiché sur chaque vue (exigé par Unsplash & Pexels).
 */
export function PlaceCarousel({ title, photos, loading, onClose }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Nouveau lieu → on repart de la première photo
  useEffect(() => setIndex(0), [title]);
  useEffect(() => closeRef.current?.focus(), []);

  const count = photos.length;
  const go = (delta: number) => setIndex((i) => (i + delta + count) % count);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (count > 1 && e.key === 'ArrowRight') go(1);
      if (count > 1 && e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, onClose]);

  const photo = photos[index];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('carousel.label', { place: title })}
      className="pointer-events-auto absolute inset-x-3 bottom-3 z-10 flex max-h-[calc(100%-1.5rem)] w-auto flex-col overflow-hidden rounded-trip bg-snow shadow-xl sm:inset-x-auto sm:bottom-3 sm:right-4 sm:top-3 sm:w-72"
    >
      <div className="flex items-start justify-between gap-2 px-3 py-2">
        <p className="min-w-0 truncate font-display text-sm font-bold text-trail">{title}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('carousel.close')}
          className="-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-ridge hover:bg-terrain"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      {loading && (
        <p className="px-3 pb-3 text-xs text-fog" role="status">
          {t('carousel.loading')}
        </p>
      )}

      {!loading && count === 0 && (
        <p className="px-3 pb-3 text-xs text-fog">{t('carousel.empty')}</p>
      )}

      {!loading && photo && (
        <>
          <div className="relative min-h-0 flex-1">
            <img
              src={photo.url}
              alt={t('carousel.photo_alt', { place: title, n: index + 1 })}
              className="h-full max-h-64 min-h-32 w-full object-cover"
            />
            <span className="absolute left-2 top-2 rounded-full bg-trail/85 px-2 py-0.5 font-mono text-[11px] font-semibold text-snow">
              {index + 1} / {count}
            </span>
            {count > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label={t('carousel.prev')}
                  className="absolute left-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-snow/90 text-trail shadow hover:bg-snow"
                >
                  <ChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label={t('carousel.next')}
                  className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-snow/90 text-trail shadow hover:bg-snow"
                >
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          <p className="px-3 py-2 text-[11px] text-fog">
            <a
              href={photo.link}
              target="_blank"
              rel="noreferrer noopener"
              className="underline hover:text-ridge"
            >
              {photo.author}
            </a>{' '}
            — {photo.source === 'unsplash' ? 'Unsplash' : 'Pexels'}
          </p>
        </>
      )}
    </div>
  );
}
