# TRIPTIC — Guide des Skills Claude Code
## Les meilleurs skills à installer pour construire l'app de A à Z

> Basé sur la recherche des repos les plus adoptés en 2026.
> Ce fichier complète le CLAUDE.md principal du projet.
> Installe ces skills **avant** de démarrer le développement.

---

## COMPRENDRE LES DEUX NIVEAUX

```
CLAUDE.md   → Toujours actif, chargé à chaque session.
              Contient les règles comportementales globales
              et le contexte projet TRIPTIC.

SKILL.md    → Déclenché à la demande ou automatiquement
              quand Claude détecte une tâche correspondante.
              Chaque skill est un dossier dans .claude/skills/
```

**Règle d'or :** 8 à 12 skills maximum. Au-delà, tu paies
un coût en tokens sans bénéfice. Supprime chaque mois
ce que tu n'as pas déclenché.

---

## INSTALLATION — STRUCTURE DU PROJET

```bash
triptic/
├── CLAUDE.md                   ← brief projet (déjà créé)
└── .claude/
    └── skills/                 ← tous les skills ici
        ├── karpathy-behavioral/
        ├── frontend-design/
        ├── react-native/
        ├── postgresql-postgis/
        ├── mapbox/
        ├── pwa-offline/
        ├── api-security/
        ├── ci-cd-vps/
        └── qa-loop/
```

---

## LES 9 SKILLS ESSENTIELS POUR TRIPTIC

---

### 1. 🧠 Karpathy Behavioral — PRIORITÉ ABSOLUE

**Pourquoi :** Le skill le plus important de tout l'écosystème.
144 000 étoiles GitHub en quelques semaines. Dérivé des
observations d'Andrej Karpathy sur les pièges classiques
des LLM en coding. Il empêche Claude de :
- Faire des hypothèses silencieuses et foncer sans vérifier
- Transformer 50 lignes en 500 lignes inutiles
- Modifier du code qu'il n'était pas censé toucher

**Source :** `github.com/multica-ai/andrej-karpathy-skills`

**Installation :**
```bash
# Méthode 1 — ajout direct au CLAUDE.md existant
curl https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/main/CLAUDE.md >> CLAUDE.md

# Méthode 2 — skill séparé
mkdir -p .claude/skills/karpathy-behavioral
curl -o .claude/skills/karpathy-behavioral/SKILL.md \
  https://raw.githubusercontent.com/swarmclawai/andrej-karpathy-skills/main/skills/karpathy-guidelines/SKILL.md
```

**Les 4 règles qu'il encode :**
```
1. Ne pas assumer — énoncer les hypothèses, demander si ambigu
2. Code minimum — rien de spéculatif, rien au-delà du demandé
3. Ne toucher que ce qui est demandé — zéro changement orthogonal
4. Vérifier avant d'exécuter — valider contre les critères de départ
```

**Applicable à TRIPTIC :** Critique pour éviter que Claude
ne réécrive le moteur IA entier quand tu lui demandes juste
de corriger un composant TripCard.

---

### 2. 🎨 Frontend Design (Anthropic officiel)

**Pourquoi :** Le skill officiel d'Anthropic pour le design UI.
277 000 installations. Donne à Claude une philosophie de design
avant qu'il touche au code. Résultat : composants qui ressemblent
à du travail de designer senior, pas à du code IA générique.

**Source :** Déjà installé dans l'environnement Anthropic.
Disponible aussi via : `github.com/nextlevelbuilder/ui-ux-pro-max-skill`

**Installation :**
```bash
# Via marketplace Claude Code
/plugin marketplace add anthropic/frontend-design

# Ou copie manuelle depuis l'environnement Anthropic
cp -r /mnt/skills/public/frontend-design .claude/skills/
```

