import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Releve } from '../components/Releve';
import { setLang } from '../lib/i18n';

describe('Relevé (planche PL.06 — génération)', () => {
  beforeEach(() => setLang('fr'));

  it('annonce la progression sur le vrai pipeline', () => {
    render(<Releve status="generating" />);
    const bar = screen.getByRole('progressbar', { name: 'Segments analysés' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('heading', { name: 'On trace tes trois voies.' })).toBeInTheDocument();
  });

  it('avance à chaque étape franchie', () => {
    const { rerender } = render(<Releve status="grounding" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '20');
    rerender(<Releve status="routing" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');
    rerender(<Releve status="photos" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '80');
  });

  it('une reprise de validation ne recule pas la barre', () => {
    render(<Releve status="retrying" />);
    // « retrying », c'est la validation qui reprend la main : même position
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('liste les 5 étapes du pipeline', () => {
    render(<Releve status="generating" />);
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(5);
    expect(steps[0]).toHaveTextContent('Génération des 3 itinéraires');
    expect(steps[4]).toHaveTextContent('Recherche des photos');
  });

  it('marque l’étape en cours', () => {
    render(<Releve status="validating" />);
    const steps = screen.getAllByRole('listitem');
    expect(steps[2]).toHaveTextContent('en cours');
    expect(steps[0]).not.toHaveTextContent('en cours');
  });
});
