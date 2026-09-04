import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { setLang } from '../lib/i18n';

const updateServiceWorker = vi.fn();
const setNeedRefresh = vi.fn();
let needRefresh = false;
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  }),
}));

describe('MiseAJour (bandeau nouvelle version)', () => {
  it("n'affiche rien tant qu'aucune version n'attend", async () => {
    setLang('fr');
    needRefresh = false;
    const { MiseAJour } = await import('../components/MiseAJour');
    const { container } = render(<MiseAJour />);
    expect(container).toBeEmptyDOMElement();
  });

  it('propose de recharger, ou plus tard — jamais de rechargement silencieux', async () => {
    setLang('fr');
    needRefresh = true;
    const { MiseAJour } = await import('../components/MiseAJour');
    render(<MiseAJour />);
    expect(screen.getByRole('status')).toHaveTextContent(/nouvelle version de VIRE/);
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole('button', { name: 'Recharger' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