**Applicable à TRIPTIC :**
- Génération du design system (palette summit/trail/ridge)
- Composants TripCard avec photo + overlay IA
- Interface chat conversationnel
- Carte Mapbox intégrée dans le layout
- Paywall modal avec bonne hiérarchie visuelle

**Commande d'invocation :**
```
/frontend-design Crée le composant TripCard avec photo Unsplash en fond,
overlay dégradé, et données (durée, dénivelé, difficulté) superposées.
Palette : --color-summit #1A6BDB, --color-trail #0D1B2A.
```

---

### 3. 📱 React Native Production Skills

**Pourquoi :** Skills spécialisés pour construire une app
React Native 0.76 en production. Couvre la New Architecture,
les patterns de performance, les tests, et Expo EAS.

**Source :** `github.com/maikotrindade/awesome-react-native-skills`
(distribution Claude Code marketplace)

**Installation :**
```bash
/plugin marketplace add maikotrindade/awesome-react-native-skills
/plugin install awesome-react-native-skills@awesome-react-native-skills

# Ou manuellement
mkdir -p .claude/skills/react-native
git clone https://github.com/maikotrindade/awesome-react-native-skills.git /tmp/rn-skills
cp -r /tmp/rn-skills/skills/* .claude/skills/react-native/
```

**Ce qu'il couvre pour TRIPTIC :**
```
- react-native-core         → composants natifs, platform APIs
- react-native-ecosystem    → navigation, state, maps
- react-native-performance  → profiling, optimisation mémoire
- react-native-testing      → React Native Testing Library v14
- expo-toolchain            → Router, EAS Build, SDK upgrades
- react-native-upgrade      → workflow de mise à jour 0.76+
```

**Applicable à TRIPTIC :**
- App mobile iOS + Android en parallèle
- Intégration @rnmapbox/maps pour les cartes offline
- react-native-purchases (RevenueCat) pour le paywall
- Performance des listes d'itinéraires

---

### 4. 🗄️ PostgreSQL + PostGIS

**Deux skills complémentaires à installer ensemble.**

#### 4a. PostgreSQL Best Practices
**Source :** `github.com/wimolivier/postgresql-best-practices`

```bash
mkdir -p .claude/skills/postgresql
git clone https://github.com/wimolivier/postgresql-best-practices.git \
  .claude/skills/postgresql
```

**Couvre :** JSONB patterns, Row Level Security, indexes,
partitioning, migrations, audit logging, performance tuning,
backup/recovery, encryption.

#### 4b. PostGIS Geospatial (critique pour TRIPTIC)
**Source :** `mcpmarket.com/tools/skills/postgis-geospatial-development`

```bash
mkdir -p .claude/skills/postgis
# Télécharger depuis le marketplace Claude Code
/plugin marketplace add postgis-geospatial-development
```

**Ce qu'il encode pour TRIPTIC :**
```
- Choix correct du SRID (4326 pour GPS, 3857 pour affichage carte)
- Requêtes géospatiales optimisées (spots dans un rayon de 20km)
- Index GIST sur les colonnes GEOGRAPHY
- Patterns de migration idempotents
- Calcul de distance, intersection, buffer sur les tracés GPX
```

#### 4c. Timescale pg-aiguide (MCP + skill)
**Source :** `github.com/timescale/pg-aiguide`
Accès sémantique à la documentation officielle PostgreSQL + PostGIS.

```bash
# Claude Code marketplace
claude plugin marketplace add timescale/pg-aiguide
claude plugin install pg@aiguide
```

**Applicable à TRIPTIC :**
```sql
-- Ce skill guide Claude pour écrire ce genre de requête correctement :
SELECT spots.name, spots.category,
       ST_Distance(spots.location::geography, trip.waypoints::geography) AS dist_m
FROM van_spots spots, trips trip
WHERE trip.id = $1
  AND ST_DWithin(spots.location::geography, trip.waypoints::geography, 20000)
ORDER BY dist_m ASC
LIMIT 10;
```

---

