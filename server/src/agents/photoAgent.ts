import { extractJson, type LlmProvider } from '@triptic/ai-engine';
import { z } from 'zod';
import { logger } from '../logger.js';
import type { PhotoCandidate, PhotoFacts } from '../services/photos.js';

/**
 * AGENT 6 — Correcteur des photos de lieu : couvertures de trip, photos du
 * jour, carrousel de la carte.
 *
 * Une photo Commons prise au bon endroit ne montre pas forcément L'ESPACE :
 * au centre de Bolzano, les photos les plus proches étaient toutes des
 * voitures de police d'un même reportage ; ailleurs, un intérieur d'église,
 * un train, un bœuf, des fonts baptismaux. L'agent ne juge donc pas la
 * position (garantie par la recherche autour du point) mais le SUJET et le
 * cadrage, d'après ce que Commons dit de chaque photo : titre, description,
 * catégories, dimensions.
 *
 * Deux étages : des règles déterministes, gratuites, écartent ce que les
 * catégories et le cadrage trahissent et classent le reste ; l'agent LLM
 * tranche et ordonne. Agent indisponible : seules passent les photos dont les
 * faits disent explicitement un paysage — jamais une photo au sujet inconnu.
 */

export const PHOTO_RULES_VERSION = '2.0.0'; // 2026-09-18 — vues d'ensemble seulement, faits Commons
// 1.0.0 (2026-08-02) : titres seuls, patrimoine et intérieurs gardés, doute = garder

export const PHOTO_RULES_PROMPT = `Tu es l'agent correcteur des photos de VIRE (version ${PHOTO_RULES_VERSION}), une app de voyages en van, à pied et à vélo.
Pour chaque lieu d'un voyage, on te donne des photos prises tout près, décrites par leur titre, leurs dimensions, leurs catégories Wikimedia Commons et parfois une description.
Ton rôle : ne garder que les photos où l'on voit L'ESPACE que le voyageur va parcourir, et les classer.

GARDER — une vue extérieure d'ensemble, prise avec du recul :
- panoramas, points de vue, vallées, sommets, crêtes, cols, lacs, glaciers, forêts, gorges, cascades dans leur site
- un village, une ville, un château ou une abbaye vus de loin, dans leur paysage
- une route, un sentier ou un alpage qui s'ouvrent sur le paysage

ÉCARTER — tout ce qui ne montre pas l'espace :
- intérieurs (église, musée, maison), autels, vitraux, fonts baptismaux, mobilier
- un bâtiment seul ou une façade vus de près (église, mairie, maison, fontaine, monument), détails, sculptures, plaques, panneaux
- véhicules de toute sorte (voiture, police, ambulance, train, bus, avion, hélicoptère, vélo) et événements (fête, défilé, course, concert, cérémonie)
- personnes au premier plan, portraits, foules
- animaux ou plantes en sujet principal (vache, bouquetin, fleur, insecte)
- plats, documents, cartes, cartes postales, blasons, images satellite, panoramas 360° déformés
- un titre qui n'est qu'un code (DSC01234, IMG_2034) sans catégorie ni description qui dise un paysage
En cas de doute, ÉCARTE : l'app a une photo de repli, une photo hors sujet la décrédibilise.

CLASSEMENT : la vue la plus large et la plus représentative du lieu en premier.

EXEMPLES RÉELS :
- « Vuedepuisleradarverslest » — « Vu vers l'est depuis le radar du grand ballon » → GARDER, en tête
- « Vue du village de Ribeauvillé » — catégorie Landscapes of Haut-Rhin → GARDER
- « Lac Blanc (Orbey) 03 » — « vue du rocher Hans et du lac » → GARDER
- « DSC01021 Jeep Cherokee, Carabinieri, Front Right » → ÉCARTER (véhicule)
- « Saint Barthelemy church of Gérardmer » — catégorie Tone-mapped HDR images of churches → ÉCARTER (église, rien du paysage)
- « Baptismal fonts Kaysersberg » → ÉCARTER (intérieur)
- « Z850 EMU at La Joux » — catégorie SNCF Class Z 850 → ÉCARTER (train)
- « Bœuf d'Hérens » → ÉCARTER (animal)
- « Rochejean - mairie » → ÉCARTER (façade)

Réponds UNIQUEMENT avec un objet JSON : pour chaque identifiant de lieu (L1, L2…), la liste ORDONNÉE des numéros de photos gardées, liste vide si aucune ne convient.
{"L1": [3, 0], "L2": []}`;

