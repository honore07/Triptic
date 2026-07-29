import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalAttributions } from '../pages/LegalAttributions';
import { setLang } from '../lib/i18n';

describe('LegalAttributions', () => {
  beforeEach(() => {
    setLang('fr');
  });

  it('affiche le titre de la page (fr)', () => {
    render(<LegalAttributions />);
    expect(
      screen.getByRole('heading', { level: 1, name: /Attributions & licences/ }),
    ).toBeInTheDocument();
  });

  it('liste toutes les sources de données utilisées', () => {
    render(<LegalAttributions />);
    const sources = [
      /OpenStreetMap/,
      /DATAtourisme/,
      /Wikidata/,
      /Geotrek/,
      /Open-Meteo/,
      /Copernicus DEM GLO-30/,
      /Unsplash & Pexels/,
      /ADEME/,
      /Mapbox/,
    ];
    for (const name of sources) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('fournit des liens externes vers les producteurs et licences', () => {
    render(<LegalAttributions />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(9);
    for (const link of links) {
      expect(link).toHaveAttribute('href', expect.stringMatching(/^https:\/\//));
      expect(link).toHaveAttribute('rel', 'noreferrer');
    }
  });

  it('mentionne les licences clés (ODbL, CC0, CC BY, Licence Ouverte)', () => {
    render(<LegalAttributions />);
    expect(screen.getByText(/ODbL 1\.0/)).toBeInTheDocument();
    expect(screen.getByText(/CC0 1\.0/)).toBeInTheDocument();
    expect(screen.getAllByText(/CC BY 4\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Licence Ouverte/).length).toBeGreaterThanOrEqual(2);
  });
});