### 5. 🗺️ Mapbox Agent Skills (officiel Mapbox)

**Pourquoi :** Skill officiel publié par l'équipe Mapbox.
Donne à Claude les patterns d'intégration corrects pour
Mapbox GL JS, les SDKs iOS/Android, et le MCP DevKit.

**Source :** `github.com/mapbox/mapbox-agent-skills`

**Installation :**
```bash
# Via npx (recommandé)
npx skills add mapbox/mapbox-agent-skills

# Ou manuellement
git clone https://github.com/mapbox/mapbox-agent-skills.git /tmp/mapbox-skills
cp -r /tmp/mapbox-skills/skills/* .claude/skills/
```

**Ce qu'il couvre pour TRIPTIC :**
```
- mapbox-gl-js-integration    → React + MapboxGL (lifecycle, tokens, search)
- mapbox-ios-sdk              → Swift/SwiftUI + offline maps
- mapbox-android-sdk          → Kotlin/Jetpack Compose + offline
- mapbox-style-patterns       → layers, sources, configurations
- mapbox-offline              → téléchargement tuiles, région manager
- mapbox-static-images        → previews statiques pour les 3 TripCards
- mapbox-geospatial-patterns  → intégration avec Turf.js, travel planning
```

**MCP server Mapbox (optionnel mais puissant) :**
```bash
# Ajoute les outils live : create styles, generate previews, validate tokens
# Dans .mcp.json du projet
{
  "mcpServers": {
    "mapbox": {
      "command": "npx",
      "args": ["-y", "@mapbox/mcp-devkit"]
    }
  }
}
```

**Applicable à TRIPTIC :**
Claude saura générer les previews statiques des 3 trips,
configurer le mode offline pour les tuiles, et intégrer
correctement les cartes dans React Native.

---

### 6. 📡 PWA + Offline First

**Pourquoi :** TRIPTIC doit fonctionner sans réseau —
zones de montagne, bivouac, vallées sans signal. Ce skill
encode les patterns Workbox, service workers, et cache stratégies.

**Source :** `github.com/Mindrally/skills` (skill `pwa-patterns`)
ou `github.com/mingrath/awesome-claude-skills` (skill `pwa-offline`)

```bash
mkdir -p .claude/skills/pwa-offline
git clone https://github.com/Mindrally/skills.git /tmp/mindrally-skills
cp -r /tmp/mindrally-skills/pwa .claude/skills/pwa-offline/

# Alternative via awesome-claude-skills
git clone https://github.com/mingrath/awesome-claude-skills.git /tmp/awesome-skills
cp -r /tmp/awesome-skills/skills/pwa-offline .claude/skills/
```

**Ce qu'il encode pour TRIPTIC :**
```
- Service worker Workbox avec stratégies de cache (CacheFirst, NetworkFirst)
- App Shell caching (React + Vite)
- Background sync pour sauvegarder les itinéraires hors-ligne
- IndexedDB pour stocker les données trip localement
- Indicateur online/offline dans l'UI
- Gestion des téléchargements de tuiles Mapbox par région
- Sync automatique quand le réseau revient
```

---

### 7. 🔒 API Security + RGPD

**Pourquoi :** TRIPTIC gère des données utilisateurs européens,
des clés API sensibles (Stripe, Deepseek), et des webhooks.
Un skill sécurité évite les erreurs classiques.

**Source :** `github.com/rohitg00/awesome-claude-code-toolkit`
(section security skills) ou skills communautaires

