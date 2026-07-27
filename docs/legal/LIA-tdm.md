# TRIPTIC — Analyse d'intérêt légitime (LIA) : pipeline TDM blogs → faits

> **Statut : brouillon v1 (2026-07-27) — à faire relire une fois par un avocat
> avec le jeu de règles versionné de l'agent de conformité
> (`server/src/agents/complianceAgent.ts`, version 1.0.0).**
> Cadre : CNIL 2025 / EDPB Opinion 28/2024.

## 1. Traitement

Extraction automatisée de **faits géographiques** (nom de lieu, type,
coordonnées, tags d'un mot) depuis des articles de blogs outdoor publics,
pour enrichir la base de lieux TRIPTIC. Base légale du volet propriété
intellectuelle : exception de fouille de textes et données (art. 4 directive
(UE) 2019/790, art. L122-5-3-III CPI), opt-out systématiquement honoré.

## 2. Finalité (test de finalité)

Améliorer la pertinence des itinéraires outdoor proposés aux utilisateurs
(lieux réels vérifiés). Finalité déterminée, explicite, légitime. Aucune
finalité de profilage de personnes.

## 3. Nécessité (test de nécessité)

- Seuls des **faits sur des lieux** sont conservés — jamais le texte, jamais
  les photos, jamais l'auteur.
- Minimisation : schéma de sortie contraint (enums/coordonnées/tags d'un
  mot), plafond de 15 faits par source, pas de champ libre (`summary = null`
  pour toute fiche `source='web'`).
- Les données personnelles ne sont **pas nécessaires** à la finalité : double
  filtre (regex email/téléphone/handle + contrôle LLM noms de personnes et
  données sensibles art. 9) avec rejet.

## 4. Mise en balance (test de balance)

- **Intérêts des titulaires de sites** : protégés par le respect de l'opt-out
  (robots.txt RFC 9309, ai.txt, meta `noai`/`notdm`/TDMRep, clauses en
  langage naturel détectées par l'agent — cf. LAION v. Kneschke), la liste
  d'exclusion, le plafond anti-mirroring (droit sui generis des bases,
  art. L342-3) et le recoupement obligatoire avec des sources ouvertes
  (OSM/DATAtourisme/Wikidata) qui rend le fait indépendant du blog.
- **Personnes concernées** : exposition résiduelle quasi nulle (aucun nom,
  contact ou pseudo conservé ; données sur des lieux, pas des personnes).
- **Attentes raisonnables** : contenus publiés publiquement ; user-agent
  identifiable (`TRIPTIC-TDM`) avec URL d'information et contact.

## 5. Garanties

- **Gate de production** : agent de conformité (Agent 5) — aucune fiche
  `active` sans son feu vert ; doute ⇒ quarantaine (`pending`, revue
  humaine) ; violation ⇒ rejet.
- **Audit trail** : chaque décision journalisée (Pino, `agent:"compliance"`,
  version du jeu de règles) — preuve de conformité et support du droit
  d'effacement.
- **Re-vérification** : le statut d'opt-out est re-contrôlé à chaque fetch et
  historisé (`tdm_sources.last_checked_at`).
- **Hébergement UE** : VPS en Union européenne, aucun transfert hors UE.
- **Droits** : notice publique (page /legal/tdm à publier), contact
  d'opposition/effacement ; l'effacement s'exécute par suppression des
  fiches `source='web'` de l'origine concernée + ajout à la liste
  d'exclusion.

## 6. Décision

Traitement retenu avec les garanties ci-dessus. Revue juridique du présent
document + du prompt de règles versionné : **recommandée, non bloquante**
(décision Jules, 2026-07-27).
