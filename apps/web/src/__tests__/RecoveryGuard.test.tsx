import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RecoveryGuard } from '../components/RecoveryGuard';
import { useUserStore } from '../store/userStore';

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RecoveryGuard />
      <Routes>
        <Route path="/login" element={<p>page de connexion</p>} />
        <Route path="*" element={<p>autre page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RecoveryGuard — lien « mot de passe oublié »', () => {
  beforeEach(() => {
    useUserStore.setState({ recovery: false, authReady: true });
  });

  it('ramène à la connexion tant que le nouveau mot de passe n’est pas choisi', async () => {
    useUserStore.setState({ recovery: true, authReady: true });
    renderAt('/trips');
    expect(await screen.findByText('page de connexion')).toBeInTheDocument();
  });

  it('attend que supabase-js ait lu le lien : naviguer avant perdrait les jetons', () => {
    useUserStore.setState({ recovery: true, authReady: false });
    renderAt('/');
    expect(screen.getByText('autre page')).toBeInTheDocument();
  });

  it('ne retient personne hors réinitialisation', () => {
    renderAt('/trips');
    expect(screen.getByText('autre page')).toBeInTheDocument();
  });
});
