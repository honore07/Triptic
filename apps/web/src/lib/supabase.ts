import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Client Supabase (auth uniquement — les données restent sur l'API TRIPTIC).
 * null si les variables VITE_SUPABASE_* manquent (dev sans auth) : l'UI
 * masque alors les écrans de compte et l'app reste utilisable en anonyme.
 */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