/** Minuscules sans accents : chaque règle s'écrit une fois pour fr, de, it, en. */
function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/ß/g, 'ss')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      // « bird's-eye view » est une vue aérienne, pas un oiseau
      .replace(/\bbirds?['’]?s?[- ]eye\b/g, 'aerial')
  );
}

const words = (alternatives: string): RegExp => new RegExp(`\\b(?:${alternatives})\\b`);

/**
 * Catégories de maintenance Commons (licence, auteur, appareil, concours) :
 * elles ne disent rien du sujet et fausseraient les règles — « Pages with
 * maps » n'est pas une carte.
 */
const MAINTENANCE_CATEGORY = new RegExp(
  '^(?:' +
    [
      'self-published',
      'files? (?:with|by|from|uploaded)',
      'supported by',
      'photographs? by',
      'images? (?:by|from|with)',
      'uploads? by',
      'uploaded (?:with|by)',
      'personality rights',
      'unassessed',
      'quality images',
      'featured pictures',
      'valued images',
      'pictures? of the day',
      'cc-',
      'gfdl',
      'pd[- ]',
      'licen[cs]e',
      'pages? (?:with|using)',
      'media (?:needing|contributed|with|without)',
      'taken with',
      'created with',
      'items with',
      'flickr',
      'panoramio',
      'photos (?:by|from|imported)',
      'information field',
      'large images',
      'wiki loves',
      'merimee with',
      'palissy with',
      'hidden categor',
      '.*photographs taken on',
      '.*\\bmissing sdc\\b',
      '.*\\bwith known ids\\b',
    ].join('|') +
    ')',
);

/** Sujets qui ne montrent jamais l'espace — lus dans le titre et les catégories. */
const REJECT: [reason: string, pattern: RegExp][] = [
  [
    'véhicule',
    words(
      'cars?|automobiles?|vehicles?|vehicules?|fahrzeuge?|jeeps?|sedans?|hatchbacks?|suvs?|campervans?|motorhomes?|wohnmobile?|trucks?|lorr(?:y|ies)|camions?|lkw|bus|buses|autobus|tractors?|tracteurs?|trains?|locomotives?|emu|dmu|railcars?|trams?|tramways?|aircraft|airplanes?|avions?|flugzeuge?|helicopters?|helicopteres?|hubschrauber|motorcycles?|motorbikes?|motos?|motorrad|bicycles?|bikes?|velos?|fahrrad|police|polizia|polizei|gendarmerie|carabinieri|ambulances?|krankenwagen|fire engines?|feuerwehr|pompiers',
    ),
  ],
  [
    'intérieur',
    words(
      'interiors?|interieurs?|innenansicht(?:en)?|innenraum|interno|interni|nave|choir|choeur|chancel|altars?|autels?|altare|organs?|orgues?|orgel|pulpits?|chaire|kanzel|stained glass|vitraux|vitrail|kirchenfenster|crypts?|cryptes?|krypta|cripta|baptismal|baptisteres?|taufsteine?|fonts|frescos?|frescoes|fresques?|fresken|affreschi|ceilings?|plafonds?|museums?|musees?|exhibitions?|expositions?|ausstellungen?',
    ),
  ],
  [
    'objet ou détail',
    words(
      'details?|close-?ups?|gros plan|macro|plaques?|inscriptions?|signposts?|signs?|panneaux?|wegweiser|logos?|coats? of arms|blasons?|wappen|stemma|sculptures?|statues?|reliefs?|bas-reliefs?|keystones?|gravestones?|tombs?|tombes?|tombstones?|stamps?|timbres?|documents?|manuscripts?|paintings?|tableaux|gemalde|palissy|objets? mobiliers?|furniture|clocks?|horloges?|bells?|cloches?|glocken',
    ),
  ],
  [
    'personnes ou événement',
    words(
      'portraits?|selfies?|people|crowds?|foules?|festivals?|parades?|processions?|concerts?|ceremon(?:y|ie|ies)|weddings?|mariages?|republic day|carnivals?|carnavals?|fasnacht|fasching|marathons?|races?|racing|rall(?:y|ies)|rallyes?|championships?|championnats?|competitions?|grand prix|motocross|protests?|manifestations?|demonstrations?|events?|evenements?|musicians?|soldiers?|soldats|posing',
    ),
  ],
  [
    'animal ou plante',
    words(
      'cattle|cows?|vaches?|boeufs?|bulls?|taureaux|oxen|kuhe?|rinder|sheep|moutons?|brebis|schafe?|goats?|chevres?|ziegen?|horses?|chevaux|pferde?|donkeys?|dogs?|chiens?|hunde?|cats?|katzen?|birds?|oiseaux|vogel|insects?|insectes?|butterfl(?:y|ies)|papillons?|beetles?|kever|vlinder|schmetterlinge?|kafer|spiders?|araignees?|lizards?|lezards?|hagedis|snakes?|serpents?|marmots?|marmottes?|murmeltiere?|ibex|bouquetins?|steinbocke?|deer|cerfs?|chevreuils?|foxes|renards?|flowers?|fleurs?|blumen|bloemen|orchids?|orchidees?|fungi|fungus|mushrooms?|champignons?|pilze|lichens?|animals?|animaux|tiere|plants?|plantes?|pflanzen',
    ),
  ],
  [
    'plat',
    words(
      'food|dish(?:es)?|meals?|assiettes?|gerichte?|desserts?|cakes?|gateaux|kuchen|cheeses?|fromages?|breads?|beers?|bieres?|wine bottles?|cocktails?|menus?',
    ),
  ],
  [
    'document ou carte',
    words(
      'maps?|cartes? (?:de|du|des|postales?)|karten?|kaart|diagrams?|drawings?|dessins?|engravings?|gravures?|lithograph(?:s|ies|ie)?|postcards?|ansichtskarten?|posters?|affiches?|illustrations?|scans?|screenshots?|charts?',
    ),
  ],
  // Photos NASA depuis l'orbite : géotaguées au sol mais illisibles
  ['vue satellite', /iss\d{3}-e-|\b(?:view of earth|satellite|sentinel-\d|landsat)\b/],
  ['panorama 360°', /360 ?°|\b360-degree\b|\bequirectangular\b|\bspherical panoramas?\b|\bphotospheres?\b/],
];