```bash
mkdir -p .claude/skills/api-security

# Créer le SKILL.md manuellement (voir contenu ci-dessous)
cat > .claude/skills/api-security/SKILL.md << 'EOF'
---
name: api-security
description: Security best practices for Node.js/Express APIs, JWT auth,
  RGPD compliance, Stripe webhooks, and API key management. Triggers on
  any authentication, payment, or data handling task.
user-invocable: false
---

# API Security — TRIPTIC

## JWT & Auth
- Toujours valider le JWT côté serveur avant d'accéder aux données user
- Expiration courte (15min) + refresh token httpOnly cookie
- Rate limiting sur /api/auth/* (max 5 req/min par IP)

## Clés API
- Jamais de clé API dans le code ou les logs
- Variables d'env uniquement (.env non versionné, .env.example versionné)
- Rotation des clés en cas de suspicion de fuite

## Stripe Webhooks
- Toujours vérifier la signature webhook (stripe.webhooks.constructEvent)
- Idempotence : vérifier si l'événement a déjà été traité (event.id en BDD)
- Répondre 200 immédiatement, traiter en async

## RGPD
- Données utilisateurs sur VPS EU uniquement (Hostinger EU)
- Deepseek : ne pas envoyer de données personnelles identifiables dans les prompts
- Droit à l'effacement : endpoint DELETE /api/user implémenté
- Logs : anonymiser les IPs après 7 jours

## Input Sanitization (protection prompt injection)
- Toute entrée utilisateur qui entre dans un prompt Deepseek doit être :
  1. Limitée en longueur (max 2000 chars)
  2. Débarrassée des balises système (system:, assistant:, <|im_start|>)
  3. Échappée pour éviter les injections markdown qui brisent les limites de prompt
EOF
```

---

### 8. 🚀 CI/CD + Déploiement VPS

**Pourquoi :** TRIPTIC se déploie sur ton VPS Hostinger
avec Nginx + PM2 + GitHub Actions. Ce skill encode les patterns
de déploiement continu spécifiques à cette stack.

**Source :** `github.com/mingrath/awesome-claude-skills`
(skills `github-actions` + `release-automation`)

```bash
mkdir -p .claude/skills/ci-cd-vps
git clone https://github.com/mingrath/awesome-claude-skills.git /tmp/aws
cp -r /tmp/aws/skills/github-actions .claude/skills/ci-cd-vps/
cp -r /tmp/aws/skills/release-automation .claude/skills/ci-cd-vps/

# Ajouter la config VPS spécifique
cat >> .claude/skills/ci-cd-vps/SKILL.md << 'EOF'

## Config spécifique TRIPTIC VPS

Stack : Nginx + PM2 + Node.js 22 + PostgreSQL 16 + Redis 7
Hébergeur : Hostinger KVM 2 (Ubuntu 24.04)
Domaine : triptic.app (Cloudflare)

GitHub Actions → SSH → VPS workflow :
1. Build React (Vite) → dist/
2. Tests (Vitest)
3. SSH vers VPS : git pull + npm install + pm2 reload
4. Nginx reload si config changée
5. Notification Telegram si déploiement OK/KO

PM2 ecosystem.config.js :
- app "triptic-api" → server/src/index.js
- instances: "max" (utilise tous les cœurs)
- watch: false (pas de watch en prod)
- env_production: NODE_ENV=production
EOF
```

---

### 9. 🔄 QA Loop — Audit & Fix

**Pourquoi :** Un skill qui audite l'app en production,
écrit les problèmes dans QA.md, puis les corrige itérativement.
Indispensable pour maintenir la qualité après le lancement.

**Source :** `awesomeclaude.ai/awesome-claude-code`
(skill `site-qa-improvement-loop`)

