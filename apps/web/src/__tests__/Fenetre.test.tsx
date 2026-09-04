import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Fenetre } from '../components/Fenetre';
import { setLang } from '../lib/i18n';

/**
 * On travaille sur le mois SUIVANT : tous ses jours sont à venir, quelle que
 * soit la date d'exécution — les jours passés sont désactivés.
 */
function goToNextMonth() {
  fireEvent.click(screen.getByRole('button', { name: 'Mois suivant' }));
  return screen.getByRole('grid');
}

describe('Fenêtre (planche PL.04)', () => {
  beforeEach(() => setLang('fr'));

  it('affiche le titre de planche et la navigation de mois', () => {
    render(<Fenetre onConfirm={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Quand pars-tu ?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mois précédent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mois suivant' })).toBeInTheDocument();
  });

  it('compte les nuits de la fenêtre retenue', () => {
    render(<Fenetre onConfirm={() => {}} />);
    const grid = goToNextMonth();
    fireEvent.click(within(grid).getByText('10'));
    fireEvent.click(within(grid).getByText('14'));
    // 10 → 14 inclus = 5 jours = 4 nuits. On vise le relevé, pas la grille :
    // le mois contient lui aussi un jour « 4 ».
    const releve = screen.getByText('Nuits').parentElement as HTMLElement;
    expect(within(releve).getByText('4')).toBeInTheDocument();
  });

  it('révèle la saison et ce qu’elle rend praticable', () => {
    render(<Fenetre onConfirm={() => {}} />);
    const grid = goToNextMonth();
    fireEvent.click(within(grid).getByText('10'));
    const activities = screen.getByRole('group', { name: 'Activités de la saison' });
    // Les 7 activités de référence sont toujours montrées : les praticables en
    // plein, les autres en retrait (jamais masquées).
    expect(within(activities).getAllByText(/./).length).toBeGreaterThan(0);
    expect(within(activities).getByText('Bivouac')).toBeInTheDocument();
    expect(within(activities).getByText('Raquettes')).toBeInTheDocument();
  });

  it('transmet la fenêtre choisie', () => {
    const onConfirm = vi.fn();
    render(<Fenetre onConfirm={onConfirm} />);
    const grid = goToNextMonth();
    fireEvent.click(within(grid).getByText('10'));
    fireEvent.click(within(grid).getByText('14'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    const [dates] = onConfirm.mock.calls[0] as [{ start: string; end: string }];
    expect(dates.start).toMatch(/^\d{4}-\d{2}-10$/);
    expect(dates.end).toMatch(/^\d{4}-\d{2}-14$/);
  });

  it('laisse passer sans dates — l’IA déduira la durée', () => {
    const onConfirm = vi.fn();
    render(<Fenetre onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });

  it('un clic avant le départ redéfinit le départ', () => {
    const onConfirm = vi.fn();
    render(<Fenetre onConfirm={onConfirm} />);
    const grid = goToNextMonth();
    fireEvent.click(within(grid).getByText('14'));
    fireEvent.click(within(grid).getByText('10')); // antérieur → nouveau départ
    fireEvent.click(within(grid).getByText('18'));
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    const [dates] = onConfirm.mock.calls[0] as [{ start: string; end: string }];
    expect(dates.start).toMatch(/-10$/);
    expect(dates.end).toMatch(/-18$/);
  });

  it('un raccourci pose la fenêtre en un tap, et se relâche dès qu’on retouche le calendrier', () => {
    const onConfirm = vi.fn();
    render(<Fenetre onConfirm={onConfirm} />);
    const week = screen.getByRole('button', { name: 'Une semaine' });
    fireEvent.click(week);
    expect(week).toHaveAttribute('aria-pressed', 'true');
    // Sept nuits : samedi → samedi suivant
    const releve = screen.getByText('Nuits').parentElement as HTMLElement;
    expect(within(releve).getByText('7')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    const picked = onConfirm.mock.calls[0]![0] as { start: string; end: string };
    expect(new Date(picked.start).getDay()).toBe(6);
    expect(picked.end > picked.start).toBe(true);
  });

  it('« Sans dates » efface la fenêtre et transmet null', () => {
    const onConfirm = vi.fn();
    render(<Fenetre onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ce week-end' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sans dates' }));
    expect(screen.getByRole('button', { name: 'Sans dates' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});
