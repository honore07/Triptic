import { useTranslation } from 'react-i18next';

/**
 * /legal/attributions — attributions & licences des données (accessible sans auth).
 * Sources vérifiées dans le code : server/src/import/ (OSM, DATAtourisme,
 * Wikidata, Geotrek), server/src/services/ (weather = Open-Meteo,
 * elevation = Copernicus DEM via OpenTopoData, photos = Unsplash/Pexels,
 * co2 = ADEME Base Carbone) et le rendu carte Mapbox côté web.
 * Noms propres et identifiants de licence non traduits (pas des textes UI).
 */

interface SourceLink {
  label: string;
  href: string;
}

interface DataSource {
  /** Suffixe de clé i18n : legal.src_{id} */
  id: string;
  name: string;
  license: string;
  links: SourceLink[];
}

const SOURCES: DataSource[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    license: 'ODbL 1.0 — © OpenStreetMap contributors',
    links: [
      { label: 'openstreetmap.org/copyright', href: 'https://www.openstreetmap.org/copyright' },
      { label: 'opendatacommons.org (ODbL)', href: 'https://opendatacommons.org/licenses/odbl/1-0/' },
    ],
  },
  {
    id: 'datatourisme',
    name: 'DATAtourisme',
    license: 'Licence Ouverte 2.0 (Etalab)',
    links: [
      { label: 'datatourisme.fr', href: 'https://www.datatourisme.fr' },
      {
        label: 'etalab.gouv.fr (Licence Ouverte)',
        href: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence/',
      },
    ],
  },
  {
    id: 'wikidata',
    name: 'Wikidata',
    license: 'CC0 1.0',
    links: [
      { label: 'wikidata.org', href: 'https://www.wikidata.org' },
      { label: 'creativecommons.org (CC0)', href: 'https://creativecommons.org/publicdomain/zero/1.0/' },
    ],
  },
  {
    id: 'geotrek',
    name: 'Geotrek — parcs & PNR',
    license: 'Licence Ouverte 2.0 (Etalab)',
    links: [
      { label: 'rando.parc-ballons-vosges.fr', href: 'https://rando.parc-ballons-vosges.fr' },
      { label: 'rando.ecrins-parcnational.fr', href: 'https://rando.ecrins-parcnational.fr' },
      { label: 'rando.vanoise.com', href: 'https://rando.vanoise.com' },
    ],
  },
  {
    id: 'openmeteo',
    name: 'Open-Meteo',
    license: 'CC BY 4.0',
    links: [
      { label: 'open-meteo.com', href: 'https://open-meteo.com' },
      { label: 'creativecommons.org (CC BY 4.0)', href: 'https://creativecommons.org/licenses/by/4.0/' },
    ],
  },
  {
    id: 'copernicus',
    name: 'Copernicus DEM GLO-30',
    license: '© Union européenne — Copernicus',
    links: [{ label: 'copernicus.eu', href: 'https://www.copernicus.eu' }],
  },
  {
    id: 'commons',
    name: 'Wikimedia Commons',
    license: 'CC BY-SA / CC BY / domaine public (licence indiquée sous chaque photo)',
    links: [
      { label: 'commons.wikimedia.org', href: 'https://commons.wikimedia.org' },
      {
        label: 'Réutilisation',
        href: 'https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia',
      },
    ],
  },
  {
    id: 'photos',
    name: 'Unsplash & Pexels',
    license: 'Unsplash License / Pexels License',
    links: [
      { label: 'unsplash.com/license', href: 'https://unsplash.com/license' },
      { label: 'pexels.com/license', href: 'https://www.pexels.com/license/' },
    ],
  },
  {
    id: 'ademe',
    name: 'ADEME — Base Carbone®',
    license: 'Licence Ouverte (Etalab)',
    links: [{ label: 'base-empreinte.ademe.fr', href: 'https://base-empreinte.ademe.fr' }],
  },
  {
    id: 'mapbox',
    name: 'Mapbox',
    license: '© Mapbox © OpenStreetMap',
    links: [{ label: 'mapbox.com/about/maps', href: 'https://www.mapbox.com/about/maps/' }],
  },
];

export function LegalAttributions() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-4">
      <header className="fade-up flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tight text-trail">
          {t('legal.attributions_title')}
        </h1>
        <p className="text-sm leading-relaxed text-ridge">{t('legal.attributions_intro')}</p>
      </header>

      <ul className="flex flex-col gap-3">
        {SOURCES.map((source, i) => (
          <li
            key={source.id}
            className="fade-up rounded-xl border border-mist bg-snow p-4 shadow-sm"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <h2 className="font-display text-base font-bold text-trail">{source.name}</h2>
            <p className="mt-0.5 font-mono text-xs text-ridge">
              {t('legal.license_label')} {source.license}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ridge">{t(`legal.src_${source.id}`)}</p>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {source.links.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center text-sm font-medium text-copper-deep underline underline-offset-2 hover:text-trail"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </main>
  );
}
