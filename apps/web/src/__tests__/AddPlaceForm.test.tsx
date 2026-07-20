import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddPlaceForm } from '../components/AddPlaceForm';
import { setLang } from '../lib/i18n';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  submitPlace: vi.fn(),
}));

const submitPlace = vi.mocked(api.submitPlace);

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/Nom du lieu/), {
    target: { value: 'Cascade du Frankenthal' },
  });
  fireEvent.change(screen.getByLabelText(/Latitude/), { target: { value: '48.05' } });
  fireEvent.change(screen.getByLabelText(/Longitude/), { target: { value: '7.01' } });
  fireEvent.click(screen.getByRole('button', { name: /Proposer ce lieu/ }));
}

describe('AddPlaceForm', () => {
  beforeEach(() => {
    setLang('fr');
    submitPlace.mockReset();
  });

  it('affiche les champs requis avec labels accessibles (fr)', () => {
    render(<AddPlaceForm />);
    expect(screen.getByLabelText(/Nom du lieu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Type de lieu/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Latitude/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Longitude/)).toBeInTheDocument();
  });

  it('envoie la proposition et confirme la modération (pending)', async () => {
    submitPlace.mockResolvedValue('pending');
    render(<AddPlaceForm />);
    fillAndSubmit();
    await waitFor(() =>
      expect(screen.getByText(/sera vérifié avant publication/)).toBeInTheDocument(),
    );
    expect(submitPlace).toHaveBeenCalledWith({
      name: 'Cascade du Frankenthal',
      kind: 'waterfall',
      lat: 48.05,
      lng: 7.01,
    });
  });

  it('signale un lieu déjà connu (merged)', async () => {
    submitPlace.mockResolvedValue('merged');
    render(<AddPlaceForm />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/déjà dans la base/)).toBeInTheDocument());
  });

  it("affiche l'erreur si l'API échoue", async () => {
    submitPlace.mockRejectedValue(new Error('500'));
    render(<AddPlaceForm />);
    fillAndSubmit();
    await waitFor(() => expect(screen.getByText(/L'envoi a échoué/)).toBeInTheDocument());
  });
});
