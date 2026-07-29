import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Explore } from '../pages/Explore';
import { useTripStore } from '../store/tripStore';
import { setLang } from '../lib/i18n';

vi.mock('../lib/api', () => ({
  parseExploreFilters: vi.fn(),
  searchArea: vi.fn(),
  searchTrails: vi.fn(),
  recomputeTrip: vi.fn(),
}));

vi.mock('../components/ExploreMap', () => ({ ExploreMap: () => <div data-testid="explore-map" /> }));

describe('Explore', () => {
  beforeEach(() => {
    setLang('fr');
    useTripStore.setState({ selected: null, saved: null, history: [], recomputing: false, error: null });
  });

  it('le bouton « Trouver » a un nom accessible même quand son libellé est masqué (QA 3.1)', () => {
    render(<Explore />);
    // aria-label garantit le nom accessible sous 640px (texte hidden + icône aria-hidden)
    expect(screen.getByRole('button', { name: 'Trouver' })).toBeInTheDocument();
  });

  it('affiche une erreur visible quand la géolocalisation est indisponible (QA 1.1)', () => {
    // jsdom : navigator.geolocation est absent, comme en contexte HTTP non sécurisé
    render(<Explore />);
    fireEvent.click(screen.getByRole('button', { name: /Autour de moi/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Impossible de récupérer ta position/);
  });

  it("affiche une erreur visible quand l'utilisateur refuse la géolocalisation (QA 1.1)", () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (_ok: PositionCallback, err?: PositionErrorCallback) =>
          err?.({ code: 1, message: 'denied' } as GeolocationPositionError),
      },
    });
    try {
      render(<Explore />);
      fireEvent.click(screen.getByRole('button', { name: /Autour de moi/ }));
      expect(screen.getByRole('alert')).toHaveTextContent(/Impossible de récupérer ta position/);
    } finally {
      delete (navigator as { geolocation?: unknown }).geolocation;
    }
  });
});
