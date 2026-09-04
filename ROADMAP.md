# ROADMAP — VIRE

> **À quoi sert ce fichier.** Reprendre le projet dans une nouvelle
> conversation Claude Code sans avoir à tout redécouvrir : où en est le
> produit, comment il fonctionne, ce qui reste, et par quoi commencer.
>
> Dernière mise à jour : **4 septembre 2026**, après les PR #42 à #54
> (triptyque, mouvements signature, photos prises sur place, performance,
> génération rapide, accessibilité — voir §2 bis).

---

## 1. Démarrer une session

Dis simplement à Claude Code ce que tu veux faire. Il lira `CLAUDE.md`
(le brief complet) automatiquement ; ce fichier-ci lui donne l'état courant.

```bash
pnpm install
```

Aperçu web (le serveur de dev, pas de base requise) :

```bash
pnpm --filter @triptic/web dev
```

Puis `http://localhost:5173`. **L'ouverture s'affiche en premier** (aucun
compte connecté) — clique « Commencer » pour entrer dans l'app.

Contrôles avant tout commit :

```bash
pnpm --filter @triptic/web typecheck && pnpm --filter @triptic/web test
```

**203 tests** doivent passer. Le build de production se vérifie avec
`pnpm --filter @triptic/web build`.

### Ce qui ne marche pas en local, et c'est normal

| Symptôme | Cause | Conséquence |
|---|---|---|
| `/api/*` renvoie 500 | le serveur Express n'est pas lancé | listes de trips vides, pas de génération |
| L'ouverture mène à l'accueil, pas à la connexion | pas de `VITE_SUPABASE_*` | comportement voulu — jamais de page de login inopérante |
| Pas de carte Mapbox | pas de `MAPBOX_PUBLIC_TOKEN` | aperçu SVG simplifié à la place |

Pour prévisualiser l'écran de connexion (PL.02), décommente les deux lignes
de `.env.development.local` à la racine, puis relance le serveur de dev.

---

## 2. Où en est le produit

L'app web est **complète côté interface** : les 14 planches du projet Claude
Design sont implémentées, de l'ouverture au profil.

| Planche | Écran | Fichier principal |
|---|---|---|
| PL.01 | Ouverture | `components/Ouverture.tsx` |
| PL.02 | Connexion | `pages/Auth.tsx` |
| PL.03 | Accueil | `pages/Home.tsx` |
| PL.04 | Dates / saison | `components/Fenetre.tsx` |
| PL.05 | Précisions | `components/TripTuner.tsx` |
| PL.06 | Génération | `components/Releve.tsx` |
| PL.07 / 08 | Comparer / Relevé | `components/TripCard.tsx`, `TableauCompare.tsx` |
| PL.09 | Itinéraire | `pages/Trip.tsx`, `components/DayCards.tsx` |
| PL.10 | Spots de nuit | `components/Nuitee.tsx` |
| PL.11 | Étape | `components/Etape.tsx` |
| PL.12 | Carnet | `pages/MyTrips.tsx` |
| PL.13 / 14 | Mon van / Profil | `pages/Vehicule.tsx`, `pages/Profil.tsx` |

**Principe tenu partout : rien n'est simulé.** Quand une donnée n'existe pas
côté serveur, l'UI le dit au lieu d'afficher un chiffre inventé. Les trois
endroits concernés sont listés en §4.

### 2 bis. La passe de septembre (PR #42 → #54)

Décisions du fondateur (01/09) : gravure + rouille partout, **vraies photos
uniquement sur le trip et sur la carte**, animation éditoriale, références
Arc'teryx / Aesop. Ce qui en est sorti, tout en CSS et React existants :

- **Le triptyque** (PL.07) : trois volets photo plein cadre, en tonalité
  gravure au repos, en couleur quand on s'y arrête ; « ce qui les distingue »
  calculé depuis les relevés. Carrousel à crans sur mobile.
- **Itinéraire, étape, page publique** : tête plein cadre avec la photo réelle,
  relevé sur l'encre, bandeau des jours en planches photo.
- **Relevé de génération** (PL.06) : étape I / V, chronomètre, ligne de crête
  à la plume — plus jamais « 0 % » pendant des minutes.
- **Mouvements signature** (`styles.css`) : `ink-reveal`, `route-draw`,
  `bar-grow`, `title-breathe`, `settle-back`, `mask-reveal`, `hero-open`
  (scroll-timeline), `plate-photo` (gravure → couleur), `on-photo` (halo
  d'encre). Tout s'éteint en `prefers-reduced-motion`.
- **Photos prises sur place** : `findTripCover` / `findDayPhotos` ancrent la
  couverture d'une vire sur ses temps forts (Wikimedia Commons par
  coordonnées), plus jamais par mots-clés.
- **Moteur** : `reasoning_effort` Deepseek maîtrisé (`low` pour tracer, `none`
  pour classer) — une semaine de trip passe de 591 s à 105 s ; une réponse
  vide bascule sur Claude et la bascule est journalisée (`LLM fallback`).
