import { useTranslation } from 'react-i18next';
import type { Difficulty } from '@triptic/shared';

const STYLES: Record<Difficulty, string> = {
  easy: 'bg-pine/15 text-pine',
  medium: 'bg-amber/15 text-amber',
  hard: 'bg-storm/15 text-storm',
};

export function DifficultyBadge({ level }: { level: Difficulty }) {
  const { t } = useTranslation();
  return (
    <span
      className={`inline-block rounded-badge px-2 py-0.5 text-xs font-semibold ${STYLES[level]}`}
    >
      {t(`difficulty.${level}`)}
    </span>
  );
}
