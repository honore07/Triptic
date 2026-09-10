import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';

/**
 * Une session ouverte par le lien « mot de passe oublié » ne sert qu'à une
 * chose : choisir le nouveau mot de passe. Toute autre page ramène à la
 * connexion tant qu'il n'est pas enregistré — y compris quand Supabase renvoie
 * vers l'accueil au lieu de /login. On attend que supabase-js ait lu le lien
 * (authReady) : naviguer avant effacerait les jetons de l'URL.
 */
export function RecoveryGuard() {
  const recovery = useUserStore((s) => s.recovery);
  const authReady = useUserStore((s) => s.authReady);
  const { pathname } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (recovery && authReady && pathname !== '/login') navigate('/login', { replace: true });
  }, [recovery, authReady, pathname, navigate]);

  return null;
}
