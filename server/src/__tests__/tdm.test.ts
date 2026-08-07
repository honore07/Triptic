import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider } from '@triptic/ai-engine';
import {
  checkOptOut,
  containsPersonalData,
  extractFacts,
  hasCopiedPhrase,
  htmlOptsOut,
  htmlToText,
  robotsDisallowsAll,
  MAX_FACTS_PER_SOURCE,
} from '../services/blogMining.js';
import {
  COMPLIANCE_RULES_VERSION,
  reviewFact,
  statusForDecision,
  type ComplianceContext,
} from '../agents/complianceAgent.js';

describe('opt-out (6 — base légale TDM)', () => {
  it('robots.txt : Disallow / pour * ou TRIPTIC = opt-out', () => {
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /')).toBe(true);
    expect(robotsDisallowsAll('User-agent: TRIPTIC-TDM\nDisallow: /')).toBe(true);
    expect(robotsDisallowsAll('User-agent: *\nDisallow: /admin/')).toBe(false);
    expect(robotsDisallowsAll('User-agent: GPTBot\nDisallow: /')).toBe(false);
  });

  it('balises meta noai / notdm / TDMRep = opt-out', () => {
    expect(htmlOptsOut('<meta name="robots" content="noai, noimageai">')).toContain('noai');
    expect(htmlOptsOut('<meta name="tdm-reservation" content="1">')).toBe('tdm-reservation');
    expect(htmlOptsOut('<meta name="robots" content="index, follow">')).toBeNull();
  });

  it('checkOptOut interroge robots.txt et ai.txt de l’origine', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow: /');
      }
      return new Response('', { status: 404 });
    });
    const result = await checkOptOut(
      'https://blog.example/article',
      '<html></html>',
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ status: 'opted_out', detail: 'robots.txt' });
  });
});

describe('faits, pas expression (6 — anti-copie + RGPD)', () => {
  const SOURCE =
    'Nous avons adoré cette magnifique randonnée vers le lac Blanc au petit matin, ' +
    'un moment suspendu entre les sapins givrés et la brume dorée du sommet.';

  it('détecte une phrase copiée (6 mots consécutifs)', () => {
    expect(hasCopiedPhrase('un moment suspendu entre les sapins givrés', SOURCE)).toBe(true);
    expect(hasCopiedPhrase('Lac Blanc', SOURCE)).toBe(false); // nom court = fait
    expect(hasCopiedPhrase('Sentier des Roches du Frankenthal', SOURCE)).toBe(false);
  });

  it('filtre emails, téléphones et handles (RGPD)', () => {
    expect(containsPersonalData('contact jean.dupont@gmail.com')).toBe(true);
    expect(containsPersonalData('réserver au 03 89 77 90 20')).toBe(true);
    expect(containsPersonalData('suivez @vosgesaventure')).toBe(true);
    expect(containsPersonalData('Lac Blanc')).toBe(false);
  });

  it('rejette un nom copié, assainit les tags sans jeter le fait, et plafonne', async () => {
    const facts = Array.from({ length: 20 }, (_, i) => ({
      name: `Lieu ${i}`,
      kind: 'lake',
      lat: 48.1,
      lng: 7.1,
      tags: ['baignade'],
    }));
    facts[0] = { ...facts[0]!, name: 'un moment suspendu entre les sapins givrés' }; // nom copié → rejeté
    facts[1] = { ...facts[1]!, tags: ['vue panoramique'] }; // tag multi-mots (≤20c) → retiré, fait gardé
    const provider: LlmProvider = {
      name: 'mock',
      complete: async () => JSON.stringify({ facts }),
      correct: async () => '{}',
    };
    const result = await extractFacts(provider, SOURCE);
    expect(result.rejected).toBe(1); // seul le nom copié
    expect(result.facts.length).toBe(MAX_FACTS_PER_SOURCE); // 19 valides plafonnés à 15
    expect(result.facts.every((f) => !f.name.includes('suspendu'))).toBe(true);
    expect(result.facts.every((f) => f.tags.every((t) => !t.includes(' ')))).toBe(true); // tags assainis
  });

  it('remonte la réserve TDM signalée par le modèle', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      complete: async () => JSON.stringify({ facts: [], tdm_reservation: true }),
      correct: async () => '{}',
    };
    const result = await extractFacts(provider, 'Toute reproduction interdite.');
    expect(result.tdmReservation).toBe(true);
  });
});

