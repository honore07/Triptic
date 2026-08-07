---
name: blog-place-mining
description: >-
  Découvre des lieux outdoor peu connus (pépites) sur les blogs de voyage pour
  une zone géographique, et prépare leur import dans la base de lieux TRIPTIC via
  le pipeline TDM gated existant. Utilise ce skill dès que Jules veut « collecter
  des données », « fouiller les blogs », « trouver des lieux/pépites » ou
  « enrichir la base » pour une région (Alsace, Vosges, Alpes, vallée de Munster,
  Queyras…), même sans dire explicitement « blog » ou « scraping ». NE fait JAMAIS
  d'extraction directe en base : ce skill ne produit que des URLs vérifiées + les
  commandes VPS ; l'extraction et le feu vert juridique restent au pipeline
  `pnpm import:blog` + agent de conformité.
---

# Blog place mining — découverte de lieux pour TRIPTIC

## Ce que fait ce skill (et ce qu'il ne fait PAS)

Ce skill est **l'étage de découverte** : à partir d'une zone géographique, il
trouve les *articles de blog* outdoor qui parlent de lieux réels — surtout les
**pépites peu connues**, celles qu'on ne trouve ni sur OSM ni sur DATAtourisme —
et prépare leur passage dans le pipeline d'extraction existant.

Il **ne fait pas** l'extraction des faits, ni l'écriture en base. C'est délibéré
et **non négociable** : le projet a un pipeline TDM juridiquement cadré
(`server/src/import/blogs/runBlogImport.ts`) verrouillé par un **agent de
conformité** (`server/src/agents/complianceAgent.ts`) — aucune fiche ne devient
`active` sans son feu vert. Contourner ce garde-fou exposerait TRIPTIC
juridiquement (exception TDM, opt-out, RGPD). Donc :

> **Ce skill ne produit que des URLs vérifiées + les commandes à lancer sur le
> VPS. L'extraction, le recoupement et le feu vert restent au pipeline.**

Séparation des rôles :

| Étage | Où | Rôle |
|-------|-----|------|
| **Découverte** (ce skill) | Claude Code, ici | Trouver + trier les URLs d'articles, écarter les opt-out évidents, écrire la file d'attente |
| **Extraction + gate** | VPS, `pnpm import:blog` | Fetch, opt-out faisant foi, faits structurés, recoupement OSM, agent de conformité, insertion `active`/`pending`/rejet |

## Le déroulé (5 étapes)

### 1. Cadrer la zone

Traduire la zone donnée par Jules (ex. « vallée de Munster », « Queyras »,
« Alsace ») en **angles de recherche**. Chaque angle vise un type de pépite :

- **Rando & nature** : cascades, lacs d'altitude, gorges, points de vue, cols,
  sentiers peu fréquentés (« hors des sentiers battus », « randonnée secrète »)
- **Villages & patrimoine** : villages classés/oubliés, ruines, chapelles,
  châteaux méconnus
- **Bivouac & van life** : spots de bivouac, aires sauvages, coins van (recoupe
  iOverlander/Park4Night mais les blogs ont les spots confidentiels)
- **Refuges & tables** : fermes-auberges, refuges, buvettes d'alpage
- **Baignade & eau** : lacs baignables, vasques, sources

