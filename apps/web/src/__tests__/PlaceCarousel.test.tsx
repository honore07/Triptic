import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PlaceCarousel } from '../components/PlaceCarousel';
import { createPlaceMarker, markerColor } from '../components/MapView';
import { MAP_COLORS } from '../lib/mapColors';
import { setLang } from '../lib/i18n';
import type { PlaceMedia } from '../lib/api';

const photo = (n: number): PlaceMedia => ({
  type: 'photo',
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
      <PlaceCarousel title="Colmar" media={[photo(1), photo(2)]} loading={false} onClose={vi.fn()} />,
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
    render(<PlaceCarousel title="Colmar" media={[photo(1)]} loading={false} onClose={vi.fn()} />);
    const credit = screen.getByRole('link', { name: 'Auteur 1' });
    expect(credit).toHaveAttribute('href', 'https://unsplash.com/1');
    expect(credit).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('masque les flèches avec une seule photo', () => {
    setLang('fr');
    render(<PlaceCarousel title="Colmar" media={[photo(1)]} loading={false} onClose={vi.fn()} />);
    expect(screen.queryByLabelText('Photo suivante')).not.toBeInTheDocument();
  });

  it('affiche le chargement puis l’état vide', () => {
    setLang('fr');
    const { rerender } = render(
      <PlaceCarousel title="Colmar" media={[]} loading onClose={vi.fn()} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    rerender(<PlaceCarousel title="Colmar" media={[]} loading={false} onClose={vi.fn()} />);
    expect(screen.getByText(/Aucune photo disponible/)).toBeInTheDocument();
  });

  it('lit les vidéos dans un lecteur, sans précharger', () => {
    setLang('fr');
    const video: PlaceMedia = {
      type: 'video',
      url: 'https://vid/1.mp4',
      thumb: 'https://vid/1-poster.jpg',
      author: 'Réalisateur 1',
      link: 'https://pexels.com/v1',
      source: 'pexels',
    };
    const { container } = render(
      <PlaceCarousel title="Colmar" media={[photo(1), video]} loading={false} onClose={vi.fn()} />,
    );
    // 1re vue : photo
    expect(container.querySelector('video')).toBeNull();
    fireEvent.click(screen.getByLabelText('Photo suivante'));
    const player = container.querySelector('video');
    expect(player).not.toBeNull();
    expect(player).toHaveAttribute('src', 'https://vid/1.mp4');
    expect(player).toHaveAttribute('poster', 'https://vid/1-poster.jpg');
    // données mobiles : rien ne se télécharge avant lecture
    expect(player).toHaveAttribute('preload', 'none');
    expect(screen.getByRole('link', { name: 'Réalisateur 1' })).toHaveAttribute(
      'href',
      'https://pexels.com/v1',
    );
  });

  it('se ferme au clic et à Escape', () => {
    setLang('fr');
    const onClose = vi.fn();
    render(<PlaceCarousel title="Colmar" media={[photo(1)]} loading={false} onClose={onClose} />);
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
