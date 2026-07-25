import { AddPlaceForm } from '../components/AddPlaceForm';

/** Page /contribute — proposer un lieu à la base de connaissance. */
export function Contribute() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <AddPlaceForm />
    </main>
  );
}