/** Ce qui dit une vue d'ensemble — titre, description ou catégorie. */
const VIEW = words(
  'landscapes?|paysages?|landschaft(?:en)?|paesaggi(?:o)?|panoramas?|panoramics?|panoramique|views?|vues?|vu|aussicht|blick|ansicht|gesamtansicht|vedut[ae]|vista|overview|skyline|aerial|aeriennes?|luftbild(?:er)?|luftaufnahmen?',
);
const NATURE = words(
  'valleys?|vallees?|vallons?|tal|valle|val|lakes?|lacs?|see|seen|lago|laghi|mountains?|montagnes?|berge?|montagna|monti|summits?|sommets?|gipfel|cima|peaks?|pics?|cols?|pass|passo|glaciers?|gletscher|ghiacciaio|gorges?|canyons?|schlucht|cascades?|waterfalls?|wasserfall|cascata|forests?|forets?|wald|bosco|ridges?|cretes?|cirques?|plateaux?|meadows?|alpages?|alm|alpe|pastures?|vineyards?|vignobles?|vignes|weinberge?|rivers?|rivieres?|fluss|fiume|coasts?|beach(?:es)?|plages?|cliffs?|falaises?|rochers?|rocks?|hills?|collines?|hugel|massifs?|ballons?|dolomit(?:es|i|en)',
);
const LANDSCAPE_CATEGORY =
  /^(?:landscapes|panoramics|panoramas|views|aerial (?:photographs|views)|mountains|lakes|valleys|glaciers|waterfalls|nature) (?:of|from|in)\b/;
const QUALITY_CATEGORY = /^(?:quality images|featured pictures|valued images|pictures? of the day)/;
/** Un bâtiment seul : pas écarté d'office (un château dans son site), mais jamais sans l'agent. */
const BUILDING = words(
  'church(?:es)?|eglises?|kirchen?|chies[ae]|chapels?|chapelles?|kapellen?|cappell[ae]|cathedrals?|cathedrales?|basilicas?|basiliques?|abbe(?:y|ys)|abbayes?|abtei(?:en)?|abbazi[ae]|temples?|synagogues?|mosques?|town halls?|mairies?|hotels? de ville|rathaus|municipio|houses?|maisons?|haus|hauser|buildings?|batiments?|gebaude|facades?|fassaden?|doors?|portes?|portals?|portails?|windows?|fenetres?|fenster|fountains?|fontaines?|brunnen|fontan[ae]|monuments?|memorials?|denkmal(?:e|er)?|hotels?|restaurants?|chalets?|shops?|streets?|rues?|strassen?|gassen?|squares?|piazz[ae]|plazas?|marketplaces?|gares?|bahnhof',
);

