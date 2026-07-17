import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';

/** Bandeau offline — l'UX ne doit jamais bloquer sans réseau (règle #6). */
export function OnlineIndicator() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-amber px-4 py-1.5 text-xs font-medium text-snow"
    >
      <WifiOff size={14} aria-hidden="true" />
      {t('app.offline')}
    </div>
  );
}
