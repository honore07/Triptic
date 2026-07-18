# TRIPTIC — CLAUDE.md
## Instructions complètes pour Claude Code (Fable 5)

> Ce fichier est le brief complet du projet TRIPTIC.
> Claude Code doit le lire intégralement avant toute action.
> Il contient : contexte produit, architecture technique, conventions de code,
> accès infrastructure, ordre de build et règles de qualité.

---

## 0. CONTEXTE & IDENTITÉ DU PROJET

**Nom :** TRIPTIC
**Tagline :** Plan, Explore, Repeat.
**Concept :** Application de planification d'aventures multi-modales (road trip → trek → bikepacking) propulsée par IA conversationnelle. L'utilisateur décrit son envie en langage naturel ; l'IA génère **3 itinéraires très similaires mais en compétition**, illustrés par des **photos réelles (Unsplash/Pexels) enrichies de données IA superposées**. L'utilisateur choisit, affine à la main ou via l'IA, et exporte.

**Fondateur :** Jules (Alsace, France) — van lifer, randonneur, étudiant en commerce
**Langues de l'app :** Français · English · Deutsch (i18n dès la v1)
**Plateformes :** PWA web + React Native mobile (iOS & Android) — développées en parallèle

---

## 1. VISION PRODUIT

### Promesse centrale
> "Tu décris ton aventure. TRIPTIC te propose 3 itinéraires sur-mesure — proches mais distincts sur 1 ou 2 paramètres clés (durée, ambiance, difficulté physique). Tu choisis. Tu peaufines. Tu pars."

### Principe UX fondamental — "Progressivement complexe"
- **Utilisateur débutant** : une seule question visible au démarrage ("Où veux-tu aller ?")
- **Utilisateur avancé** : accès à tous les paramètres (dénivelé, surface, eau, camping, solo/groupe, météo, niveau physique)
- La profondeur existe mais ne s'impose pas

### Les 3 trips proposés — logique de différenciation
Les 3 trips générés doivent :
- Correspondre aux critères principaux de l'utilisateur (région, durée globale, type d'activité)
- Se différencier **subtilement** sur 1 ou 2 axes seulement (ex. : difficulté physique légèrement différente, 1 étape de plus, ambiance "sauvage" vs "avec services")
- Être présentés côte à côte avec :
  - Photo de fond réelle (Unsplash API ou Pexels API, filtrée par lieu/ambiance)
  - Données IA superposées : nom du trip, durée totale, dénivelé cumulé, type de terrain, icône de difficulté
  - Mini-carte du tracé en preview (Mapbox static image API)
- Les 3 trips doivent donner envie de tous les faire — le choix doit être difficile et plaisant

---

## 2. STACK TECHNIQUE COMPLÈTE

### Frontend Web (PWA)
```
Framework    : React 19 + Vite 6
Styling      : Tailwind CSS v4 + CSS custom properties
Routing      : React Router v7
State        : Zustand v5 (léger, no boilerplate)
Maps         : Mapbox GL JS v3 (carte interactive)
i18n         : i18next + react-i18next
Offline      : Workbox (service workers PWA)
HTTP client  : Axios + React Query v5
Forms        : React Hook Form v8
Icons        : Lucide React
Animations   : Framer Motion v12
```

### Frontend Mobile (React Native)
```
Framework    : React Native 0.76 (New Architecture)
Navigation   : React Navigation v7
Maps         : react-native-maps + Mapbox SDK
State        : Zustand v5 (partagé avec web)
i18n         : i18next (partagé avec web)
Offline maps : @rnmapbox/maps avec tuiles téléchargées
Paiements    : react-native-purchases (RevenueCat SDK)
```

### Backend (VPS Hostinger KVM 2 — DÉJÀ EN PLACE)
```
Serveur      : Nginx (déjà configuré)
Runtime      : Node.js 22 LTS + Express 5
Process mgr  : PM2
BDD          : PostgreSQL 16 + extension PostGIS 3.4
ORM          : Drizzle ORM (TypeScript-first, performant)
Auth         : Supabase Auth (JWT)
Cache        : Redis 7 (itinéraires, sessions)
Queue        : BullMQ (tâches asynchrones IA)
Logs         : Pino (JSON structured logging)
```

