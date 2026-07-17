import { useTranslation } from 'react-i18next';
import type { Lang } from '@triptic/shared';
import { setLang } from '../lib/i18n';

const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
];

export function LangSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <div role="group" aria-label={t('lang.label')} className="flex gap-1">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={i18n.language === code}
          className={`min-h-8 rounded-badge px-2 py-1 font-mono text-xs transition-colors ${
            i18n.language === code
              ? 'bg-summit text-snow'
              : 'text-ridge hover:bg-mist/50'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
