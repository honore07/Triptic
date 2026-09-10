/**
 * Retour d'un lien d'email Supabase. En flux implicite (défaut de supabase-js),
 * le type de lien et les jetons arrivent dans le fragment de l'URL.
 */
function fragment(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

/** Lien « mot de passe oublié » : la session qu'il ouvre doit d'abord choisir un nouveau mot de passe. */
export function recoveryLinkInUrl(): boolean {
  return fragment().get('type') === 'recovery';
}

/** Lien d'email refusé par Supabase (expiré, déjà servi) : il revient avec `error_code` dans l'URL. */
export function linkErrorInUrl(): boolean {
  const query = new URLSearchParams(window.location.search);
  return fragment().has('error_code') || query.has('error_code');
}