### IA & Agents
```
Runtime app  : Deepseek V3 API (génération itinéraires, chat)
              → endpoint : https://api.deepseek.com/v1
              → modèle   : deepseek-chat (V3)
Correction   : Deepseek R1 (validation logique géographique)
              → modèle   : deepseek-reasoner
Fallback     : Anthropic Claude API (claude-sonnet-4-6)
Orchestration: Hermes Agent (déjà déployé sur VPS)
Workflows    : n8n Community Edition (déjà déployé sur VPS)
Build/debug  : Claude Code avec modèle Fable 5
```

### Services externes
```
Cartographie  : Mapbox GL JS (tuiles, routing, static images)
               + OpenStreetMap / OSRM (routing open source hébergé sur VPS)
               + Maptiler (tuiles topo offline)
Trails/POI   : Overpass API (OSM) pour les données trails
Météo         : Open-Meteo API (gratuit, sans clé pour les requêtes de base)
Photos        : Unsplash API + Pexels API (photos de fond des 3 trips)
Van life spots: iOverlander API + Park4Night (scraping ou API partenaire)
Hébergements  : Booking.com Affiliate API + Airbnb Deep Links
GPS sync      : Garmin Connect API + Wahoo Cloud API
Paiements     : Stripe (web) + RevenueCat (mobile)
Analytics     : PostHog (self-hosted ou cloud)
Emails        : Resend (transactionnel)
```

### Infrastructure VPS (accès SSH disponible)
```
OS           : Ubuntu 24.04 LTS
VPS          : Hostinger KVM 2
Domaine      : hakoe-alsace.com (existant) → triptic.app (à configurer)
Reverse proxy: Nginx déjà configuré avec Cloudflare Workers
Docker       : Docker + Docker Compose déjà installés
n8n          : http://localhost:5678 (instance Community Edition)
Hermes       : conteneur Docker déjà en place
PostgreSQL   : port 5432, base existante (créer base triptic_db)
Redis        : port 6379 (à installer si absent)
```

---

## 3. ARCHITECTURE DE L'APPLICATION

### Structure des répertoires
```
triptic/
├── CLAUDE.md                    ← CE FICHIER
├── apps/
│   ├── web/                     ← PWA React
│   │   ├── src/
│   │   │   ├── components/      ← composants UI réutilisables
│   │   │   ├── pages/           ← pages (Home, Plan, Trip, Profile)
│   │   │   ├── features/        ← feature slices (chat, map, trip)
│   │   │   ├── hooks/           ← hooks custom
│   │   │   ├── store/           ← Zustand stores
│   │   │   ├── lib/             ← utils, api client, i18n
│   │   │   ├── types/           ← TypeScript types partagés
│   │   │   └── locales/         ← fr.json, en.json, de.json
│   │   ├── public/
│   │   │   └── sw.js            ← service worker (Workbox)
│   │   └── vite.config.ts
│   └── mobile/                  ← React Native
│       ├── src/                 ← même structure que web/src
│       └── ios/ android/
├── packages/
│   ├── shared/                  ← types & utils partagés web+mobile
│   ├── ai-engine/               ← client Deepseek + prompts
│   └── map-utils/               ← helpers Mapbox, GPX, géo
├── server/
│   ├── src/
│   │   ├── routes/              ← API REST Express
│   │   ├── services/            ← logique métier
│   │   ├── agents/              ← agents IA (correcteur, CRM, debug)
│   │   ├── db/                  ← Drizzle schema + migrations
│   │   ├── queues/              ← BullMQ workers
│   │   └── middleware/          ← auth, rate limiting, logging
│   └── drizzle.config.ts
├── n8n-workflows/               ← exports JSON des workflows n8n
│   ├── agent-corrector.json
│   ├── agent-crm-lifecycle.json
│   └── agent-debug-monitor.json
└── docker-compose.yml
```

