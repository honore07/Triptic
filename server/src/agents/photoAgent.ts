import { extractJson, type LlmProvider } from '@triptic/ai-engine';
import { z } from 'zod';
import { logger } from '../logger.js';
import type { PlaceMedia } from '../services/photos.js';

/**
 * AGENT 6 — Correcteur de photos de lieu (carrousel de la carte).
 *
 * Les photos géolocalisées sont au bon endroit, mais toutes ne montrent pas
 * LE LIEU : une voiture de rallye qui passait par là, un vélo d'enfant, un
 * gros plan d'insecte ou un portrait sont géographiquement corrects et
 * pourtant inutiles pour se projeter. L'agent ne juge donc pas la position
 * (déjà garantie par la recherche par coordonnées) mais l'UTILITÉ.
 *
 * Défaillance = laisser passer : une photo médiocre est un moindre mal
 * comparé à un carrousel vide. Seul le pré-filtre déterministe reste actif.
 */

export const PHOTO_RULES_VERSION = '1.0.0'; // 2026-08-02 — jeu initial

export const PHOTO_RULES_PROMPT = `Tu es l'agent correcteur des photos de TRIPTIC (version ${PHOTO_RULES_VERSION}).
On te donne le nom d'un lieu et une liste de photos identifiées par leur numéro et leur titre.
Ces photos ont été prises à proximité du lieu. Ton rôle : ne garder que celles qui aident un voyageur à SE PROJETER SUR PLACE.

GARDER — ce qui montre le lieu et son ambiance :
- paysages, panoramas, vues d'ensemble, sommets, vallées, lacs, forêts
- villages, rues, architecture, monuments, patrimoine, églises, châteaux
- sentiers, cols, refuges, points de vue, signalétique de randonnée
- vues aériennes BASSES où le site reste reconnaissable

ÉCARTER — ce qui n'apprend rien sur le lieu :
- gros plans de faune ou de flore (insecte, fleur, champignon, oiseau, lézard)
- portraits, personnes au premier plan, groupes, selfies
- véhicules et événements (rallye, course, voiture, moto, compétition sportive)
- objets isolés (vélo, panneau publicitaire, mobilier, jouet)
- intérieurs sans intérêt patrimonial, plats, documents, cartes, blasons
- imagerie satellite ou spatiale (ISS, vues de la Terre depuis l'orbite) :
  géolocalisée mais on n'y reconnaît aucun lieu
- photos floues, très sombres ou dont le titre ne dit rien du lieu

EXEMPLES RÉELS (titres déjà rencontrés) :
- « Col Petit Ballon 2024 » → GARDER (le lieu même)
- « Vu de Wasserbourg depuis le Buchwald » → GARDER (panorama)
- « Munster CourAbbaye 01 » → GARDER (patrimoine)
- « 2010 Rally France-Alsace - Kościuszko » → ÉCARTER (événement automobile)
- « Kever op margriet » → ÉCARTER (gros plan d'insecte)
- « ISS045-E-141043 - View of Earth » → ÉCARTER (photo satellite)
- « Plat (noix de veau au jus truffé) » → ÉCARTER (assiette, pas le lieu)
- « MEES Magali » → ÉCARTER (titre = nom de personne)

Un titre qui n'est qu'un nom de personne, un numéro ou un code sans indication de lieu → ÉCARTER.
En cas de doute sur une photo, GARDE-LA : mieux vaut une photo moyenne qu'un carrousel vide.

Réponds UNIQUEMENT avec un objet JSON :
{"keep": [<numéros des photos à garder>], "rejected": [{"n": <numéro>, "why": "<3 mots max>"}]}`;

const verdictSchema = z.object({
  keep: z.array(z.number().int()),
  rejected: z
    .array(z.object({ n: z.number().int(), why: z.string() }))
    .default([]),
});

/**
 * Pré-filtre déterministe, sans appel LLM : titres Commons multilingues
 * (fr/en/de/nl) dont le sujet est explicitement hors-lieu. Rattrape les cas
 * évidents gratuitement et sert de filet quand l'agent est indisponible.
 */
const OFF_TOPIC = new RegExp(
  [
    'rally|rallye|racing|grand prix|motocross|competition|championnat',
    'kever|beetle|insect|vlinder|butterfly|papillon|libellule|spin |spider',
    'hagedis|lizard|oiseau|bird|vogel|schmetterling|kafer|käfer',
    'portrait|selfie|posing',
    'jouet|toy|speelgoed',
    'blason|coat of arms|wappen|logo|carte de|karte |kaart |map of',
    // Photos NASA depuis l'orbite : géotaguées au sol mais illisibles
    'iss\\d{3}-e-|view of earth|satellite image|sentinel-\\d|landsat',
  ].join('|'),
  'i',
);

export function isObviouslyOffTopic(title: string): boolean {
  return OFF_TOPIC.test(title);
}

/** Titre lisible d'un média Commons (le nom de fichier porte le sujet). */
export function mediaTitle(item: PlaceMedia): string {
  try {
    const file = decodeURIComponent(item.url.split('/').pop() ?? '');
    return file
      .replace(/^\d+px-/, '')
      .replace(/\.(jpe?g|png)$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

/**
 * Filtre une galerie : pré-filtre déterministe puis validation LLM.
 * Retourne toujours au moins ce que le pré-filtre a laissé passer.
 */
export async function filterUsefulPhotos(
  place: string,
  media: PlaceMedia[],
  provider: LlmProvider | null,
): Promise<PlaceMedia[]> {
  const prefiltered = media.filter((m) => !isObviouslyOffTopic(mediaTitle(m)));
  if (prefiltered.length === 0 || !provider) return prefiltered;

  const listing = prefiltered
    .map((m, i) => `${i}. ${mediaTitle(m) || '(sans titre)'}`)
    .join('\n');
  let raw = '';
  try {
    raw = await provider.complete({
      system: PHOTO_RULES_PROMPT,
      messages: [{ role: 'user', content: `Lieu : ${place}\nPhotos :\n${listing}` }],
      // Deepseek v4 raisonne AVANT d'écrire le JSON (~2 000 tokens de
      // raisonnement mesurés pour 10 titres, davantage au-delà) : un budget
      // serré tronque la réponse et l'agent échoue en silence.
      maxTokens: 4000,
    });
    const verdict = verdictSchema.parse(extractJson(raw));
    const kept = prefiltered.filter((_, i) => verdict.keep.includes(i));
    logger.info(
      {
        audit: true,
        agent: 'photo',
        rulesVersion: PHOTO_RULES_VERSION,
        place,
        candidates: media.length,
        kept: kept.length,
        rejected: verdict.rejected.map((r) => r.why),
      },
      'Photo agent decision',
    );
    // Tout rejeté = verdict suspect : on garde le pré-filtre
    return kept.length > 0 ? kept : prefiltered;
  } catch (error) {
    logger.warn(
      // L'extrait de réponse évite de rester aveugle sur un échec de format
      { error, context: 'photo-agent', place, rawSnippet: raw.slice(0, 200) },
      'Photo agent unavailable',
    );
    return prefiltered;
  }
}