/** Photo proposable sans l'avis de l'agent : ses faits disent un paysage. */
export const MIN_SCORE_WITHOUT_AGENT = 2;
const MIN_WIDTH = 1000;
/** Au-delà, la vignette de 960 px est trop basse pour remplir une carte sans flou. */
const MAX_RATIO = 2.8;

export interface PhotoAssessment {
  /** Raison d'écarter la photo, ou null si elle peut être proposée. */
  reject: string | null;
  /** Plus il est haut, plus les faits disent une vue d'ensemble. */
  score: number;
}

/** Règles déterministes : écarte ce que les faits trahissent, note le reste. */
export function assessPhoto(facts: PhotoFacts): PhotoAssessment {
  const categories = facts.categories.map(normalize);
  const informative = categories.filter((c) => !MAINTENANCE_CATEGORY.test(c));
  const subject = [normalize(facts.title), ...informative].join(' | ');
  const everything = `${subject} | ${normalize(facts.description)}`;

  let score = 0;
  if (VIEW.test(everything)) score += 2;
  if (NATURE.test(everything)) score += 1;
  if (informative.some((c) => LANDSCAPE_CATEGORY.test(c))) score += 2;
  if (categories.some((c) => QUALITY_CATEGORY.test(c))) score += 1;
  // Le sujet seul : une description dit volontiers « vue sur l'église »
  if (BUILDING.test(subject)) score -= 2;

  // Les catégories plutôt que la description : « car » y est aussi une conjonction
  for (const [reason, pattern] of REJECT) {
    if (pattern.test(subject)) return { reject: reason, score };
  }
  const { width, height } = facts;
  if (width > 0 && height > 0) {
    const ratio = width / height;
    if (width < MIN_WIDTH) return { reject: 'trop petite', score };
    if (ratio < 1) return { reject: 'cadrage portrait', score };
    if (ratio > MAX_RATIO) return { reject: 'panorama trop étroit', score };
    if (ratio >= 1.3 && ratio <= 2.4) score += 1;
  }
  return { reject: null, score };
}

/** Un lieu à illustrer et les photos prises tout près. */
export interface PlacePhotos {
  place: string;
  candidates: PhotoCandidate[];
}

/** Photos soumises à l'agent par lieu : les mieux notées par les règles. */
const AGENT_SHORTLIST = 10;
/** Lieux par appel : un prompt court répond vite (Deepseek 'none' ≈ 2-3 s). */
const PLACES_PER_CALL = 6;
/**
 * Au-delà, l'agent est tenu pour indisponible : le SDK attend jusqu'à 10 min
 * une réponse Deepseek qui ne vient pas — et la génération entière avec lui
 * (appel resté pendu plus de 10 min le 14/09/2026).
 */
export const AGENT_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Photo agent timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface Scored {
  photo: PhotoCandidate;
  score: number;
}

/** Les photos proposables d'un lieu, les mieux notées d'abord, et les raisons des autres. */
function shortlist(candidates: PhotoCandidate[]): { kept: Scored[]; rejected: string[] } {
  const kept: Scored[] = [];
  const rejected: string[] = [];
  for (const photo of candidates) {
    const { reject, score } = assessPhoto(photo.facts);
    if (reject) rejected.push(reject);
    else kept.push({ photo, score });
  }
  // Tri stable : à score égal, l'ordre de Commons (pertinence, puis distance)
  kept.sort((a, b) => b.score - a.score);
  return { kept: kept.slice(0, AGENT_SHORTLIST), rejected };
}

/**
 * Classe les photos de plusieurs lieux à la fois : règles déterministes, puis
 * l'agent par lots de six lieux. Pour chaque lieu, les photos gardées, la plus
 * parlante en tête — liste vide quand aucune ne montre l'espace.
 */