### Modèle de données (PostgreSQL + PostGIS)
```sql
-- Utilisateurs
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  plan        TEXT DEFAULT 'free',    -- free | aventurier | explorateur
  lang        TEXT DEFAULT 'fr',      -- fr | en | de
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Itinéraires
CREATE TABLE trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id),
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE,          -- pour le lien public partageable
  is_public     BOOLEAN DEFAULT false,
  mode          TEXT,                 -- roadtrip | trek | bikepacking | multi
  status        TEXT DEFAULT 'draft', -- draft | saved | shared
  metadata      JSONB,                -- durée, dénivelé, distance, difficulté
  waypoints     GEOGRAPHY(LINESTRING, 4326), -- tracé PostGIS
  gpx_url       TEXT,                -- lien vers fichier GPX stocké
  cover_photo   TEXT,                -- URL photo Unsplash/Pexels
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions IA (conversations)
CREATE TABLE ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  messages    JSONB NOT NULL DEFAULT '[]',
  context     JSONB,                  -- préférences, contraintes extraites
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Feedbacks utilisateurs (boucle d'entraînement agents)
CREATE TABLE trip_feedbacks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID REFERENCES trips(id),
  user_id     UUID REFERENCES users(id),
  rating      INT CHECK (rating BETWEEN 1 AND 5),
  issues      TEXT[],                 -- tags d'erreur identifiés
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. MOTEUR IA — LOGIQUE DE GÉNÉRATION

### Architecture du prompt système (Deepseek V3)

Le prompt système doit extraire ces paramètres de la conversation :
```typescript
interface TripRequest {
  departure: string;          // point de départ
  destination?: string;       // destination ou région
  duration_days: number;      // durée souhaitée
  modes: ('roadtrip' | 'trek' | 'bikepacking')[];
  difficulty: 'easy' | 'medium' | 'hard';
  group_type: 'solo' | 'couple' | 'group' | 'family';
  vehicle?: 'van' | 'car' | 'moto' | 'none';
  avoid_crowds: boolean;
  camping: boolean;
  budget: 'low' | 'medium' | 'high';
  physical_level: 1 | 2 | 3 | 4 | 5;
  constraints: string[];      // "pas de réseau requis", "chien", etc.
  style: string[];            // "sauvage", "culturel", "confort", "découverte"
}
```

### Génération des 3 trips en compétition
```typescript
// Les 3 trips doivent varier sur UN ou DEUX axes seulement
// Exemple de variation correcte :
// Trip A : 4 jours, difficulté medium, ambiance "sauvage"
// Trip B : 5 jours, difficulté medium, ambiance "sauvage" + 1 étape de plus
// Trip C : 4 jours, difficulté easy, ambiance "avec services" proche

// Exemple de variation INCORRECTE (trop différents) :
// Trip A : road trip 4 jours FR
// Trip B : trek 7 jours Italie
// Trip C : bikepacking 3 jours Espagne
```

### Prompt système — structure recommandée
```
Tu es le moteur de planification de TRIPTIC, une app d'aventure outdoor.
Langue de réponse : {lang}

MISSION : À partir de la conversation, extraire les paramètres du trip et 
générer exactement 3 itinéraires JSON très similaires mais légèrement distincts.

RÈGLES STRICTES :
1. Les 3 trips doivent satisfaire les critères principaux de l'utilisateur
2. Ils se différencient sur 1 à 2 axes maximum (durée ±1j, difficulté ±1 niveau, ambiance)
3. Chaque waypoint doit être un lieu RÉEL et ACCESSIBLE
4. Les distances journalières doivent être réalistes (trek : 15-25km/j max, vélo : 60-120km/j)
5. Toujours vérifier que les points de départ/arrivée sont accessibles en voiture/van
6. Format de sortie : JSON strict (voir schema ci-dessous)

