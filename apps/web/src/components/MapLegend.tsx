import { useTranslation } from 'react-i18next';
import type { SegmentMode } from '@triptic/shared';
import { MODE_LABEL_KEYS, segmentLineStyle } from '../lib/mapStyles';

interface Props {
  /** Modes présents sur la carte (via tripModes) — < 2 : rien à légender. */
  modes: SegmentMode[];
}

/**
 * Légende compacte des styles de tracé, posée sur la carte.
 * N'apparaît que si le trip mélange au moins 2 modes de déplacement —
 * un trip 100 % voiture n'a pas besoin qu'on lui explique son trait.
 * bottom-10 : ne recouvre jamais le logo Mapbox (coin bas-gauche, ToS).
 */
export function MapLegend({ modes }: Props) {
  const { t } = useTranslation();
  if (modes.length < 2) return null;

  return (
    <div
      role="group"
      aria-label={t('map.legend')}
      className="absolute bottom-10 left-2 z-10 flex flex-col gap-1 rounded-badge border border-mist bg-snow/95 px-2.5 py-1.5 shadow-md"
    >
      {modes.map((mode) => {
        const style = segmentLineStyle(mode);
        return (
          <div
            key={mode}
            className="flex items-center gap-2 font-body text-[11px] font-medium text-ridge"
          >
            <svg width="24" height="6" viewBox="0 0 24 6" aria-hidden="true" className="shrink-0">
              <line
                x1="1"
                y1="3"
                x2="23"
                y2="3"
                stroke={style.color}
                strokeWidth="3"
                strokeLinecap={style.dasharray ? 'butt' : 'round'}
                {...(style.dasharray
                  ? { strokeDasharray: style.dasharray.map((d) => d * 3).join(' ') }
                  : {})}
              />
            </svg>
            <span>{t(MODE_LABEL_KEYS[mode])}</span>
          </div>
        );
      })}
    </div>
  );
}
