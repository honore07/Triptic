import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TripTuner } from '../components/TripTuner';
import { setLang } from '../lib/i18n';

describe('TripTuner', () => {
  it('renders the 4 sliders with their labels (fr)', () => {
    setLang('fr');
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText(/Niveau sportif/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Rythme/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Activités/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Exploration/)).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
  });

  it('confirms with the adjusted values', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText(/Niveau sportif/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Exploration/), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith({ physical: 5, pace: 3, culture: 3, discovery: 1 });
  });

  it('defaults every slider to neutral 3/5', () => {
    setLang('fr');
    const onConfirm = vi.fn();
    render(<TripTuner onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /Générer mes 3 trips sur-mesure/ }));
    expect(onConfirm).toHaveBeenCalledWith({ physical: 3, pace: 3, culture: 3, discovery: 3 });
  });

  it('translates to German', () => {
    setLang('de');
    render(<TripTuner onConfirm={() => {}} />);
    expect(screen.getByLabelText(/Sportlevel/)).toBeInTheDocument();
    setLang('fr');
  });
});