OUTPUT FORMAT :
{
  "trips": [TripProposal, TripProposal, TripProposal],
  "differentiator": "Ce qui distingue les 3 options entre elles (1 phrase)"
}
```

### Agent correcteur (Deepseek R1)
Après chaque génération Deepseek V3, l'agent R1 valide :
- [ ] Les coordonnées GPS sont dans la bonne région
- [ ] La distance entre waypoints est cohérente avec le mode de transport
- [ ] Le dénivelé quotidien est réaliste pour le niveau physique déclaré
- [ ] Les points d'eau/ravitaillement existent si trip bikepacking multi-jours
- [ ] Aucun waypoint n'est sur propriété privée ou zone interdite

---

## 5. DESIGN SYSTEM — IDENTITÉ VISUELLE TRIPTIC

### Palette de couleurs — v2 (charte fondateur, juillet 2026)
> Shadow Grey · Rosy Copper · Sunflower Gold · Pale Sky — ambiance chill &
> aventure. Source de vérité : `apps/web/src/styles.css` (+ règles de
> contraste dans `.claude/skills/frontend-design/SKILL.md`).
```css
:root {
  /* Primaires */
  --color-trail:       #1E1E24;   /* Shadow Grey — textes, fonds sombres */
  --color-summit:      #C86341;   /* Rosy Copper — accent aventure */
  --color-gold:        #FAC05E;   /* Sunflower Gold — CTA (texte trail dessus) */
  --color-sky:         #CDE6F5;   /* Pale Sky — surfaces accent */

  /* Déclinaisons */
  --color-copper-deep: #A64E30;   /* copper lisible sur fond clair */
  --color-gold-deep:   #E8A83D;   /* hover CTA */
  --color-ridge:       #4A4A55;   /* textes secondaires */
  --color-terrain:     #EAF4FB;   /* surfaces claires */
  --color-cloud:       #F6FAFD;   /* fond de page */

  /* Sémantiques & neutres */
  --color-pine:        #1A8A4A;   /* succès */
  --color-amber:       #C97A00;   /* warning */
  --color-storm:       #C03030;   /* erreur */
  --color-snow:        #FFFFFF;
  --color-mist:        #B9D8EA;   /* bordures */
  --color-fog:         #6E7480;   /* placeholders */
}
```

### Typographie
```css
/* Display : espace et altitude */
--font-display: 'DM Sans', system-ui, sans-serif;
/* Body : lisibilité terrain */
--font-body:    'Inter', system-ui, sans-serif;
/* Mono : données techniques (coordonnées, distances) */
--font-mono:    'JetBrains Mono', monospace;
```

### Composants clés à construire
```
TripCard          — carte de présentation d'un des 3 trips proposés
                    (photo de fond, overlay dégradé, badges données)
ChatBubble        — bulle de conversation IA
MapView           — carte interactive Mapbox full-screen
WaypointDot       — marqueur sur carte (avec tooltip)
ModeToggle        — switch road trip / trek / bikepacking
DifficultyBadge   — badge visuel niveau (easy/medium/hard/expert)
OfflineToggle     — activation mode offline
GPXExportButton   — bouton export avec animation
TripCompare       — vue côte-à-côte des 3 trips
PhotoOverlay      — photo + données IA superposées (les 3 trips)
```

### Design tokens Tailwind
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      // NOTE : Tailwind v4 — les tokens vivent dans apps/web/src/styles.css
      // (@theme). Ce bloc est indicatif.
      colors: {
        summit:  '#C86341',
        trail:   '#1E1E24',
        gold:    '#FAC05E',
        sky:     '#CDE6F5',
        ridge:   '#4A4A55',
        terrain: '#EAF4FB',
        pine:    '#1A8A4A',
        amber:   '#C97A00',
        storm:   '#C03030',
        mist:    '#B9D8EA',
      },
      fontFamily: {
        display: ['DM Sans', 'system-ui', 'sans-serif'],
        body:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'trip':  '16px',   /* cartes de trip */
        'badge': '6px',    /* badges données */
      },
    }
  }
}
```

---

## 6. PLANS TARIFAIRES & PAYWALL

```typescript
type Plan = 'free' | 'aventurier' | 'explorateur';

const PLANS = {
  free: {
    name: { fr: 'Explorer', en: 'Explorer', de: 'Entdecker' },
    price_eur_year: 0,
    limits: {
      ai_trips_per_month: 3,          // génération de trips IA
      modes: ['roadtrip'],             // road trip uniquement
      offline_regions: 0,
      gpx_export: false,
      public_share: true,             // liens publics partagés → acquisition
      trip_proposals: 1,              // 1 seul trip (pas les 3 en compétition)
    }
  },
  aventurier: {
    name: { fr: 'Aventurier', en: 'Adventurer', de: 'Abenteurer' },
    price_eur_year: 29,
    stripe_price_id: 'price_xxx',
    revenuecat_id:   'triptic_aventurier_annual',
    limits: {
      ai_trips_per_month: Infinity,
      modes: ['roadtrip', 'trek', 'bikepacking'],
      offline_regions: 5,             // 5 régions téléchargeables
      gpx_export: true,
      public_share: true,
      trip_proposals: 3,              // les 3 trips en compétition
      weather_integration: true,
      iOverlander: true,
      booking_links: true,
    }
  },
  explorateur: {
    name: { fr: 'Explorateur', en: 'Explorer Pro', de: 'Profi-Entdecker' },
    price_eur_year: 49,
    stripe_price_id: 'price_yyy',
    revenuecat_id:   'triptic_explorateur_annual',
    limits: {
      .../* tout Aventurier */,
      offline_regions: Infinity,      // monde entier
      garmin_wahoo_sync: true,
      beta_access: true,
      ai_advanced: true,              // Deepseek R1 sur toutes les requêtes
    }
  }
};
```

