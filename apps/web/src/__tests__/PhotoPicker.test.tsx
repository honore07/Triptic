import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Bascule } from '../components/Bascule';
import { PhotoPicker } from '../components/PhotoPicker';
import { MAX_SOURCE_BYTES, toSquareDataUrl } from '../lib/photo';
import { setLang } from '../lib/i18n';

const GRAVURE = '/vire/vire_pic-sac.jpg';

/** Fichier factice — la taille prime, le contenu n'est jamais décodé ici. */
function fakeFile(type: string, bytes = 1024): File {
  const file = new File(['x'], 'photo', { type });
  Object.defineProperty(file, 'size', { value: bytes });
  return file;
}

describe('PhotoPicker (photo de compte et de véhicule)', () => {
  beforeEach(() => setLang('fr'));

  it('montre la gravure tant qu’aucune photo n’est choisie', () => {
    const { container } = render(
      <PhotoPicker value={null} fallback={GRAVURE} label="Photo de profil" onChange={() => {}} />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', GRAVURE);
    // Gravure = décorative : elle ne doit pas polluer les lecteurs d'écran
    expect(img).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: /Ajouter une photo/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument();
  });

  it('une photo choisie devient une vraie image décrite', () => {
    render(
      <PhotoPicker
        value="data:image/jpeg;base64,AAA"
        fallback={GRAVURE}
        label="Photo du véhicule"
        onChange={() => {}}
      />,
    );
    expect(screen.getByAltText('Photo du véhicule')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Changer la photo/ })).toBeInTheDocument();
  });

  it('permet de retirer la photo', () => {
    const onChange = vi.fn();
    render(
      <PhotoPicker
        value="data:image/jpeg;base64,AAA"
        fallback={GRAVURE}
        label="Photo de profil"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Retirer/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('refuse un fichier qui n’est pas une image', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <PhotoPicker value={null} fallback={GRAVURE} label="Photo de profil" onChange={onChange} />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fakeFile('application/pdf')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/pas une image/);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('refuse une image trop lourde avant même de la lire', async () => {
    await expect(toSquareDataUrl(fakeFile('image/jpeg', MAX_SOURCE_BYTES + 1))).rejects.toBe(
      'too_large',
    );
  });

  it('refuse un type non-image sans toucher au FileReader', async () => {
    await expect(toSquareDataUrl(fakeFile('text/plain'))).rejects.toBe('not_an_image');
  });
});

describe('Bascule (interrupteur rectangulaire)', () => {
  beforeEach(() => setLang('fr'));

  it('expose un vrai interrupteur avec son état', () => {
    render(<Bascule label="Alertes météo" on onToggle={() => {}} />);
    const bascule = screen.getByRole('switch', { name: 'Alertes météo' });
    expect(bascule).toHaveAttribute('aria-checked', 'true');
  });

  it('bascule au clic', () => {
    const onToggle = vi.fn();
    render(<Bascule label="Bivouac autorisé" on={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Bivouac autorisé' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('garde une cible tactile de 44 px malgré une plaque de 32', () => {
    render(<Bascule label="Carte hors-ligne" on onToggle={() => {}} />);
    const bascule = screen.getByRole('switch', { name: 'Carte hors-ligne' });
    expect(bascule.className).toContain('min-h-11');
  });

  it('ne bascule pas quand il est désactivé', () => {
    const onToggle = vi.fn();
    render(<Bascule label="Chien de la cordée" on={false} disabled onToggle={onToggle} />);
    const bascule = screen.getByRole('switch', { name: 'Chien de la cordée' });
    expect(bascule).toBeDisabled();
    fireEvent.click(bascule);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('l’explication reste optionnelle', async () => {
    const { rerender } = render(<Bascule label="Sans note" on onToggle={() => {}} />);
    await waitFor(() => expect(screen.getByText('Sans note')).toBeInTheDocument());
    rerender(<Bascule label="Avec note" hint="Une précision" on onToggle={() => {}} />);
    expect(screen.getByText('Une précision')).toBeInTheDocument();
  });
});
