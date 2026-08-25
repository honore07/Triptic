/**
 * Préparation d'une photo de profil côté navigateur.
 *
 * Il n'y a pas de stockage d'images côté serveur : la photo vit dans le
 * navigateur (localStorage, via profileStore). Elle est donc recadrée au
 * carré et compressée AVANT stockage — une photo d'appareil brute ferait
 * plusieurs Mo et remplirait le quota à elle seule.
 */

/** Côté du carré stocké — suffit pour un médaillon, même en haute densité. */
export const PHOTO_SIZE = 256;

/** Au-delà, on refuse de lire le fichier : ce n'est pas une photo de profil. */
export const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

export type PhotoError = 'not_an_image' | 'too_large' | 'unreadable';

/**
 * Recadre au carré (centre) et encode en JPEG compact.
 * Rejette avec un PhotoError — l'appelant affiche un message traduit.
 */
export async function toSquareDataUrl(file: File, size = PHOTO_SIZE): Promise<string> {
  if (!file.type.startsWith('image/')) throw 'not_an_image' as PhotoError;
  if (file.size > MAX_SOURCE_BYTES) throw 'too_large' as PhotoError;

  const source = await readAsDataUrl(file);
  const image = await loadImage(source);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw 'unreadable' as PhotoError;

  // Recadrage « cover » : on prend le plus grand carré centré de la source
  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', 0.82);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject('unreadable' as PhotoError);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject('unreadable' as PhotoError);
    image.src = src;
  });
}