---

## 7. INTÉGRATIONS EXTERNES — DÉTAIL

### Mapbox
```typescript
// Variables d'env requises
MAPBOX_PUBLIC_TOKEN=pk.xxx   // frontend
MAPBOX_SECRET_TOKEN=sk.xxx   // backend (static images API)

// Usages
// - Carte interactive : MapboxGL JS
// - Routing voiture  : Mapbox Directions API
// - Images statiques : Mapbox Static Images API (preview trips)
// - Géocodage        : Mapbox Geocoding API (recherche lieux)
// - Tuiles offline   : Mapbox Offline (mobile)
```

### Deepseek API
```typescript
DEEPSEEK_API_KEY=sk-xxx

// Client
import OpenAI from 'openai'; // SDK compatible OpenAI
const deepseek = new OpenAI({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Modèles
// deepseek-chat    → génération principale (rapide, cheap)
// deepseek-reasoner → agent correcteur (raisonnement, plus lent)
```

### Anthropic Claude (fallback)
```typescript
ANTHROPIC_API_KEY=sk-ant-xxx  // déjà utilisée sur le VPS

// Fallback si Deepseek échoue ou qualité insuffisante
// Modèle : claude-sonnet-4-6
```

### Unsplash / Pexels (photos de fond des 3 trips)
```typescript
UNSPLASH_ACCESS_KEY=xxx
PEXELS_API_KEY=xxx

// Logique de sélection photo :
// 1. Extraire les mots-clés du trip (région, type d'activité, ambiance)
// 2. Query Unsplash : "{région} {activité} landscape adventure"
// 3. Sélectionner photo HD (min 1920px) avec license libre
// 4. Superposer les données IA via canvas ou CSS overlay
```

### Open-Meteo (météo sur tracé)
```typescript
// Pas de clé API requise pour les requêtes de base
// Endpoint : https://api.open-meteo.com/v1/forecast
// Paramètres : latitude, longitude, daily=[temperature_2m_max,precipitation_sum,windspeed_10m_max]
// Afficher fenêtre météo pour chaque jour de trip
```

### iOverlander + Park4Night (spots van life)
```typescript
// iOverlander : API publique non-officielle ou scraping éthique
// Park4Night  : API partenaire (demande d'accès à formuler)
//               Endpoint : https://api.park4night.com/
// Google Maps : deep links vers places (pas d'API requise)
// Afficher sur la carte les spots de nuit à proximité du tracé
```

### RevenueCat (abonnements mobile)
```typescript
REVENUECAT_PUBLIC_SDK_KEY=appl_xxx   // iOS
REVENUECAT_PUBLIC_SDK_KEY=goog_xxx   // Android
REVENUECAT_SECRET_KEY=sk_xxx         // backend webhook
// Free tier jusqu'à 2 500€ MRR
```

### Stripe (abonnements web)
```typescript
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
// Plans : price_aventurier_annual (29€) + price_explorateur_annual (49€)
```

### Garmin Connect API + Wahoo Cloud
```typescript
GARMIN_CONSUMER_KEY=xxx
GARMIN_CONSUMER_SECRET=xxx
WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx
// OAuth 2.0 dans les deux cas
// Sync : upload du GPX vers l'appareil + récupération des activités réalisées
```

### n8n VPS (workflows agents)
```
URL interne : http://localhost:5678
API Key     : N8N_API_KEY=xxx
Workflows à créer (voir dossier n8n-workflows/) :
  - agent-corrector.json      : validation post-génération
  - agent-crm-lifecycle.json  : relance users inactifs 14j
  - agent-debug-monitor.json  : surveillance logs → GitHub issues
  - agent-feedback-loop.json  : compilation feedbacks hebdo → rapport
```