- **Performance** : bundle initial 1 150 → 670 Ko (PostHog et pages
  secondaires à la demande, anglais/allemand en morceaux séparés).
- **PWA** : le service worker attend, un bandeau « Recharger » annonce une
  nouvelle version — plus de bascule silencieuse qui montrait l'ancien écran
  ou coupait une génération.
- **Contrôles** : `apps/web/scripts/qa/` (parcours du site en ligne, audit
  axe-core, contrastes composés, captures). État au 04/09 : zéro exception,
  zéro défaut d'accessibilité sur dix pages.

---

## 3. Comment ça marche, en bref

`CLAUDE.md` contient l'architecture détaillée. L'essentiel pour s'orienter :

**Le parcours de génération.** Accueil (`Home`) → `/plan` avec la demande en
`location.state` → `chatStore.begin()` → fenêtre (PL.04) → précisions (PL.05)
→ `confirmTuning()` → SSE `/api/ai/generate-trips` → les 3 propositions.

**Ce qui pilote la génération.** Trois canaux convergent vers le moteur :

- `chatStore.overrides` — le mode choisi sur l'accueil (`setMode`), les dates,
  la durée déduite ;
- `TripPlaces` — départ/arrivée, `group_type`, `constraints[]` ;
- `profileConstraints()` (`store/profileStore.ts`) — préférences durables et
  véhicule enregistré, traduits en phrases dans la langue de l'utilisateur.

Les contraintes sont du **texte libre** côté moteur : on lui envoie des
phrases, jamais des codes internes.

**Les stores.** `chatStore` (conversation + résultat, persisté),
`tripStore` (trip sélectionné, historique, recalcul), `userStore` (plan,
quota, session Supabase), `profileStore` (unités, préférences, véhicule,
photo — persisté localement).

**Les images.** Toutes les images de l'interface sont des **gravures** ;
seules les photos réelles des trips générés sont des photographies. Les
assets vivent dans `apps/web/public/vire/`.

⚠️ **Ne jamais remplacer un asset existant** — les 13 gravures d'origine de
Jules sont intouchables. Créer un nouveau fichier.

**Le logo** (`components/LogoVire.tsx` + `vire_logo-compas.webp`) : un compas
à pointes sèches retourné. Deux rendus — la gravure dès 42 px, une réduction
vectorielle pour le favicon 16-32 px.

---

## 4. Ce qui reste à faire

### 4.1 — Mise en service (le plus urgent)

Ces points bloquent un lancement public. Ils sont documentés en détail dans
`deploy/` et audités dans `QA.md`.

**HTTPS** — fait : `https://triptic.hakoe-alsace.com` (Traefik, voir
`deploy/RUNBOOK-https.md`).

**Paywall contournable** — le serveur honore le header client `x-plan`
(`server/src/middleware/auth.ts`). C'est un **choix assumé** tant qu'on est en
démo gratuite, pas un oubli.
→ À fermer au passage payant : `deploy/NOTE-paywall-prod.md`.

**Auth Supabase** — configurée en prod : l'ouverture mène à la connexion, la
génération exige un compte. Reste à activer le fournisseur **Google** côté
Supabase (le bouton est câblé dans `pages/Auth.tsx`).

**Compression et cache des assets** — `mapbox-gl` fait 1,86 Mo servi sans
gzip/brotli, et les assets hashés sont en `max-age=0`.
→ Config Nginx. Gain immédiat sur le premier chargement.

### 4.2 — Trois trous serveur signalés dans l'UI

L'interface les annonce honnêtement. Les combler enlèvera ces mentions.

**Météo heure par heure (PL.11).** `server/src/services/weather.ts` n'interroge
Open-Meteo qu'en `daily`. La fiche d'étape ne peut donc pas afficher la bande
horaire de la planche.
→ Ajouter les paramètres `hourly` (température, vent, précipitations), étendre
`WeatherDayPayload`, puis afficher dans `components/Etape.tsx`.

**Profil altimétrique au point (PL.11).** `services/elevation.ts` existe et sait
échantillonner un profil (200 points, seuil de lissage 8 m) — mais il n'est
utilisé que par l'import de sentiers, jamais exposé.
→ Ajouter un endpoint (ex. `POST /api/trips/elevation-profile`) qui prend la
géométrie d'une journée, puis remplacer dans `Etape.tsx` les barres « une par
montée » par la vraie courbe. Demande `OPENTOPODATA_URL` (voir
`deploy/opentopodata*`).

**Services des emplacements (PL.10).** La planche montre eau, vidange, élec,
douche, courses et un nombre de places : **la base ne connaît rien de tout
cela**. `components/Nuitee.tsx` n'affiche donc que la nature du lieu, le détour
et la description.
→ Étendre le schéma `places` avec ces attributs, puis les alimenter (Park4Night
demande un partenariat ; iOverlander a une API non officielle).

### 4.3 — Données

