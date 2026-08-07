import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QuickReplies } from '../components/QuickReplies';
import { setLang } from '../lib/i18n';

describe('QuickReplies (chips de réponse rapide)', () => {
  it('affiche des vrais boutons et envoie le texte au clic', () => {
    setLang('fr');
    const onPick = vi.fn();
    render(<QuickReplies replies={['Solo', 'En couple']} disabled={false} onPick={onPick} />);
    expect(
      screen.getByRole('group', { name: 'Suggestions de réponse' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'En couple' }));
    expect(onPick).toHaveBeenCalledWith('En couple');
  });

  it('ne rend rien sans suggestions', () => {
    const { container } = render(
      <QuickReplies replies={[]} disabled={false} onPick={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('désactive les chips quand disabled', () => {
    setLang('fr');
    render(<QuickReplies replies={['Solo']} disabled onPick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Solo' })).toBeDisabled();
  });
});
