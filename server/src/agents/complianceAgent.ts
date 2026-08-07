import { extractJson, type LlmProvider } from '@triptic/ai-engine';
import { z } from 'zod';
import { logger } from '../logger.js';
import {
  containsPersonalData,
  hasCopiedPhrase,
  MAX_FACTS_PER_SOURCE,
  type BlogFact,
  type OptOutCheck,
} from '../services/blogMining.js';

/**
 * AGENT 5 — Agent de conformité IA (roadmap 6.7). GATE DE PRODUCTION :
 * aucune fiche issue du web ne passe en status='active' sans son feu vert.
 *
 * Le jeu de règles ci-dessous est VERSIONNÉ : c'est ce texte (et lui seul)
 * qu'un avocat relira. Toute modification = incrément de version + entrée
 * dans l'historique. Chaque décision est journalisée (Pino, audit: true) —
 * c'est l'audit trail qui prouve la conformité et permet l'effacement sur
 * demande (RGPD).
 */

// Historique du jeu de règles versionné (relecture avocat = ce prompt + la LIA) :
//   1.0.0 (2026-07-27) — jeu initial : faits géo seuls (nom, type, coords, tags)
//   1.1.0 (2026-08-06) — ouverture aux infos pratiques factuelles (altitude,
//                        tarif indicatif, saison, difficulté). Restent des
//                        FAITS attachés à un lieu ; le contrôle « expression /
//                        sélection éditoriale » couvre désormais explicitement
//                        la reprise de classements (top N, palmarès).
export const COMPLIANCE_RULES_VERSION = '1.1.0';

/** Règles LLM versionnées (relecture avocat : ce prompt + la LIA). */
export const COMPLIANCE_RULES_PROMPT = `Tu es l'agent de conformité de TRIPTIC (version ${COMPLIANCE_RULES_VERSION}).
On te donne le texte d'une page web source et une liste de faits structurés qui en ont été extraits.
Tu appliques l'exception européenne de fouille de textes et données (art. 4 directive 2019/790, art. L122-5-3-III CPI) : la fouille commerciale est licite SAUF opposition du titulaire, et seuls les FAITS (non protégés) peuvent être conservés — jamais l'expression.

Les faits peuvent porter, en plus du nom/type/coordonnées/tags, des INFOS PRATIQUES factuelles : altitude (m), tarif indicatif (€), gratuité, saisons conseillées, niveau de difficulté. Un chiffre ou un niveau brut attaché à UN lieu est un fait (non protégé). En revanche, reprendre le CLASSEMENT ou la SÉLECTION de l'auteur (un « top 10 », un palmarès, un ordre de préférence) est de l'expression.

CONTRÔLES À FAIRE :
1. RÉSERVE TDM/IA : le texte contient-il une clause d'opposition, même en langage naturel (« toute reproduction interdite », « no scraping », « no AI training », « contenu protégé », CGU restrictives…) ? Une clause en langage naturel COMPTE (jurisprudence LAION v. Kneschke).
2. EXPRESSION : un des faits reprend-il une formulation, un jugement ou une sélection éditoriale de l'article (ex. reproduire un « top 10 » tel quel, ou l'ordre/le palmarès de l'auteur) plutôt qu'un fait brut ? Un tarif ou une altitude isolés ne sont PAS de l'expression ; un classement, oui.
3. RGPD : un des faits contient-il des données personnelles (nom de personne physique, email, téléphone, pseudo) ou sensibles (art. 9 : santé, religion, opinions…) ?

Réponds UNIQUEMENT avec un objet JSON :
{"tdm_reservation": boolean, "expression_issue": boolean, "personal_data": boolean, "notes": ["<phrase courte par problème détecté>"]}
En cas de doute sur un contrôle, réponds true pour ce contrôle (principe de précaution).`;

const llmVerdictSchema = z.object({
  tdm_reservation: z.boolean(),
  expression_issue: z.boolean(),
  personal_data: z.boolean(),
  notes: z.array(z.string()).default([]),
});

export type ComplianceDecision = 'approve' | 'quarantine' | 'reject';

export interface ComplianceContext {
  sourceUrl: string;
  optOut: OptOutCheck;
  /** Compteur cumulé d'extraction de cette source (anti-mirroring). */
  sourceExtractedCount: number;
  /** Source figurant sur la liste d'exclusion manuelle. */
  sourceExcluded: boolean;
  /** Le fait est-il confirmé par OSM/DATAtourisme/Wikidata (< 300 m) ? */
  crossChecked: boolean;
  pageText: string;
  fetchDate: Date;
}

