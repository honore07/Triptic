# TRIPTIC — Runbook VPS : imports longue traîne (DATAtourisme, villages, Wikidata, TDM)

> Commandes à **coller telles quelles** dans le terminal Hostinger du VPS.
> Contexte (constaté le 29/07/2026 via `https://triptic.hakoe-alsace.com/api/places/stats`) :
> `by_source = { osm: 148 836, wikidata: 113 }` — **l'import DATAtourisme n'a
> jamais tourné** et **aucune source TDM n'est enregistrée** (`tdm.sources_total = 0`).
>
> Le compte wikidata = 113 est **normal** : l'import des villages classés ne
> garde que le périmètre pilote (Alsace-Vosges + Alpes FR/CH/IT), et les
> villages déjà connus via OSM sont fusionnés dans la ligne OSM (ils ne
> comptent pas dans `by_source.wikidata`). Voir « Diagnostic » en bas de page.
>
> Tous les imports sont **idempotents** : relançables sans créer de doublons
> (upsert sur `source`/`source_id` + dédoublonnage inter-sources nom + 150 m).

---

## 0. Avant tout : code à jour + migrations

Si ce n'est pas déjà fait depuis la dernière PR mergée (voir aussi
`deploy/RUNBOOK-roadmap.md` §1) :

```bash
cd /opt/triptic && git pull origin main && pnpm install --frozen-lockfile
```

```bash
cd /opt/triptic && for m in server/src/db/migrations/*.sql; do sudo -u postgres psql -d triptic_db -f "$m"; done
```

Les migrations sont relançables (`IF NOT EXISTS`). La `0005_tdm_provenance.sql`
est indispensable pour l'étape 4 (table `tdm_sources`).

---

## 1. Import DATAtourisme (le grand absent)

**Ce que ça fait** : télécharge le flux zip JSON-LD de ton compte DATAtourisme
(créé le 20/07), garde uniquement les types utiles (musées, châteaux, points de
vue, campings, tours rando/vélo…) **dans le périmètre pilote**, récupère les
traces GPX jointes aux tours, et upsert dans `places` avec fusion si le lieu
est déjà connu via OSM.

**Prérequis** — la clé du flux doit être dans le `.env` racine (doit afficher `1`) :

```bash
grep -c DATATOURISME_WEBSERVICE_URL /opt/triptic/.env
```

**Lancement** (en arrière-plan, survit à la fermeture du terminal) :

```bash
cd /opt/triptic/server && nohup pnpm import:datatourisme > /tmp/import-datatourisme.log 2>&1 &
```

