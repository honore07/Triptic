import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaywallModal } from '../components/PaywallModal';
import { useUserStore } from '../store/userStore';
import { setLang } from '../lib/i18n';

describe('PaywallModal', () => {
  beforeEach(() => {
    setLang('fr');
    localStorage.clear();
    useUserStore.setState({ plan: 'free', paywallOpen: false });
  });

  it('renders nothing when closed', () => {
    render(<PaywallModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows benefits and prices when open', () => {
    useUserStore.setState({ paywallOpen: true });
    render(<PaywallModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Passe en mode Aventurier')).toBeInTheDocument();
    expect(screen.getByText(/29 € \/ an/)).toBeInTheDocument();
  });

  it('upgrades the plan when the CTA is clicked', () => {
    useUserStore.setState({ paywallOpen: true });
    render(<PaywallModal />);
    fireEvent.click(screen.getByText(/Choisir Aventurier/));
    expect(useUserStore.getState().plan).toBe('aventurier');
    expect(useUserStore.getState().paywallOpen).toBe(false);
  });

  it('traps focus inside the dialog (Tab / Shift+Tab loop)', () => {
    useUserStore.setState({ paywallOpen: true });
    render(<PaywallModal />);
    const buttons = screen.getAllByRole('button');
    const first = buttons[0]!;
    const last = buttons[buttons.length - 1]!;

    // Tab depuis le dernier focusable → retour au premier
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();

    // Shift+Tab depuis le premier → boucle vers le dernier
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('closes on Escape', () => {
    useUserStore.setState({ paywallOpen: true });
    render(<PaywallModal />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useUserStore.getState().paywallOpen).toBe(false);
  });
});