Adapter le catalogue au terrain (pas de « baignade » en haute montagne l'hiver).
Voir `references/search-angles.md` pour les gabarits de requêtes par angle et
par langue (fr/de/en — l'Alsace et les Alpes ont des blogs dans les trois).

### 2. Fan-out de découverte (sous-agents)

Lancer **un sous-agent `general-purpose` par angle** (dans le même message, pour
qu'ils tournent en parallèle), équipés de `WebSearch` + `WebFetch`. Chaque
sous-agent :

- cherche des **articles** (pas des pages d'accueil, pas des marketplaces)
- privilégie les **blogs indépendants / personnels** : c'est là que sont les
  pépites, pas sur les gros agrégateurs qui recopient OSM
- pour chaque candidat, renvoie **seulement des métadonnées de repérage** :
  `url`, `domaine`, `titre`, `langue`, `lieux pressentis` (noms visibles dans le
  titre/snippet), `pourquoi pertinent` (1 ligne)
- **ne fait pas d'extraction fine ni de copie de contenu** — il repère, il ne
  fouille pas (la fouille, c'est le pipeline, sur le VPS, sous conformité)

Consigne stricte à passer aux sous-agents (voir le prompt type dans
`references/subagent-prompt.md`) :

- **Exclure les sites officiels FFRP GR®/GRP®** (marques déposées — exclues des
  imports par les règles TRIPTIC) et les topos payants type marketplaces
- Ignorer tout ce qui n'est pas un lieu physique réel (matériel, récits perso
  sans lieu, actu)
- Ne pas inventer d'URL : ne remonter que des liens réellement trouvés

### 3. Pré-tri (cheap, avant d'engorger la file)

Le pipeline re-vérifie tout de façon faisant foi ; ce pré-tri sert juste à ne
pas gâcher des runs. Pour l'ensemble des candidats :

- **Dédoublonner par domaine** et **plafonner à ~3 articles par domaine** : le
  pipeline plafonne déjà à 15 faits/source (anti-mirroring, droit sui generis
  des bases). Au-delà de 3 articles d'un même blog, on sur-exploite une source —
  s'arrêter.
- **Écarter les opt-out évidents** : un `WebFetch` léger du `robots.txt` /
  `ai.txt` de l'origine + repérage d'une balise `noai`/`notdm`/`tdm-reservation`
  dans la page. En cas d'opt-out ⇒ retirer de la file (le pipeline le
  refuserait de toute façon, et on note l'origine comme « à exclure »).
- **Écarter les domaines déjà exclus** connus (liste tenue au fil de l'eau dans
  `references/excluded-domains.md`).

### 4. Écrire la file d'attente

Produire deux choses dans le repo :

1. **La file** : `server/src/import/blogs/queues/<zone-slug>.txt` — une URL par
   ligne, un commentaire `#` avec titre + lieux pressentis au-dessus de chaque
   bloc de domaine. Format dans `references/queue-format.md`.
2. **Les commandes VPS prêtes à coller** : un bloc bash qui boucle sur la file
   et appelle `pnpm import:blog -- --url=…` **séquentiellement** (jamais en
   parallèle — le KVM 2 sature si plusieurs imports écrivent dans `places` en
   même temps), avec log horodaté par page. Gabarit dans
   `references/queue-format.md`.

### 5. Présenter pour validation (checkpoint)

**Toujours s'arrêter ici et présenter à Jules avant tout run.** Résumé attendu :

- zone + nombre d'angles couverts
- nombre de domaines / d'articles retenus
- estimation grossière de lieux (somme des « lieux pressentis », plafonnée)
- opt-out rencontrés (domaines écartés)
- la file `<zone-slug>.txt` et le bloc de commandes VPS

Jules valide, lance les commandes sur le VPS (workflow habituel : il tape,
il valide), puis contrôle le résultat via l'API publique :

```bash
curl -s http://82.25.118.185:3001/api/places/stats
```

→ `tdm.sources_total` a augmenté ; `tdm.web_active`/`web_pending` > 0 si des
faits ont passé l'agent de conformité.

## Règles absolues (rappel — ne jamais transgresser)

1. **Jamais d'écriture directe en base** depuis ce skill. Uniquement des URLs +
   commandes. Le pipeline est le seul chemin vers `places`.
2. **Jamais de résumé, description, avis ou phrase recopiée** d'un blog dans les
   fichiers produits. On manipule des **URLs et des noms de lieux**, rien de
   l'expression du blog (les faits, pas l'expression — c'est toute la base
   légale du pipeline).
3. **Respecter l'opt-out** : un domaine en opt-out sort de la file, définitivement.
4. **Anti-mirroring** : ≤ 3 articles par domaine dans une file.
5. **Exclure GR®/GRP® FFRP** et les marketplaces payantes.
6. **Séquentiel sur le VPS**, jamais d'imports en parallèle.

## Pour aller plus loin

- `references/search-angles.md` — gabarits de requêtes par angle et par langue
- `references/subagent-prompt.md` — prompt type des sous-agents de découverte
- `references/queue-format.md` — format de la file + gabarit des commandes VPS
- `references/excluded-domains.md` — domaines écartés (opt-out, GR®, marketplaces)
