/**
 * Télécharge des images en tâche de fond pour qu'elles s'affichent sans attente
 * quand l'écran qui les montre s'ouvre. Rien en mode économie de données : un
 * forfait mobile ne doit pas payer des photos qu'on n'ouvrira peut-être pas.
 */
export function preloadImages(urls: readonly (string | null | undefined)[]): void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  if (connection?.saveData) return;
  for (const url of new Set(urls.filter((u): u is string => Boolean(u)))) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }
}