Les imports sont écrits, testés et **idempotents**. Ils restent à lancer sur le
VPS pour élargir la couverture au-delà de la région pilote Alsace-Vosges.

```bash
pnpm --filter @triptic/server import:osm
pnpm --filter @triptic/server import:datatourisme
pnpm --filter @triptic/server import:villages
pnpm --filter @triptic/server enrich:wikidata
```

→ Procédure complète : `deploy/RUNBOOK-imports.md`.

**Blog mining** — le skill `blog-place-mining` et le pipeline TDM sont prêts,
avec leur agent de conformité. En attente du choix d'une première zone.
⛔ Rappel : aucune fiche web `active` sans le passage par l'agent de conformité.

### 4.4 — Produit

**Photos de profil : locales seulement.** Elles vivent dans le navigateur
(`profileStore`), faute de stockage d'images côté serveur. Elles ne suivent pas
l'utilisateur d'un appareil à l'autre.
→ Si c'est un besoin : endpoint d'upload + stockage (VPS ou Supabase Storage).

**Unités impériales.** `lib/units.ts` est appliqué aux surfaces principales
(carte de vire, itinéraire, étape, jours, carnet). À vérifier ailleurs si de
nouveaux écrans affichent des distances.

**Logo en vectoriel.** L'asset est un raster de 512 px, suffisant dans l'app.
Pour une impression grand format ou un dépôt de marque, il faudra le retracer.

**Paiement.** Aucune trace de Stripe ni de RevenueCat dans le dépôt à ce jour —
tout reste à construire quand le passage payant sera décidé.

---

## 5. Conventions à respecter

Ces règles viennent de `CLAUDE.md` et de l'usage établi. Les enfreindre casse
la cohérence du projet.

1. **Aucune chaîne en dur dans l'UI** — tout passe par i18next, en `fr`, `en`
   et `de`. Les trois fichiers de `apps/web/src/locales/` évoluent ensemble.
2. **Un test Vitest par composant.** Les tests décrivent le comportement
   attendu, pas l'implémentation.
3. **Contrastes ≥ 4.5:1** (3:1 pour le texte large), cibles tactiles ≥ 44 px.
   Sur une image de fond, mesurer sur les **pixels composités** — une estimation
   se trompe, l'expérience l'a montré deux fois.
4. **Angles droits stricts** (`DESIGN.md`), sauf le bandeau de saisie de
   l'accueil, arrondi à dessein.
5. **Toujours une PR**, jamais de push direct sur `main`.
6. **Les tokens de couleur bougent ensemble** : `styles.css`, son miroir JS
   `lib/mapColors.ts` (Mapbox n'accepte pas les variables CSS) et `DESIGN.md`.

---

## 6. Pièges connus

**`.env` écrit depuis PowerShell sort en UTF-16** et devient illisible pour
Node — la variable paraît absente alors qu'elle est là. Vérifier l'encodage
avant de conclure (`head -c 12 .env | od -c` montre les octets nuls).

**Ne jamais gater le montage d'un routeur** sur une dépendance optionnelle :
ça produit un 404 trompeur là où un 503 explicite est attendu.

**GraphHopper fige ses profils à l'import** : changer un profil impose un
rebuild complet du graphe.

**Deepseek v4 raisonne avant de répondre, et sa réflexion compte dans
`max_tokens`** — sans `reasoning_effort`, il brûle tout le budget et rend un
contenu vide (`finish_reason: length`). Le provider envoie `low` par défaut,
`none` pour classer, rien pour le correcteur ; ne pas retirer ce paramètre.

**Le service worker garde l'ancien écran** dans un navigateur qui avait déjà
l'app : depuis la PR #51 un bandeau « Recharger » le dit. Pour forcer : vider
le stockage du site, ou `qa:live` (navigateur neuf) pour juger le vrai build.

**Déploiement VPS** : `git` y est épinglé en HTTP/1.1 (GitHub coupait les
pulls HTTP/2) et la session SSH tombe pendant `pnpm build` — lancer en
`nohup … > deploy.log` avec `GIT_TERMINAL_PROMPT=0`, puis lire `deploy.log`.

**Jamais `git stash` nu** : la pile est partagée entre les worktrees.

---

## 7. Par quoi commencer

Dans l'ordre de valeur :

1. **Regarder trois utilisateurs** tracer une vire sans aide — ce qu'ils
   comprennent du triptyque, où ils hésitent. Aucun outil ne le mesure.
2. **Fournisseur Google** dans Supabase, puis **Stripe** quand le passage
   payant sera décidé (`deploy/NOTE-paywall-prod.md`).
3. **Imports de données** — élargit la couverture géographique.
4. **Les trois trous serveur** (§4.2), par ordre de visibilité : météo horaire,
   puis profil altimétrique, puis services des emplacements.
5. Avant chaque déploiement : `pnpm --filter @triptic/web qa:live` et
   `qa:a11y` sur le site, `qa:contrast` sur le serveur de dev.
