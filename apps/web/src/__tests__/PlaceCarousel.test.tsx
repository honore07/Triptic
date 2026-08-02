import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlaceCarousel } from '../components/PlaceCarousel';
import { createPlaceMarker, markerColor } from '../components/MapView';
import { MAP_COLORS } from '../lib/mapColors';
import { setLang } from '../lib/i18n';
import type { PlacePhoto } from '../lib/api';

const photo = (n: number): PlacePhoto => ({
  url: `https://img/${n}`,
  thumb: `https://img/${n}-t`,
  author: `Auteur ${n}`,
  link: `https://unsplash.com/${n}`,
  source: 'unsplash',
});

describe('PlaceCarousel', () => {
  it('affiche le compteur et navigue en boucle', () => {
    setLang('fr');
    render(
      <PlaceCarousel title="Colmar" photos={[photo(1), photo(2)]} loading={false} onClose={vi.fn()} />,
    );
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Photo suivante'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    // boucle : après la dernière on revient à la première
    fireEvent.click(screen.getByLabelText('Photo suivante'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Photo précédente'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('crédite l’auteur avec un lien vers la source', () => {
    setLang('fr');
    render(<PlaceCarousel title="Colmar" photos={[photo(1)]} loading={false} onClose={vi.fn()} />);
    const credit = screen.getByRole('link', { name: 'Auteur 1' });
    expect(credit).toHaveAttribute('href', 'https://unsplash.com/1');
    expect(credit).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('masque les flèches avec une seule photo', () => {
    setLang('fr');
    render(<PlaceCarousel title="Colmar" photos={[photo(1)]} loading={false} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Photo suivante')).not.toBeInTheDocument();
  });

  it('affiche le chargement puis l’état vide', () => {
    setLang('fr');
    const { rerender } = render(
      <PlaceCarousel title="Colmar" photos={[]} loading onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<PlaceCarousel title="Colmar" photos={[]} loading={false} onClose={vi.fn()} />);
    expect(screen.getByText(/Aucune photo disponible/)).toBeInTheDocument();
  });

  it('se ferme au clic et à Escape', () => {
    setLang('fr');
    const onClose = vi.fn();
    render(<PlaceCarousel title="Colmar" photos={[photo(1)]} loading={false} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Fermer les photos'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('marqueurs de lieu', () => {
  const waypoint = { name: 'Colmar', lat: 48, lng: 7, day: 1, kind: 'stage' as const };

  it('affiche la vignette photo quand le jour en a une', () => {
    const el = createPlaceMarker(waypoint, MAP_COLORS.summit, 'https://img/day1', 'Voir Colmar');
    const img = el.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://img/day1');
    expect(img?.getAttribute('alt')).toBe('');
    expect(el.getAttribute('aria-label')).toBe('Voir Colmar');
  });

  it('retombe sur une pastille pleine sans photo', () => {
    const el = createPlaceMarker(waypoint, MAP_COLORS.summit, undefined, 'Voir Colmar');
    expect(el.querySelector('img')).toBeNull();
    expect(el.style.backgroundColor).not.toBe('');
  });

  it('code la couleur par type de point', () => {
    expect(markerColor('start')).toBe(MAP_COLORS.pine);
    expect(markerColor('end')).toBe(MAP_COLORS.storm);
    expect(markerColor('camp')).toBe(MAP_COLORS.trail);
    expect(markerColor('stage')).toBe(MAP_COLORS.summit);
  });
});
