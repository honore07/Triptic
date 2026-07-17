import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { PLANS } from '@triptic/shared';
import { downloadGpx } from '../lib/api';
import { useUserStore } from '../store/userStore';

interface Props {
  tripId: string | null;
  title: string;
}

export function GPXExportButton({ tripId, title }: Props) {
  const { t } = useTranslation();
  const { plan, openPaywall } = useUserStore();
  const [state, setState] = useState<'idle' | 'downloading'>('idle');
  const allowed = PLANS[plan].limits.gpx_export;

  const onClick = async () => {
    if (!allowed || !tripId) {
      openPaywall();
      return;
    }
    setState('downloading');
    const ok = await downloadGpx(tripId, title, plan);
    if (!ok) openPaywall();
    setState('idle');
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === 'downloading'}
      title={allowed ? t('gpx.export') : t('gpx.locked')}
      className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
        allowed
          ? 'bg-pine text-snow hover:bg-pine/90'
          : 'border border-mist text-fog hover:border-summit'
      }`}
    >
      <Download size={16} aria-hidden="true" className={state === 'downloading' ? 'animate-bounce' : ''} />
      {t('gpx.export')}
    </button>
  );
}
