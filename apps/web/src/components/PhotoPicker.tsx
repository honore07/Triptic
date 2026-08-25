import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, X } from 'lucide-react';
import { toSquareDataUrl, type PhotoError } from '../lib/photo';

interface PhotoPickerProps {
  /** Photo enregistrée (data URL) ou null. */
  value: string | null;
  /** Gravure affichée tant qu'aucune photo n'a été choisie. */
  fallback: string;
  /** Ce que représente le médaillon — sert de nom accessible au bouton. */
  label: string;
  onChange: (photo: string | null) => void;
}

/**
 * PhotoPicker — médaillon de profil (compte ou véhicule).
 * Sans photo, la gravure d'expédition tient la place. La photo choisie est
 * recadrée et compressée dans le navigateur avant d'être conservée : elle ne
 * quitte jamais l'appareil, faute de stockage d'images côté serveur.
 */
export function PhotoPicker({ value, fallback, label, onChange }: PhotoPickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [error, setError] = useState<PhotoError | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    void toSquareDataUrl(file)
      .then(onChange)
      .catch((reason: PhotoError) => setError(reason))
      .finally(() => {
        setBusy(false);
        // Vider l'input : sans ça, re-choisir le MÊME fichier ne déclenche
        // aucun change et l'utilisateur croit que rien ne s'est passé.
        if (inputRef.current) inputRef.current.value = '';
      });
  };

  return (
    <div className="flex items-center gap-3">
      <img
        src={value ?? fallback}
        alt={value ? label : ''}
        aria-hidden={value ? undefined : 'true'}
        loading="lazy"
        className="h-16 w-16 shrink-0 rounded-full border border-mist object-cover"
      />

      <div className="flex flex-col items-start gap-1">
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="cta-plate-ghost flex min-h-11 items-center gap-1.5 px-3 py-2"
        >
          <Camera size={14} aria-hidden="true" />
          {busy ? t('photo.working') : value ? t('photo.change') : t('photo.add')}
          <span className="sr-only"> — {label}</span>
        </button>

        {value && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            className="flex min-h-11 items-center gap-1 text-sm text-copper-deep underline underline-offset-2"
          >
            <X size={13} aria-hidden="true" />
            {t('photo.remove')}
            <span className="sr-only"> — {label}</span>
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-storm-deep">
          {t(`photo.error_${error}`)}
        </p>
      )}
    </div>
  );
}