```bash
mkdir -p .claude/skills/qa-loop

cat > .claude/skills/qa-loop/SKILL.md << 'EOF'
---
name: qa-loop
description: Audits the TRIPTIC app for bugs, design drift, broken links,
  performance issues, and accessibility violations. Writes findings to QA.md,
  then fixes them incrementally. Trigger at the start of any production session.
user-invocable: true
---

# QA Loop — TRIPTIC

## Audit (Phase 1)
1. Vérifier les routes API (health check, erreurs 500)
2. Tester les flows critiques : génération trip → affichage 3 cards → sélection → export GPX
3. Vérifier le paywall (free → limit → modal → Stripe)
4. Tester i18n (fr/en/de) sur tous les composants
5. Accessibilité : contraste, aria-labels, focus visible
6. Performance : Lighthouse score ≥ 85 (mobile)
7. Offline : service worker actif, tuiles disponibles
8. Écrire tous les problèmes dans QA.md avec priorité (P1/P2/P3)

## Fix (Phase 2)
1. Lire QA.md
2. Traiter les P1 (bloquants) en premier
3. Un fix = un commit avec message conventionnel
4. Re-tester après chaque fix
5. Archiver dans QA.md avec statut "FIXED + date"

## Règles
- Ne jamais fixer un P2 si des P1 existent
- Chaque fix doit avoir un test associé
- Ne pas introduire de régression (run tests avant commit)
EOF
```

---

## INSTALLATION COMPLÈTE EN UNE FOIS

Copie-colle ce script dans ton terminal à la racine du projet TRIPTIC :

```bash
#!/bin/bash
echo "🏔️ Installation des skills TRIPTIC..."

# Créer la structure
mkdir -p .claude/skills

# 1. Karpathy behavioral (dans CLAUDE.md)
echo "" >> CLAUDE.md
echo "---" >> CLAUDE.md
echo "## RÈGLES COMPORTEMENTALES (Karpathy)" >> CLAUDE.md
curl -s https://raw.githubusercontent.com/multica-ai/andrej-karpathy-skills/main/CLAUDE.md >> CLAUDE.md
echo "✅ Karpathy behavioral → CLAUDE.md"

# 2. Frontend Design (depuis l'env Anthropic si disponible)
if [ -d "/mnt/skills/public/frontend-design" ]; then
  cp -r /mnt/skills/public/frontend-design .claude/skills/
  echo "✅ Frontend Design → .claude/skills/"
else
  echo "⚠️  Frontend Design : installer via /plugin marketplace add anthropic/frontend-design"
fi

# 3. React Native
mkdir -p .claude/skills/react-native
echo "⚠️  React Native : /plugin marketplace add maikotrindade/awesome-react-native-skills"

# 4. PostgreSQL + PostGIS
mkdir -p .claude/skills/postgresql-postgis
git clone --quiet https://github.com/wimolivier/postgresql-best-practices.git \
  .claude/skills/postgresql-postgis/postgresql 2>/dev/null || \
  echo "⚠️  PostgreSQL : git clone manuel requis"
echo "⚠️  PostGIS : /plugin marketplace add postgis-geospatial-development"
echo "⚠️  pg-aiguide MCP : claude plugin marketplace add timescale/pg-aiguide"

# 5. Mapbox
echo "⚠️  Mapbox : npx skills add mapbox/mapbox-agent-skills"

# 6. PWA Offline
mkdir -p .claude/skills/pwa-offline
echo "⚠️  PWA Offline : git clone depuis Mindrally/skills"

# 7. API Security (créé inline)
mkdir -p .claude/skills/api-security
# [contenu SKILL.md comme défini ci-dessus]
echo "✅ API Security → créer SKILL.md manuellement (contenu dans ce guide)"

# 8. CI/CD VPS (créé inline)
mkdir -p .claude/skills/ci-cd-vps
echo "✅ CI/CD VPS → créer SKILL.md manuellement (contenu dans ce guide)"

# 9. QA Loop (créé inline)
mkdir -p .claude/skills/qa-loop
echo "✅ QA Loop → créer SKILL.md manuellement (contenu dans ce guide)"

echo ""
echo "🏔️ TRIPTIC Skills installés. Ouvre Claude Code et lance :"
echo "   'Lis le CLAUDE.md et commence la Phase 1, étape 1.'"
```

---

## SKILLS SUPPLÉMENTAIRES — SI BESOIN EN COURS DE ROUTE

