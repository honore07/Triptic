import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { TripRequest } from '@triptic/shared';
import { RequestChips } from '../components/RequestChips';
import { setLang } from '../lib/i18n';

const REQUEST: TripRequest = {
  departure: 'Colmar',
  destination: 'Vosges',
  duration_days: 4,
  modes: ['roadtrip'],
  difficulty: 'medium',
  group_type: 'solo',
  vehicle: 'van',
  avoid_crowds: false,
  camping: true,
  budget: 'low',
  physical_level: 3,
  constraints: [],
  style: [],
};

describe('RequestChips (onboarding hybride 1.1)', () => {
  it('affiche les paramètres détectés, pas de CTA tant que rien ne change', () => {
    setLang('fr');
    render(<RequestChips request={REQUEST} busy={false} onRegenerate={() => {}} />);
    expect(screen.getByText(/Difficulté · Modéré/)).toBeInTheDocument();
    expect(screen.getByText(/4 jours/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Régénérer/ })).not.toBeInTheDocument();
  });

  it('1 tap cycle la difficulté vers la valeur d’enum suivante (jamais de texte re-parsé)', () => {
    setLang('fr');
    const onRegenerate = vi.fn();
    render(<RequestChips request={REQUEST} busy={false} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /Difficulté/ }));
    expect(screen.getByText(/Difficulté · Difficile/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Régénérer/ }));
    expect(onRegenerate).toHaveBeenCalledWith({ difficulty: 'hard' });
  });

  it('le stepper de durée reste borné et envoie un entier', () => {
    setLang('fr');
    const onRegenerate = vi.fn();
    render(<RequestChips request={REQUEST} busy={false} onRegenerate={onRegenerate} />);
    fireEvent.click(screen.getByRole('button', { name: /Un jour de plus/ }));
    fireEvent.click(screen.getByRole('button', { name: /Un jour de plus/ }));
    expect(screen.getByText(/6 jours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Régénérer/ }));
    expect(onRegenerate).toHaveBeenCalledWith({ duration_days: 6 });
  });

  it('bascule les booléens (switch accessibles)', () => {
    setLang('fr');
    const onRegenerate = vi.fn();
    render(<RequestChips request={REQUEST} busy={false} onRegenerate={onRegenerate} />);
    const crowds = screen.getByRole('switch', { name: /Éviter la foule/ });
    expect(crowds).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(crowds);
    expect(screen.getByRole('switch', { name: /Éviter la foule/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Régénérer/ }));
    expect(onRegenerate).toHaveBeenCalledWith({ avoid_crowds: true });
  });

  it('traduit en anglais', () => {
    setLang('en');
    render(<RequestChips request={REQUEST} busy={false} onRegenerate={() => {}} />);
    expect(screen.getByText('Detected settings')).toBeInTheDocument();
    setLang('fr');
  });
});
