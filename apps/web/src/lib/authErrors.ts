/** Clés i18n `auth.*` des erreurs Supabase Auth que l'interface sait expliquer. */
export type AuthErrorKey =
  | 'error_invalid'
  | 'error_not_confirmed'
  | 'error_exists'
  | 'error_weak_password'
  | 'error_rate_limit'
  | 'error_same_password'
  | 'error_email_invalid'
  | 'error_signup_disabled'
  | 'error_generic';

const BY_CODE = new Map<string, AuthErrorKey>([
  ['invalid_credentials', 'error_invalid'],
  ['email_not_confirmed', 'error_not_confirmed'],
  ['email_exists', 'error_exists'],
  ['user_already_exists', 'error_exists'],
  ['weak_password', 'error_weak_password'],
  ['over_email_send_rate_limit', 'error_rate_limit'],
  ['over_request_rate_limit', 'error_rate_limit'],
  ['same_password', 'error_same_password'],
  ['email_address_invalid', 'error_email_invalid'],
  ['signup_disabled', 'error_signup_disabled'],
]);

/**
 * Traduit une erreur Supabase Auth en message actionnable. Le `code` fait foi
 * (le texte anglais de Supabase change) ; un 429 sans code reste une limite.
 */
export function authErrorKey(error: unknown): AuthErrorKey {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  const key = typeof code === 'string' ? BY_CODE.get(code) : undefined;
  if (key) return key;
  return status === 429 ? 'error_rate_limit' : 'error_generic';
}