Ces skills ne sont pas critiques au démarrage mais peuvent
être utiles selon les étapes :

| Skill | Quand l'installer | Source |
|---|---|---|
| `drizzle-orm` | Dès la Phase 1 (BDD) | Mindrally/skills |
| `stripe-payments` | Phase 3 (paywall) | mingrath/awesome-claude-skills |
| `react-query-patterns` | Phase 2 (data fetching) | Mindrally/skills |
| `i18n-react` | Phase 2 (internationalisation) | Community |
| `framer-motion` | Phase 2 (animations) | Community |
| `vitest-testing` | Phase 2 (tests) | jeffallan/claude-skills |
| `pino-logging` | Phase 1 (logs structurés) | Community |
| `redis-patterns` | Phase 2 (cache) | mingrath/awesome-claude-skills |

---

## WORKFLOW TYPE D'UNE SESSION CLAUDE CODE

```
1. Claude Code démarre → lit CLAUDE.md automatiquement
2. Tu donnes une tâche → Claude détecte les skills pertinents
3. Skills chargés à la demande (pas tous en même temps)
4. Claude code → tu valides → tu commits
5. Si bug → tu passes le log d'erreur à Claude → il corrige
6. Si nouvelle feature → tu décris le besoin → Claude propose
   le plan avant de coder (règle Karpathy #1)
```

**Commandes utiles en session :**
```
/frontend-design [description]    → design d'un composant
/qa-loop                          → audit + fix en production
/skills list                      → voir les skills chargés
/skills reload                    → recharger si modifié
```

---

## RÈGLES SUPPLÉMENTAIRES À AJOUTER AU CLAUDE.md

Ajoute ce bloc à la fin de ton CLAUDE.md actuel.
Ces règles complètent les skills et s'appliquent toujours :

```markdown
## RÈGLES TRIPTIC SPÉCIFIQUES (toujours actives)

### Sur le moteur IA
- Ne jamais appeler Deepseek sans passer par l'agent correcteur (R1)
- Toujours streamer les réponses (SSE) — ne jamais attendre la réponse complète
- Les 3 trips doivent varier sur 1-2 axes max. Si tu génères 3 trips très différents, STOP et reformule.
- Coût cible par génération : < 0,02€. Si un appel dépasse 0,05€, optimiser le prompt.

### Sur le code
- Chaque composant React a son fichier de test Vitest associé
- Chaque route API a sa validation Zod sur les inputs
- Tout texte visible dans l'UI passe par i18next (fr/en/de)
- Toute requête géospatiale utilise PostGIS, pas de calcul géo en JS

### Sur le déploiement
- Ne jamais déployer sans avoir ran les tests (npm test)
- Toujours créer une PR GitHub plutôt que de push direct sur main
- PM2 reload > PM2 restart (zéro downtime)
- Vérifier le health check après chaque déploiement

### Sur la sécurité
- Aucune donnée personnelle dans les prompts Deepseek
- Vérifier la signature Stripe sur chaque webhook
- Rate limiting sur toutes les routes /api/ai/*
- Logs : pas d'email, pas d'IP, pas de token dans les logs Pino
```

---

## RESSOURCES

```
Écosystème skills Claude Code  : awesomeclaude.ai/awesome-claude-code
Marketplace officiel           : claude.ai/marketplace (ou /plugin marketplace)
Repo awesome all skills        : github.com/mingrath/awesome-claude-skills
240+ skills Mindrally          : github.com/Mindrally/skills
Toolkit complet 135+ agents    : github.com/rohitg00/awesome-claude-code-toolkit
Standard ouvert AgentSkills    : agentskills.io
React Native skills Callstack  : github.com/callstackincubator/agent-skills
```

---

*TRIPTIC Skills Guide — Juillet 2026*
*À mettre à jour à chaque nouveau skill installé.*
*Conserver dans le repo sous `.claude/SKILLS_GUIDE.md`*