describe('agent de conformité (6.7 — gate de production)', () => {
  const FACT = { name: 'Lac Blanc', kind: 'lake' as const, lat: 48.1364, lng: 7.0942, tags: ['baignade'] };
  const CLEAN_LLM = '{"tdm_reservation": false, "expression_issue": false, "personal_data": false, "notes": []}';

  function makeContext(overrides: Partial<ComplianceContext> = {}): ComplianceContext {
    return {
      sourceUrl: 'https://blog.example/article',
      optOut: { status: 'allowed', detail: null },
      sourceExtractedCount: 0,
      sourceExcluded: false,
      crossChecked: true,
      pageText: 'Le lac est accessible en une heure de marche.',
      fetchDate: new Date('2026-07-27T10:00:00Z'),
      ...overrides,
    };
  }

  function makeProvider(correctResponse: string): LlmProvider {
    return { name: 'mock', complete: async () => '{}', correct: async () => correctResponse };
  }

  it('approuve un fait recoupé, sans réserve, sans données perso', async () => {
    const verdict = await reviewFact(makeProvider(CLEAN_LLM), FACT, makeContext());
    expect(verdict.decision).toBe('approve');
    expect(verdict.rulesVersion).toBe(COMPLIANCE_RULES_VERSION);
    expect(statusForDecision(verdict.decision)).toBe('active');
  });

  it('rejette si la source a opté-out ou est exclue (sans même appeler le LLM)', async () => {
    const provider = makeProvider(CLEAN_LLM);
    const optedOut = await reviewFact(provider, FACT, makeContext({
      optOut: { status: 'opted_out', detail: 'robots.txt' },
    }));
    expect(optedOut.decision).toBe('reject');
    const excluded = await reviewFact(provider, FACT, makeContext({ sourceExcluded: true }));
    expect(excluded.decision).toBe('reject');
    expect(statusForDecision('reject')).toBeNull();
  });

  it('rejette au plafond anti-mirroring', async () => {
    const verdict = await reviewFact(makeProvider(CLEAN_LLM), FACT, makeContext({
      sourceExtractedCount: MAX_FACTS_PER_SOURCE,
    }));
    expect(verdict.decision).toBe('reject');
    expect(verdict.reasons.join(' ')).toContain('anti-mirroring');
  });

  it('rejette quand le LLM détecte une réserve TDM en langage naturel', async () => {
    const verdict = await reviewFact(
      makeProvider('{"tdm_reservation": true, "expression_issue": false, "personal_data": false, "notes": ["CGU : no scraping"]}'),
      FACT,
      makeContext(),
    );
    expect(verdict.decision).toBe('reject');
    expect(verdict.reasons.join(' ')).toContain('réserve TDM');
  });

  it('met en quarantaine un fait non recoupé (jamais publié directement)', async () => {
    const verdict = await reviewFact(makeProvider(CLEAN_LLM), FACT, makeContext({ crossChecked: false }));
    expect(verdict.decision).toBe('quarantine');
    expect(statusForDecision(verdict.decision)).toBe('pending');
  });

  it('met en quarantaine si l’agent LLM est indisponible (précaution)', async () => {
    const provider: LlmProvider = {
      name: 'mock',
      complete: async () => '{}',
      correct: async () => {
        throw new Error('down');
      },
    };
    const verdict = await reviewFact(provider, FACT, makeContext());
    expect(verdict.decision).toBe('quarantine');
  });
});

describe('htmlToText', () => {
  it('retire scripts, styles et balises', () => {
    const text = htmlToText(
      '<html><script>evil()</script><style>.a{}</style><p>Lac <b>Blanc</b> &amp; sapins</p></html>',
    );
    expect(text).toBe('Lac Blanc sapins');
    expect(text).not.toContain('evil');
  });
});
