import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { PlaceKind } from '@triptic/shared';
import { kindFilterSql } from '../repo/places.js';

/**
 * Régression 07/08/2026 — les filtres Explore (Nature, Culture & villages,
 * Où manger, Spots de nuit) renvoyaient tous 500, en local ET en production :
 * `ANY(${kinds})` faisait développer le tableau par Drizzle en `ANY($1,$2,$3)`,
 * rejeté par Postgres (« op ANY/ALL (array) requires array on right side »).
 * Les mocks de repo ne pouvaient pas l'attraper — d'où ce test sur le SQL émis.
 */
const dialect = new PgDialect();
const render = (kinds: PlaceKind[] | undefined) => dialect.sqlToQuery(kindFilterSql(kinds));

describe('kindFilterSql', () => {
  it('émet un IN paramétré, jamais ANY(array)', () => {
    const { sql: text, params } = render(['castle', 'museum', 'village']);
    expect(text).toContain('kind IN (');
    expect(text).not.toContain('ANY(');
    // un placeholder par kind : c'est ce qui distingue IN(...) valide de ANY(...)
    expect(params).toEqual(['castle', 'museum', 'village']);
    expect(text.match(/\$\d+/g)).toHaveLength(3);
  });

  it('reste vide sans filtre (aucun kind demandé)', () => {
    for (const empty of [undefined, [] as PlaceKind[]]) {
      const { sql: text, params } = render(empty);
      expect(text.trim()).toBe('');
      expect(params).toEqual([]);
    }
  });

  it('gère un kind unique', () => {
    const { sql: text, params } = render(['lake']);
    expect(text).toContain('kind IN (');
    expect(params).toEqual(['lake']);
  });

  it('paramètre les valeurs (pas d’interpolation littérale)', () => {
    const { sql: text } = render(['village']);
    expect(text).not.toContain('village');
  });
});
