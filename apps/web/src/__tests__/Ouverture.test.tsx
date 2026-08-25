import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Ouverture } from '../components/Ouverture';
import { setLang } from '../lib/i18n';

describe('Ouverture (planche PL.01)', () => {
  beforeEach(() => {
    localStorage.clear();
    setLang('fr');
  });

  it('affiche la marque, la signature et la plaque d’entrée', () => {
    render(<Ouverture onStart={() => {}} />);
    expect(screen.getByRole('heading', { name: 'VIRE' })).toBeInTheDocument();
    expect(screen.getByText('Plan · Explore · Repeat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeInTheDocument();
  });

  it('franchit l’ouverture au clic', () => {
    const onStart = vi.fn();
    render(<Ouverture onStart={onStart} />);
    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('pose le focus sur la seule action disponible (a11y clavier)', () => {
    render(<Ouverture onStart={() => {}} />);
    expect(screen.getByRole('button', { name: 'Commencer' })).toHaveFocus();
  });

  it('masque le fond aux lecteurs d’écran et fige le défilement', () => {
    const { unmount } = render(<Ouverture onStart={() => {}} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    // Le défilement revient dès que la planche est franchie
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

});