**Suivi** (Ctrl+C pour quitter le tail, l'import continue) :

```bash
tail -f /tmp/import-datatourisme.log
```

**Durée attendue** : 15 min à 2 h selon la taille du flux (téléchargement du
zip + traces GPX des tours, 15 s max chacune). Fin = ligne de log
`Import DATAtourisme terminé` avec `{parsed, skipped, inserted, merged, traced}`.

**Vérification après** :

```bash
curl -s https://triptic.hakoe-alsace.com/api/places/stats
```

→ `by_source` doit contenir une entrée `"source":"datatourisme"` avec un
compte > 0 (ordre de grandeur attendu : quelques milliers ; `merged` de la
dernière ligne de log = lieux fusionnés avec OSM, non comptés ici).

⚠️ Si le log affiche `parsed: 0` : le flux est probablement configuré sur une
zone/des types hors périmètre — vérifier la config du flux sur
diffuseur.datatourisme.fr (France entière ou Grand Est + Alpes ; types :
lieux culturels, naturels, points de vue, campings, itinéraires).

---

## 2. Villages classés (Wikidata) — relance optionnelle

**Ce que ça fait** : requête SPARQL Wikidata pour « Les Plus Beaux Villages de
France » et « I borghi più belli d'Italia », garde ceux du périmètre pilote,
upsert avec fusion. Déjà exécuté une fois (les 113 lignes `wikidata` actuelles).
Relance utile après l'import DATAtourisme pour re-fusionner proprement — sans
risque, c'est idempotent.

```bash
cd /opt/triptic/server && nohup pnpm import:villages > /tmp/import-villages.log 2>&1 &
```

```bash
tail -f /tmp/import-villages.log
```

**Durée attendue** : < 5 min (2 requêtes SPARQL, ~540 villages fetchés,
~100-150 gardés dans le périmètre).

**Vérification** : `by_source.wikidata` reste ≈ 113 (± quelques uns) — c'est
normal, voir Diagnostic.

---

## 3. Enrichissement notoriété Wikidata

**Ce que ça fait** : pour **tous** les lieux ayant un `wikidata_id` (villages
+ milliers de POI OSM tagués wikidata), recalcule la notoriété d'après le
nombre d'articles Wikipédia (sitelinks) et complète le résumé FR manquant.
À lancer **après** les étapes 1 et 2 pour couvrir les nouveaux lieux.
Idempotent, relançable à volonté.

**Prérequis** : aucun (API Wikidata publique, throttling intégré 1,5 s/lot de 50).

```bash
cd /opt/triptic/server && nohup pnpm enrich:wikidata > /tmp/enrich-wikidata.log 2>&1 &
```

```bash
tail -f /tmp/enrich-wikidata.log
```

**Durée attendue** : 10 à 45 min selon le nombre de lieux liés à Wikidata
(première ligne de log `Lieux à enrichir via Wikidata` donne le compte ;
compter ~2 s par lot de 50). Fin = `Enrichissement Wikidata terminé {updated}`.

**Vérification** : `by_source` ne change pas (l'enrichissement met à jour des
lignes existantes). Contrôle en base si besoin :

```bash
sudo -u postgres psql -d triptic_db -c "SELECT count(*) FROM places WHERE wikidata_id IS NOT NULL AND notoriety >= 60;"
```

---

## 4. Pipeline TDM blogs — pas de « seed » automatique

**Important** : il n'existe **aucun script de seeding** des sources TDM, et
c'est voulu (conformité). La table `tdm_sources` se remplit uniquement quand on
fouille une page de blog avec `pnpm import:blog -- --url=…` — une page par
commande, chaque page passant par : robots.txt/ai.txt/meta noai → extraction de
faits (jamais de texte) → recoupement OSM/DATAtourisme/Wikidata → **agent de
conformité** → insertion `active`/`pending`/rejet. `tdm.sources_total = 0`
signifie simplement qu'aucune page n'a encore été fouillée.

**Prérequis** — clé IA dans le `.env` (l'agent de conformité en a besoin ;
au moins une des deux doit afficher `1`) :

```bash
grep -c DEEPSEEK_API_KEY /opt/triptic/.env ; grep -c ANTHROPIC_API_KEY /opt/triptic/.env
```

Et la table doit exister (migration 0005, étape 0) :

```bash
sudo -u postgres psql -d triptic_db -c "\d tdm_sources"
```

**Lancement** (remplacer l'URL par un vrai article de blog outdoor sur le
périmètre pilote — c'est un test sur UNE page, pas un import de masse) :

```bash
cd /opt/triptic/server && pnpm import:blog -- --url=https://exemple-blog-outdoor.fr/article-vosges
```

**Durée attendue** : 1 à 3 min par page (appels LLM : extraction + verdict par
fait).

**Vérification après** :

```bash
curl -s https://triptic.hakoe-alsace.com/api/places/stats
```

→ `tdm.sources_total` ≥ 1 (la source est enregistrée **même si la page est en
opt-out**) ; `tdm.web_active`/`web_pending` > 0 si des faits sont passés.
Audit trail : `grep compliance /root/.pm2/logs/*` ou le log de la commande.

---

## Ordre recommandé (résumé)

1. §0 — code + migrations (5 min)
2. §1 — `import:datatourisme` (15 min – 2 h) ← **priorité**
3. §2 — `import:villages` (5 min, optionnel mais gratuit)
4. §3 — `enrich:wikidata` (10-45 min)
5. §4 — `import:blog` sur 1-2 pages test (quelques minutes)

Lancer les étapes **l'une après l'autre** (pas en parallèle : elles écrivent
toutes dans `places` et 2-3 imports simultanés satureraient le KVM 2).

## Checklist de succès global

`curl -s https://triptic.hakoe-alsace.com/api/places/stats` doit montrer :

- [ ] `by_source` contient `osm` (~149 000), `wikidata` (~113), **et
      `datatourisme` (> 0, quelques milliers attendus)**
- [ ] `total` a augmenté d'autant
- [ ] `by_region` : les 4 régions pilotes toujours présentes
- [ ] `tdm.sources_total` ≥ 1 après le premier `import:blog`
- [ ] `tdm.web_active + tdm.web_pending` > 0 si des faits ont passé l'agent
- [ ] aucun import ne s'est terminé par `… échoué` dans son log `/tmp/*.log`

> Aussi absents de `by_source` à ce jour : `geotrek-*` (boucles rando des
> parcs) et les trails OSM (`import:geotrek`, `import:osm-trails`) — voir
> `deploy/RUNBOOK-roadmap.md` §4 si tu veux les lancer dans la foulée.

## Diagnostic (pourquoi 0 et 113 ?)

- **datatourisme = absent** : l'import n'a tout simplement jamais tourné sur le
  VPS (total 148 949 = 148 836 osm + 113 wikidata, rien d'autre). Le script
  (`server/src/import/datatourisme/runDatatourismeImport.ts`) exige
  `DATATOURISME_WEBSERVICE_URL` dans `/opt/triptic/.env` et sort en erreur
  immédiate sinon — la clé existe depuis le 20/07, il n'y a plus qu'à lancer.
- **wikidata = 113** : ce n'est **pas un bug**. Trois filtres voulus expliquent
  l'écart avec les ~540 villages des deux listes :
  1. le périmètre pilote (`regionForPoint`, bbox Alsace-Vosges + Alpes) écarte
     la majorité des Plus Beaux Villages (Dordogne, Bretagne…) et des borghi
     (Toscane, Pouilles…) — extension prévue à la sortie de l'app ;
  2. les villages déjà présents via OSM sont **fusionnés** dans la ligne OSM
     (`upsertWithDedup`) et restent comptés `source = osm` ;
  3. `by_source.wikidata` ne compte donc que les villages *insérés* comme
     nouvelles lignes.
- **tdm.sources_total = 0** : aucun script de seed n'existe (par design) ; la
  table ne se remplit qu'au fil des `pnpm import:blog -- --url=…` manuels.
