import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import type { Trip, TripProposal } from '@triptic/shared';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';
import * as api from '../lib/api';

vi.mock('../lib/api', () => ({
  saveTrip: vi.fn(),
  updateTrip: vi.fn(),
  recomputeTrip: vi.fn(),
}));

const saveTrip = vi.mocked(api.saveTrip);
const updateTrip = vi.mocked(api.updateTrip);

function makeProposal(overrides: Partial<TripProposal> = {}): TripProposal {
  return {
    title: 'Boucle des Vosges',
    mode: 'roadtrip',
    duration_days: 3,
    distance_km: 240,
    elevation_gain_m: 3200,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Trois jours entre cols et lacs.',
    daily_distance_km: 80,
    waypoints: [
      { name: 'Colmar', lat: 48.08, lng: 7.36, day: 1, kind: 'start' },
      { name: 'Munster', lat: 48.04, lng: 7.14, day: 3, kind: 'end' },
    ],
    photo_keywords: ['vosges'],
    ...overrides,
  };
}

function makeDraft(proposal: TripProposal, id = 'draft-1'): Trip {
  const { waypoints, title, mode, days: _days, ...metadata } = proposal;
  return {
    id,
    user_id: 'u1',
    title,
    slug: null,
    is_public: false,
    mode,
    status: 'draft',
    metadata: { ...metadata, mode },
    waypoints,
    days: null,
    cover_photo: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
}

describe('tripStore — auto-save en brouillon à la sélection', () => {
  beforeEach(() => {
    saveTrip.mockReset();
    updateTrip.mockReset();
    useUserStore.setState({ plan: 'free' });
    useTripStore.setState({
      selected: null,
      saved: null,
      history: [],
      recomputing: false,
      error: null,
    });
  });

  it("POST en status 'draft' au premier choix et garde l'id serveur", async () => {
    const proposal = makeProposal();
    const draft = makeDraft(proposal);
    saveTrip.mockResolvedValue(draft);

    useTripStore.getState().select(proposal);

    await waitFor(() =>
      expect(saveTrip).toHaveBeenCalledWith(proposal, 'free', false, 'draft'),
    );
    await waitFor(() => expect(useTripStore.getState().saved).toEqual(draft));
    expect(saveTrip).toHaveBeenCalledTimes(1);
  });

  it('re-sélection du même trip : PATCH sur l’id existant, jamais de re-POST', async () => {
    const proposal = makeProposal();
    const draft = makeDraft(proposal);
    updateTrip.mockResolvedValue(draft);
    useTripStore.setState({ selected: proposal, saved: draft });

    useTripStore.getState().select({ ...proposal });

    await waitFor(() =>
      expect(updateTrip).toHaveBeenCalledWith('draft-1', { ...proposal }, 'free'),
    );
    expect(saveTrip).not.toHaveBeenCalled();
  });

  it('sélection d’un autre trip : nouveau POST (l’id du précédent n’est pas réutilisé)', async () => {
    const first = makeProposal();
    const second = makeProposal({ title: 'Tour du Hohneck' });
    const secondDraft = makeDraft(second, 'draft-2');
    saveTrip.mockResolvedValue(secondDraft);
    useTripStore.setState({ selected: first, saved: makeDraft(first) });

    useTripStore.getState().select(second);

    await waitFor(() =>
      expect(saveTrip).toHaveBeenCalledWith(second, 'free', false, 'draft'),
    );
    expect(updateTrip).not.toHaveBeenCalled();
    await waitFor(() => expect(useTripStore.getState().saved).toEqual(secondDraft));
  });

  it('échec réseau silencieux : le trip reste sélectionné en mémoire, aucune erreur UX', async () => {
    const proposal = makeProposal();
    saveTrip.mockRejectedValue(new Error('network'));

    useTripStore.getState().select(proposal);

    await waitFor(() => expect(saveTrip).toHaveBeenCalled());
    // L'échec ne bloque rien : pas d'erreur exposée, sélection intacte
    expect(useTripStore.getState().selected).toEqual(proposal);
    expect(useTripStore.getState().saved).toBeNull();
    expect(useTripStore.getState().error).toBeNull();
  });

  it('hydrate reconstruit la proposition depuis un trip persisté (page /trips/:id)', () => {
    const proposal = makeProposal();
    const trip = makeDraft(proposal);

    useTripStore.getState().hydrate(trip);

    const state = useTripStore.getState();
    expect(state.saved).toEqual(trip);
    expect(state.selected).toMatchObject({
      title: 'Boucle des Vosges',
      mode: 'roadtrip',
      duration_days: 3,
      waypoints: trip.waypoints,
    });
    expect(state.history).toEqual([]);
    expect(state.error).toBeNull();
  });
});