---

## 8. VARIABLES D'ENVIRONNEMENT — .env.example

```bash
# === BASE ===
NODE_ENV=development
PORT=3001
APP_URL=https://triptic.app

# === BASE DE DONNÉES ===
DATABASE_URL=postgresql://triptic_user:password@localhost:5432/triptic_db
REDIS_URL=redis://localhost:6379

# === AUTH ===
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
JWT_SECRET=xxx

# === IA ===
DEEPSEEK_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx    # fallback + Claude Code build
N8N_API_KEY=xxx
N8N_URL=http://localhost:5678

# === CARTOGRAPHIE ===
MAPBOX_PUBLIC_TOKEN=pk.xxx
MAPBOX_SECRET_TOKEN=sk.xxx
MAPTILER_API_KEY=xxx

# === PHOTOS ===
UNSPLASH_ACCESS_KEY=xxx
PEXELS_API_KEY=xxx

# === PAIEMENTS ===
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
REVENUECAT_SECRET_KEY=sk_xxx

# === EMAILS ===
RESEND_API_KEY=re_xxx

# === ANALYTICS ===
POSTHOG_KEY=phc_xxx
POSTHOG_HOST=https://app.posthog.com

# === GPS SYNC ===
GARMIN_CONSUMER_KEY=xxx
GARMIN_CONSUMER_SECRET=xxx
WAHOO_CLIENT_ID=xxx
WAHOO_CLIENT_SECRET=xxx

# === SPOTS VAN LIFE ===
PARK4NIGHT_API_KEY=xxx

# === HÉBERGEMENTS ===
BOOKING_AFFILIATE_ID=xxx
```

---

## 9. AGENTS IA — ARCHITECTURE N8N + HERMES

### Agent 1 — Correcteur d'itinéraires (post-génération)
**Déclencheur :** webhook POST `/api/trips/validate`
**Logique :**
1. Recevoir le JSON des 3 trips générés par Deepseek V3
2. Envoyer à Deepseek R1 avec prompt de validation géographique
3. Si erreur détectée → régénérer le trip incriminé (1 retry max)
4. Logger le résultat dans `trip_feedbacks`
5. Retourner les 3 trips validés au frontend

### Agent 2 — Moniteur qualité (hebdomadaire)
**Déclencheur :** CRON chaque lundi 09:00
**Logique :**
1. Requête SQL : trips avec rating ≤ 2 depuis 7 jours + leurs `issues`
2. Envoi à Deepseek V3 pour clustering des erreurs récurrentes
3. Génération d'un rapport Markdown avec suggestions de prompt
4. Envoi par email (Resend) + notification Telegram à Jules

### Agent 3 — CRM lifecycle (quotidien)
**Déclencheur :** CRON chaque jour à 10:00
**Logique :**
1. Requête : users actifs il y a 14j+ et non revenus
2. Générer avec Deepseek un email personnalisé (langue user, région préférée)
3. Envoyer via Resend avec tracking ouverture
4. Users free proches de la limite (2/3 trips utilisés) → push paywall contextuel

### Agent 4 — Debug production (temps réel)
**Déclencheur :** webhook sur les logs d'erreur Pino (niveau ERROR/FATAL)
**Logique :**
1. Pino stream → webhook n8n
2. Hermes analyse : pattern connu ou nouveau ?
3. Pattern connu → appliquer fix automatique + notification
4. Pattern inconnu → créer GitHub Issue avec contexte complet
5. Notification Telegram immédiate

---

## 10. ORDRE DE BUILD — INSTRUCTIONS POUR CLAUDE CODE

### PHASE 1 — Fondations (Semaine 1-2)
```
□ 1. Initialiser le monorepo (pnpm workspaces)
     Structure : apps/web + apps/mobile + packages/shared + server
□ 2. Setup base de données
     - Créer triptic_db sur le PostgreSQL VPS
     - Activer extension PostGIS
     - Drizzle schema + première migration
     - Seed de test (5 users, 10 trips)
□ 3. Auth Supabase
     - Integration côté serveur (JWT validation middleware)
     - Pages login/signup (email + Google OAuth)
□ 4. API Express de base
     - Routes : /auth, /trips, /ai, /user
     - Middleware : auth, rate limiting, logging Pino
     - Health check endpoint
□ 5. Déploiement initial VPS
     - PM2 ecosystem config
     - Nginx reverse proxy config
     - CI/CD GitHub Actions → VPS
```

