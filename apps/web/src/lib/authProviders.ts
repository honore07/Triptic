const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let googleEnabled: Promise<boolean> | null = null;

/**
 * Le fournisseur Google est-il activé sur le projet Supabase ? Lu sur ses
 * réglages publics : le bouton n'apparaît que s'il mène quelque part.
 */
export function isGoogleEnabled(): Promise<boolean> {
  if (!url || !key) return Promise.resolve(false);
  googleEnabled ??= fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    .then((res) => (res.ok ? (res.json() as Promise<{ external?: { google?: boolean } }>) : null))
    .then((settings) => settings?.external?.google === true)
    .catch(() => false);
  return googleEnabled;
}