export async function rankPlacePhotos(
  places: PlacePhotos[],
  provider: LlmProvider | null,
): Promise<PhotoCandidate[][]> {
  const lists = places.map(({ candidates }) => shortlist(candidates));
  const results = lists.map(({ kept }) =>
    kept.filter(({ score }) => score >= MIN_SCORE_WITHOUT_AGENT).map(({ photo }) => photo),
  );
  if (!provider) return results;

  const asked = lists.flatMap(({ kept }, i) => (kept.length > 0 ? [i] : []));
  const batches: number[][] = [];
  for (let i = 0; i < asked.length; i += PLACES_PER_CALL) {
    batches.push(asked.slice(i, i + PLACES_PER_CALL));
  }
  await Promise.all(
    batches.map(async (batch) => {
      const verdicts = await askAgent(
        batch.map((i) => ({
          place: places[i]?.place ?? '',
          photos: (lists[i]?.kept ?? []).map(({ photo }) => photo),
          rejectedByRules: lists[i]?.rejected ?? [],
        })),
        provider,
      );
      // Agent indisponible : les règles déterministes font foi
      if (!verdicts) return;
      batch.forEach((placeIndex, k) => {
        const order = verdicts[k];
        // Lieu oublié dans la réponse : idem, pour ce lieu seulement
        if (order === undefined) return;
        const kept = lists[placeIndex]?.kept ?? [];
        results[placeIndex] = order.flatMap((n) => {
          const item = kept[n];
          return item ? [item.photo] : [];
        });
      });
    }),
  );
  return results;
}

interface AgentPlace {
  place: string;
  photos: PhotoCandidate[];
  rejectedByRules: string[];
}

const placeVerdictSchema = z.array(z.coerce.number().int().nonnegative());

/** Ce que l'agent lit d'une photo : de quoi juger son sujet sans la voir. */
function describePhoto(photo: PhotoCandidate, n: number): string {
  const { title, description, categories, width, height } = photo.facts;
  const parts = [`${n}. ${title || '(sans titre)'}`];
  if (width > 0 && height > 0) parts.push(`${width}×${height}`);
  const informative = categories.filter((c) => !MAINTENANCE_CATEGORY.test(normalize(c))).slice(0, 5);
  if (informative.length > 0) parts.push(`catégories : ${informative.join(' ; ')}`);
  const text = description.trim();
  if (text && normalize(text) !== normalize(title)) parts.push(`« ${text.slice(0, 160)} »`);
  return parts.join(' — ');
}

/**
 * Verdict ordonné de l'agent pour chaque lieu du lot (undefined : lieu absent
 * de la réponse), ou null quand l'agent est indisponible.
 */
async function askAgent(
  places: AgentPlace[],
  provider: LlmProvider,
): Promise<(number[] | undefined)[] | null> {
  const listing = places
    .map(({ place, photos }, i) =>
      [`L${i + 1} — ${place}`, ...photos.map((photo, n) => describePhoto(photo, n))].join('\n'),
    )
    .join('\n\n');
  const names = places.map(({ place }) => place);
  let raw = '';
  try {
    raw = await withTimeout(
      provider.complete({
        system: PHOTO_RULES_PROMPT,
        messages: [{ role: 'user', content: listing }],
        // Deepseek v4 raisonne AVANT d'écrire le JSON : un budget serré tronque
        // la réponse et l'agent échoue en silence.
        maxTokens: 4000,
        reasoning: 'none', // classer des photos ne demande aucune réflexion
      }),
      AGENT_TIMEOUT_MS,
    );
    const json = extractJson(raw) as Record<string, unknown>;
    const verdicts = places.map((_, i) => {
      const parsed = placeVerdictSchema.safeParse(json[`L${i + 1}`]);
      return parsed.success ? [...new Set(parsed.data)] : undefined;
    });
    logger.info(
      {
        audit: true,
        agent: 'photo',
        rulesVersion: PHOTO_RULES_VERSION,
        places: names,
        shown: places.reduce((n, p) => n + p.photos.length, 0),
        kept: verdicts.reduce((n, v) => n + (v?.length ?? 0), 0),
        unanswered: verdicts.filter((v) => v === undefined).length,
        rejectedByRules: places.flatMap((p) => p.rejectedByRules),
      },
      'Photo agent decision',
    );
    return verdicts;
  } catch (error) {
    logger.warn(
      // L'extrait de réponse évite de rester aveugle sur un échec de format
      { error, context: 'photo-agent', places: names, rawSnippet: raw.slice(0, 200) },
      'Photo agent unavailable',
    );
    return null;
  }
}