export interface ComplianceVerdict {
  decision: ComplianceDecision;
  reasons: string[];
  rulesVersion: string;
}

/**
 * Décision de conformité pour UN fait candidat. Ordre : contrôles
 * déterministes (rejet immédiat) → contrôle LLM (réserve CGU, expression,
 * RGPD) → recoupement (quarantaine si non confirmé).
 */
export async function reviewFact(
  provider: LlmProvider,
  fact: BlogFact,
  context: ComplianceContext,
): Promise<ComplianceVerdict> {
  const reasons: string[] = [];

  // 1. Opt-out / exclusion / provenance — violations avérées ⇒ rejet
  if (context.sourceExcluded) reasons.push('source sur liste d’exclusion');
  if (context.optOut.status === 'opted_out') {
    reasons.push(`opt-out source (${context.optOut.detail ?? 'détecté'})`);
  }
  if (!context.sourceUrl || !context.fetchDate) reasons.push('provenance incomplète');
  if (context.sourceExtractedCount >= MAX_FACTS_PER_SOURCE) {
    reasons.push('plafond anti-mirroring atteint pour cette source');
  }
  if (hasCopiedPhrase(fact.name, context.pageText)) reasons.push('nom = phrase copiée');
  if (containsPersonalData([fact.name, ...fact.tags].join(' '))) {
    reasons.push('données personnelles dans le fait');
  }
  if (reasons.length > 0) {
    return log(fact, context, { decision: 'reject', reasons, rulesVersion: COMPLIANCE_RULES_VERSION });
  }

  // 2. Contrôle LLM (règles versionnées) — indisponible ⇒ quarantaine, jamais publication
  let llmNotes: string[] = [];
  try {
    const raw = await provider.correct({
      system: COMPLIANCE_RULES_PROMPT,
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            fact,
            page_excerpt: context.pageText.slice(0, 8000),
          }),
        },
      ],
      maxTokens: 800,
    });
    const verdict = llmVerdictSchema.parse(extractJson(raw));
    if (verdict.tdm_reservation) reasons.push('réserve TDM détectée dans la page/CGU');
    if (verdict.personal_data) reasons.push('données personnelles détectées (LLM)');
    if (verdict.expression_issue) reasons.push('expression/sélection éditoriale reproduite');
    llmNotes = verdict.notes;
  } catch {
    return log(fact, context, {
      decision: 'quarantine',
      reasons: ['agent LLM indisponible — revue humaine requise'],
      rulesVersion: COMPLIANCE_RULES_VERSION,
    });
  }
  if (reasons.length > 0) {
    return log(fact, context, {
      decision: 'reject',
      reasons: [...reasons, ...llmNotes],
      rulesVersion: COMPLIANCE_RULES_VERSION,
    });
  }

  // 3. Recoupement OSM/DATAtourisme/Wikidata : non confirmé ⇒ quarantaine
  if (!context.crossChecked) {
    return log(fact, context, {
      decision: 'quarantine',
      reasons: ['fait non recoupé par OSM/DATAtourisme/Wikidata'],
      rulesVersion: COMPLIANCE_RULES_VERSION,
    });
  }

  return log(fact, context, {
    decision: 'approve',
    reasons: [],
    rulesVersion: COMPLIANCE_RULES_VERSION,
  });
}

/** Audit trail Pino — une ligne par décision (preuve de conformité). */
function log(
  fact: BlogFact,
  context: ComplianceContext,
  verdict: ComplianceVerdict,
): ComplianceVerdict {
  logger.info(
    {
      audit: true,
      agent: 'compliance',
      rulesVersion: verdict.rulesVersion,
      decision: verdict.decision,
      reasons: verdict.reasons,
      fact: { name: fact.name, kind: fact.kind },
      source: context.sourceUrl,
      optOut: context.optOut.status,
      fetchDate: context.fetchDate.toISOString(),
    },
    'Compliance decision',
  );
  return verdict;
}

/** Statut de fiche places selon la décision (jamais active sans approve). */
export function statusForDecision(decision: ComplianceDecision): 'active' | 'pending' | null {
  if (decision === 'approve') return 'active';
  if (decision === 'quarantine') return 'pending';
  return null; // reject : la fiche n'entre pas en base
}