### PHASE 2 — MVP Core (Semaine 3-6)
```
□ 6. Moteur IA conversationnel (PRIORITÉ #1)
     - Client Deepseek V3 dans packages/ai-engine
     - System prompt de génération des 3 trips
     - Extraction des paramètres de la conversation (TripRequest)
     - Génération JSON des 3 trips + validation Deepseek R1
     - Route POST /api/ai/generate-trips
□ 7. Interface chat (frontend web)
     - Composant ChatInterface (bulles, streaming)
     - Affichage progressif des réponses (SSE)
     - Extraction et affichage des paramètres détectés
□ 8. Carte interactive Mapbox
     - Composant MapView (full-screen, responsive)
     - Affichage des waypoints et du tracé
     - Édition manuelle (drag waypoints, ajout/suppression étapes)
□ 9. Les 3 TripCards avec photos
     - Fetch Unsplash/Pexels selon mots-clés du trip
     - Overlay CSS : photo de fond + données IA superposées
     - Mini-carte statique Mapbox en preview
     - Comparaison côte à côte (vue TripCompare)
□ 10. Transition road trip → trail
     - Détection du trailhead le plus proche depuis le dernier waypoint voiture
     - Affichage hybride sur la même carte (icône voiture → icône chaussure)
```

### PHASE 3 — Monétisation & Offline (Semaine 7-9)
```
□ 11. Paywall freemium
     - Zustand store : plan utilisateur
     - Gate sur les features payantes (3 trips, GPX, offline)
     - Composant PaywallModal avec CTA contextuels
□ 12. Stripe (web)
     - Checkout Session API
     - Webhook : mise à jour plan user en BDD
     - Page billing + gestion abonnement
□ 13. RevenueCat (mobile)
     - Intégration SDK React Native
     - Paywall natif iOS/Android
□ 14. Export GPX
     - Génération fichier GPX depuis les waypoints PostGIS
     - Download direct + share mobile
□ 15. Offline PWA
     - Service worker Workbox : cache app shell
     - Téléchargement tuiles Mapbox offline (1 région gratuite)
     - Indicator online/offline dans l'UI
□ 16. Météo sur tracé
     - Fetch Open-Meteo pour chaque waypoint
     - Affichage fenêtre météo par jour sur la timeline du trip
```

### PHASE 4 — Intégrations & Agents (Semaine 10-12)
```
□ 17. iOverlander + Park4Night
     - Fetch spots de nuit dans un rayon de 20km autour du tracé
     - Affichage sur carte avec icônes dédiées (van/camping)
□ 18. Booking + Airbnb
     - Deep links vers hébergements à proximité des waypoints
     - Filtre par nuit du trip (dates auto-calculées)
□ 19. Lien public partageable
     - Génération slug unique par trip
     - Page publique /trip/:slug (sans auth)
     - Meta tags OG pour aperçu réseaux sociaux
□ 20. Agents n8n (importer les workflows)
     - Agent correcteur post-génération
     - Agent debug production
     - Agent CRM lifecycle
     - Agent feedback weekly
□ 21. Garmin / Wahoo sync (Explorateur only)
     - OAuth flow Garmin Connect
     - Upload GPX vers l'appareil
     - Récupération activité réalisée pour feedback loop
```

---

## 11. CONVENTIONS DE CODE

### TypeScript strict
```typescript
// tsconfig.json — toujours
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "exactOptionalPropertyTypes": true
}
```

### Nommage
```
composants React : PascalCase   → TripCard.tsx
hooks             : camelCase    → useTripGeneration.ts
stores Zustand    : camelCase    → tripStore.ts
routes API        : kebab-case   → /api/ai/generate-trips
fichiers utils    : camelCase    → geoUtils.ts
variables .env    : SCREAMING    → DEEPSEEK_API_KEY
```

