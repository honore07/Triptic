import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalTdm } from '../pages/LegalTdm';
import { setLang } from '../lib/i18n';

describe('LegalTdm', () => {
  beforeEach(() => {
    setLang('fr');
  });

  it('affiche le titre de la notice (fr)', () => {
    render(<LegalTdm />);
    expect(
      screen.getByRole('heading', { level: 1, name: /fouille de textes et de données/i }),
    ).toBeInTheDocument();
  });

  it('affiche les sections quoi / pourquoi / base légale / opt-out / opposition', () => {
    render(<LegalTdm />);
    const sections = [
      /Ce que nous collectons/,
      /Pourquoi/,
      /Base légale/,
      /Opt-out/,
      /Opposition & effacement/,
    ];
    for (const name of sections) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it('cite la base légale TDM (directive 2019/790 et art. L.122-5-3 CPI)', () => {
    render(<LegalTdm />);
    expect(screen.getByText(/2019\/790/)).toBeInTheDocument();
    expect(screen.getByText(/L\.122-5-3/)).toBeInTheDocument();
  });

  it("affiche le contact d'opposition en mailto", () => {
    render(<LegalTdm />);
    const link = screen.getByRole('link', { name: /jules\.million07@gmail\.com/ });
    expect(link).toHaveAttribute('href', 'mailto:jules.million07@gmail.com');
  });

  it('affiche la mention « version française fait foi » traduite (en)', () => {
    setLang('en');
    render(<LegalTdm />);
    expect(screen.getByText(/the French version prevails/)).toBeInTheDocument();
  });
});
