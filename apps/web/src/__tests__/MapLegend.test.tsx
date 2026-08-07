import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapLegend } from '../components/MapLegend';
import { segmentLineStyle } from '../lib/mapStyles';
import { setLang } from '../lib/i18n';

describe('MapLegend', () => {
  it('ne rend rien avec moins de 2 modes', () => {
    setLang('fr');
    const single = render(<MapLegend modes={['car']} />);
    expect(single.container).toBeEmptyDOMElement();
    const none = render(<MapLegend modes={[]} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it('affiche un échantillon de ligne et un libellé par mode', () => {
    setLang('fr');
    render(<MapLegend modes={['car', 'foot', 'bike']} />);
    const legend = screen.getByRole('group', { name: 'Légende des modes de déplacement' });
    expect(legend).toHaveTextContent('Voiture');
    expect(legend).toHaveTextContent('Rando');
    expect(legend).toHaveTextContent('Vélo');
    const lines = legend.querySelectorAll('svg line');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toHaveAttribute('stroke', segmentLineStyle('car').color);
    expect(lines[0]).not.toHaveAttribute('stroke-dasharray'); // voiture : trait plein
    expect(lines[1]).toHaveAttribute('stroke-dasharray'); // rando : pointillé
  });

  it('est traduite (parité fr/en/de)', () => {
    setLang('de');
    render(<MapLegend modes={['car', 'foot']} />);
    const legend = screen.getByRole('group', { name: 'Legende der Fortbewegungsarten' });
    expect(legend).toHaveTextContent('Auto');
    expect(legend).toHaveTextContent('Wanderung');
  });
});
