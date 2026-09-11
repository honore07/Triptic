import { afterEach, describe, expect, it } from 'vitest';
import { linkErrorInUrl, recoveryLinkInUrl } from '../lib/authLinks';

describe('liens d’email Supabase', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('reconnaît le retour d’un lien « mot de passe oublié »', () => {
    window.history.replaceState(null, '', '/login#access_token=a&refresh_token=b&type=recovery');
    expect(recoveryLinkInUrl()).toBe(true);
    expect(linkErrorInUrl()).toBe(false);
  });

  it('un lien de confirmation d’inscription n’est pas une réinitialisation', () => {
    window.history.replaceState(null, '', '/login#access_token=a&refresh_token=b&type=signup');
    expect(recoveryLinkInUrl()).toBe(false);
  });

  it('repère un lien expiré ou déjà servi', () => {
    window.history.replaceState(null, '', '/login#error=access_denied&error_code=otp_expired');
    expect(linkErrorInUrl()).toBe(true);
    expect(recoveryLinkInUrl()).toBe(false);
  });
});
