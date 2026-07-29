import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '../App';
import { setLang } from '../lib/i18n';

// Cartes Mapbox hors du périmètre de ces tests (jsdom)
vi.mock('../components/MapView', () => ({ MapView: () => null }));
vi.mock('../components/ExploreMap', () => ({ ExploreMap: () => null }));

describe('App', () => {
  beforeEach(() => {
    setLang('fr');
  });

  it('affiche la page 404 avec un lien retour accueil sur une route inconnue (QA 1.6)', () => {
    window.history.pushState({}, '', '/route-inexistante');
    render(<App />);
    expect(screen.getByText(/Cette page n'existe pas/)).toBeInTheDocument();
    const home = screen.getByRole('link', { name: /Retour à l'accueil/ });
    expect(home).toHaveAttribute('href', '/');
  });

  it('synchronise <html lang> avec la langue active (QA 2.1)', () => {
    setLang('de');
    expect(document.documentElement.lang).toBe('de');
    setLang('en');
    expect(document.documentElement.lang).toBe('en');
    setLang('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