### Gestion des erreurs
```typescript
// Toujours wrapper les appels API externes
try {
  const result = await deepseek.chat.completions.create({...});
} catch (error) {
  logger.error({ error, context: 'generate-trips' }, 'Deepseek API failed');
  // Fallback Claude si disponible
  // Sinon : erreur propre à l'utilisateur avec message i18n
}
```

### i18n — toujours
```typescript
// ❌ JAMAIS de string hardcodée dans les composants
<p>Générer mon trip</p>

// ✅ TOUJOURS via i18n
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
<p>{t('trip.generate_cta')}</p>

// Fichiers : src/locales/fr.json, en.json, de.json
```

### Accessibilité (toujours, sans exception)
```
- Tous les boutons ont aria-label si pas de texte visible
- Images : alt text descriptif
- Formulaires : labels associés
- Focus visible : outline sur tous les éléments interactifs
- Reduced motion : respecter prefers-reduced-motion
- Contraste : minimum 4.5:1 sur texte normal
```

---

## 12. RÈGLES QUALITÉ — NE JAMAIS IGNORER

1. **Pas de string hardcodée** — tout passe par i18n (fr/en/de)
2. **Pas d'appel API sans try/catch** — toujours un fallback propre
3. **Pas de clé API dans le code** — uniquement via variables d'env
4. **Le tier gratuit a des limites strictes** — 3 itinéraires/mois, 1 seul trip affiché (pas les 3)
5. **L'agent correcteur tourne toujours** — aucun trip ne s'affiche sans validation
6. **Offline = service worker** — ne pas bloquer l'UX si pas de réseau
7. **PostGIS pour tout ce qui est géographique** — pas de calcul géo en JS si évitable
8. **Logs structurés Pino** — pas de console.log en production
9. **RGPD** — données utilisateurs sur VPS EU, pas de tracking tiers sans consentement
10. **Mobile-first** — chaque composant web est d'abord pensé mobile, ensuite desktop

---

## 13. CONTACTS & RESSOURCES

```
Fondateur       : Jules
VPS SSH         : [accès fourni séparément via secrets Claude Code]
Repo GitHub     : https://github.com/[jules]/triptic
n8n dashboard   : http://[VPS_IP]:5678
Hermes Agent    : conteneur Docker "hermes" sur le VPS
Domaine actuel  : hakoe-alsace.com (Cloudflare Workers)
Domaine cible   : triptic.app (à acheter et configurer)

Documentation APIs :
- Deepseek    : https://platform.deepseek.com/docs
- Mapbox      : https://docs.mapbox.com
- Supabase    : https://supabase.com/docs
- RevenueCat  : https://docs.revenuecat.com
- Open-Meteo  : https://open-meteo.com/en/docs
- Unsplash    : https://unsplash.com/developers
- iOverlander : https://ioverlander.com/api (non-officielle)
- Park4Night  : https://park4night.com/api (partenaire)
- OSRM        : http://project-osrm.org/docs
```

---

## 14. CRITÈRE DE SUCCÈS DU MVP

Le MVP est considéré fonctionnel quand :

- [ ] Un utilisateur peut décrire son trip en français, anglais ou allemand
- [ ] L'IA génère 3 itinéraires validés en moins de 10 secondes
- [ ] Les 3 trips s'affichent avec photos réelles + données superposées
- [ ] La carte est interactive et le tracé est éditable manuellement
- [ ] Un utilisateur gratuit est limité à 3 générations/mois et 1 trip affiché
- [ ] L'export GPX fonctionne sur iOS, Android et web
- [ ] L'app fonctionne offline (carte + itinéraire sauvegardé)
- [ ] Le paywall s'affiche au bon moment avec le bon message
- [ ] Le lien public partageable fonctionne sans compte

---

*CLAUDE.md — TRIPTIC v1.0 — Juillet 2026*
*Ce fichier doit être mis à jour à chaque évolution majeure de l'architecture.*
*Toute décision technique non couverte ici doit être documentée dans ce fichier avant implémentation.*

---

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

## RÈGLES COMPORTEMENTALES (Karpathy — skill .claude/skills/karpathy-behavioral)
1. Ne pas assumer — énoncer les hypothèses, demander si ambigu
2. Code minimum — rien de spéculatif, rien au-delà du demandé
3. Ne toucher que ce qui est demandé — zéro changement orthogonal
4. Vérifier avant d'exécuter — valider contre les critères de départ
