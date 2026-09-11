import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { recoveryLinkInUrl } from './authLinks';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Arrivé par le lien « mot de passe oublié ». Lu AVANT de créer le client :
 * supabase-js enregistre la session du lien puis n'annonce PASSWORD_RECOVERY
 * qu'au tour suivant — entre les deux, l'app croyait à une connexion normale
 * et quittait la page où l'on choisit le nouveau mot de passe.
 */
export const recoveryLink = recoveryLinkInUrl();

/**
 * Client Supabase (auth uniquement — les données restent sur l'API VIRE).
 * null si les variables VITE_SUPABASE_* manquent (dev sans auth) : l'UI
 * masque alors les écrans de compte et l'app reste utilisable en anonyme.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
