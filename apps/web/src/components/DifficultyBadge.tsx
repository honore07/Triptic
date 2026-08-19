import { useTranslation } from 'react-i18next';
import type { Difficulty } from '@triptic/shared';

/*
 * Fonds opaques (tints précalculées dans styles.css) + textes *-deep :
 * contraste ≥ 4.5:1 garanti partout, y compris posé sur photo (TripCard).
 */
const STYLES: Record<Difficulty, string> = {
  easy: 'bg-pine-tint text-pine-deep',
  medium: 'bg-amber-tint text-amber-deep',
  hard: 'bg-storm-tint text-storm-deep',
};

export function DifficultyBadge({ level }: { level: Difficulty }) {
  const { t } = useTranslation();
  return (
    <span
      className={`label-mono inline-block rounded-badge px-2 py-1 ${STYLES[level]}`}
    >
      {t(`difficulty.${level}`)}
    </span>
  );
}
