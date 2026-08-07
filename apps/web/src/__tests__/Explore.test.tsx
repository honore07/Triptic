import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Explore } from '../pages/Explore';
import { useTripStore } from '../store/tripStore';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

// ApiError reste la vraie classe : la page l'utilise avec `instanceof`
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api');
  return {
    ApiError: actual.ApiError,
    parseExploreFilters: vi.fn(),
    searchArea: vi.fn(),
    searchTrails: vi.fn(),
    recomputeTrip: vi.fn(),
  };
});

vi.mock('../components/ExploreMap', () => ({ ExploreMap: () => <div data-testid="explore-map" /> }));

const searchArea = vi.mocked(api.searchArea);
const searchTrails = vi.mocked(api.searchTrails);
const parseExploreFilters = vi.mocked(api.parseExploreFilters);

/** Déclenche « Chercher dans cette zone ». */
const clickSearch = () =>
  fireEvent.click(screen.getByRole('button', { name: /Chercher dans cette zone/ }));

describe('Explore', () => {
  beforeEach(() => {
    setLang('fr');
    searchArea.mockReset();
    searchTrails.mockReset();
    parseExploreFilters.mockReset();
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

  it('503 db_unavailable → « recherche de lieux indisponible », pas un échec générique', async () => {
    searchArea.mockRejectedValue(new api.ApiError(503, 'db_unavailable', 'bbox search'));
    render(<Explore />);
    clickSearch();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Recherche de lieux indisponible/),
    );
    expect(screen.queryByText(/La recherche a échoué/)).not.toBeInTheDocument();
  });

  it('503 routing_unavailable (boucles rando) → message dédié au routeur', async () => {
    searchTrails.mockRejectedValue(new api.ApiError(503, 'routing_unavailable', 'trails search'));
    render(<Explore />);
    fireEvent.click(screen.getByRole('button', { name: /Boucles rando/ }));
    clickSearch();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Calcul d'itinéraires indisponible/),
    );
  });

  it('panne réseau (fetch rejeté) → message réseau, distinct du 503', async () => {
    searchArea.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Explore />);
    clickSearch();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Impossible de joindre le serveur/),
    );
  });

  it('erreur serveur (500) → message générique', async () => {
    searchArea.mockRejectedValue(new api.ApiError(500, 'places_unavailable', 'bbox search'));
    render(<Explore />);
    clickSearch();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/La recherche a échoué/));
  });

  it('les boucles rando restent servies sans base (searchTrails appelé, résultat affiché)', async () => {
    searchTrails.mockResolvedValue([
      {
        id: 'generated',
        name: null,
        summary: null,
        notoriety: 0,
        source: 'graphhopper',
        distance_km: 12.4,
        duration_min: 210,
        geometry: [[7, 48]],
        generated: true,
      },
    ]);
    render(<Explore />);
    fireEvent.click(screen.getByRole('button', { name: /Boucles rando/ }));
    clickSearch();
    await waitFor(() => expect(searchTrails).toHaveBeenCalled());
    expect(searchArea).not.toHaveBeenCalled();
    expect(await screen.findByText(/Boucle générée sur les sentiers/)).toBeInTheDocument();
  });

  it("un service de filtres HS ne bloque pas les boucles rando en amont", async () => {
    parseExploreFilters.mockRejectedValue(new api.ApiError(503, 'ai_unavailable', 'parse-filters'));
    searchTrails.mockResolvedValue([]);
    render(<Explore />);
    fireEvent.click(screen.getByRole('button', { name: /Boucles rando/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'une boucle sympa' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trouver' }));
    await waitFor(() => expect(searchTrails).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hors boucles rando, un échec des filtres IA remonte au lieu de chercher à vide', async () => {
    parseExploreFilters.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Explore />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'se baigner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trouver' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/Impossible de joindre le serveur/),
    );
    expect(searchArea).not.toHaveBeenCalled();
  });
});
