/**
 * Portails Geotrek consommés (roadmap 5.1) — API v2 ouverte, licence par
 * territoire (Etalab/ODbL : vérifier la page mentions légales de chaque
 * portail avant activation, champ `attribution` obligatoire).
 * IGN Rando appartient au même écosystème : ajouter son flux ici quand
 * l'accès sera confirmé (même schéma APIv2).
 */
export interface GeotrekPortal {
  id: string;
  /** Base URL sans slash final, ex. https://rando.parc-ballons-vosges.fr */
  baseUrl: string;
  /** Attribution affichée/stockée (obligation Etalab/ODbL). */
  attribution: string;
}

export const GEOTREK_PORTALS: GeotrekPortal[] = [
  {
    id: 'pnr-ballons-vosges',
    baseUrl: 'https://rando.parc-ballons-vosges.fr',
    attribution: 'PNR des Ballons des Vosges — Geotrek (Licence Ouverte)',
  },
  {
    id: 'rando-ecrins',
    baseUrl: 'https://rando.ecrins-parcnational.fr',
    attribution: 'Parc national des Écrins — Geotrek (Licence Ouverte)',
  },
  {
    id: 'rando-vanoise',
    baseUrl: 'https://rando.vanoise.com',
    attribution: 'Parc national de la Vanoise — Geotrek (Licence Ouverte)',
  },
];
