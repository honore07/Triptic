import type { PlaceKind } from '@triptic/shared';

/**
 * « Décris ton envie du jour » → kinds de la base places, sans appel au modèle.
 *
 * Les kinds forment un ensemble fermé de 19 valeurs : traduire une envie en
 * kinds est un appariement de vocabulaire, pas un travail de langage. Le faire
 * en dictionnaire répond en microsecondes au lieu de 3-4 s, se teste
 * unitairement, et ne dépend d'aucun réseau.
 *
 * Le modèle reste en second rideau (voir la route) : si aucun terme connu
 * n'apparaît, on lui passe la main plutôt que de rendre une liste vide.
 *
 * Convention des termes :
 *   'lac'       → le mot entier, et lui seul (« lac », pas « placard »)
 *   'baign*'    → le préfixe (« baignade », « baigner », « se baigner »)
 *   'plan d eau'→ contenant un espace : recherché tel quel dans la phrase
 *
 * Le mot entier est la règle, parce que la sous-chaîne produit des faux
 * positifs qu'on ne voit pas venir : « bar » dans « barrage », « col » dans
 * « colline », « see » (le lac allemand) dans l'anglais « see ».
 */

const TERMS: Partial<Record<PlaceKind, string[]>> = {
  lake: [
    'lac', 'lacs', 'baign*', 'nager', 'nage', 'plage', 'etang', 'plan d eau',
    'lake', 'lakes', 'swim*', 'bathing', 'beach',
    'badesee', 'baden', 'schwimmen', 'strand',
  ],
  waterfall: [
    'cascade', 'cascades', 'chute d eau', 'chutes',
    'waterfall', 'waterfalls', 'falls',
    'wasserfall', 'wasserfalle',
  ],
  peak: [
    'sommet', 'sommets', 'montagne', 'montagnes', 'ballon', 'crete', 'cretes',
    'altitude', 'ascension', 'pic',
    'peak', 'peaks', 'summit', 'mountain', 'ridge',
    'gipfel', 'berg', 'berge', 'kamm',
  ],
  pass: [
    'col', 'cols', 'route des cretes',
    'pass', 'mountain pass',
    'passhohe',
  ],
  gorge: [
    'gorge', 'gorges', 'canyon', 'canyons', 'defile',
    'ravine',
    'schlucht', 'klamm',
  ],
  glacier: ['glacier', 'glaciers', 'gletscher'],
  viewpoint: [
    'point de vue', 'points de vue', 'panorama', 'belvedere', 'coucher de soleil',
    'viewpoint', 'lookout', 'scenic', 'sunset',
    'aussicht*', 'sonnenuntergang',
  ],
  refuge: [
    'refuge', 'refuges', 'gite', 'gites', 'auberge', 'cabane',
    'hut', 'shelter', 'lodge',
    'hutte', 'berghutte',
  ],
  camp: [
    'camping', 'bivouac', 'camper', 'dormir', 'nuit', 'nuitee', 'nuitees',
    'camp', 'sleep', 'overnight',
    'zelt*', 'ubernacht*', 'schlafen', 'stellplatz',
  ],
  castle: [
    'chateau', 'chateaux', 'forteresse', 'citadelle', 'ruines',
    'castle', 'castles', 'fortress', 'ruins',
    'schloss', 'burg', 'festung',
  ],
  village: [
    'village', 'villages', 'bourg', 'hameau', 'ville',
    'town', 'hamlet',
    'dorf', 'stadt',
  ],
  museum: [
    'musee', 'musees', 'exposition', 'ecomusee',
    'museum', 'exhibition',
    'ausstellung',
  ],
  trail: [
    'rando*', 'sentier', 'sentiers', 'marche', 'boucle', 'trek*', 'balade*',
    'trail', 'trails', 'hike', 'hiking', 'loop', 'walk',
    'wander*', 'weg', 'rundweg',
  ],
  restaurant: [
    'restaurant', 'restaurants', 'resto', 'manger', 'repas', 'dejeuner', 'diner',
    'gastronomie', 'tarte flambee', 'flammekueche', 'winstub', 'terroir',
    'specialite', 'specialites',
    'eat', 'dinner', 'lunch', 'food', 'local dish',
    'essen', 'abendessen', 'mittagessen',
  ],
  cafe: [
    'cafe', 'salon de the', 'gouter', 'patisserie', 'boulangerie',
    'coffee', 'tea room', 'bakery',
    'kaffee', 'konditorei', 'backerei',
  ],
  bar: [
    'bar', 'bars', 'biere', 'bieres', 'brasserie', 'apero', 'vin', 'vins',
    'cave', 'degustation',
    'beer', 'pub', 'wine', 'tasting',
    'bier', 'kneipe', 'wein*',
  ],
  fast_food: [
    'fast food', 'burger', 'burgers', 'snack', 'sur le pouce', 'kebab', 'pizza',
    'takeaway', 'quick bite',
    'imbiss', 'schnellrestaurant',
  ],
};

/** Plafond repris du schéma de la route : au-delà, le filtre ne filtre plus. */
const MAX_KINDS = 4;

/** minuscules, accents ôtés, ponctuation en espaces. */
export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matches(term: string, phrase: string, words: Set<string>): boolean {
  if (term.includes(' ')) return phrase.includes(normalizeQuery(term));
  if (term.endsWith('*')) {
    const prefix = term.slice(0, -1);
    for (const word of words) if (word.startsWith(prefix)) return true;
    return false;
  }
  return words.has(term);
}

/**
 * Kinds déduits d'une envie exprimée librement.
 * Liste vide = aucun terme reconnu ; à l'appelant de décider de la suite.
 */
export function filtersFromText(text: string): PlaceKind[] {
  const phrase = normalizeQuery(text);
  const words = new Set(phrase.split(' ').filter(Boolean));
  const found: PlaceKind[] = [];

  for (const [kind, terms] of Object.entries(TERMS) as [PlaceKind, string[]][]) {
    if (terms.some((term) => matches(term, phrase, words))) found.push(kind);
  }

  // Au-delà de 4 kinds le filtre ne filtre plus rien d'utile : on tronque dans
  // l'ordre de déclaration, qui va du paysage (le plus discriminant sur une
  // carte) aux commerces.
  return found.slice(0, MAX_KINDS);
}
