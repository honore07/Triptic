# Format de la file + commandes VPS

## Fichier de file

Chemin : `server/src/import/blogs/queues/<zone-slug>.txt`
(`<zone-slug>` en kebab-case sans accent : `vallee-de-munster`, `queyras`…)

Une URL par ligne. Commentaire `#` au-dessus de chaque bloc de domaine avec
titre + lieux pressentis (jamais de phrase du blog). Lignes vides ignorées.

```
# === vallée de Munster — 2026-08-06 ===
# Découverte : 4 angles, 7 domaines, 14 articles, ~40 lieux pressentis

# blog-exemple-a.fr — "Les cascades cachées de la vallée" (cascades: Stolz, Seebach…)
https://blog-exemple-a.fr/cascades-munster
https://blog-exemple-a.fr/lacs-hautes-vosges

# rando-exemple-b.de — "Geheime Wanderungen im Münstertal"
https://rando-exemple-b.de/geheimtipps-munstertal
```

## Commandes VPS (prêtes à coller)

Séquentiel — jamais en parallèle (le KVM 2 sature si plusieurs imports écrivent
dans `places` en même temps). Chaque page passe par l'opt-out + l'agent de
conformité ; une page refusée n'arrête pas la boucle.

```bash
cd /opt/triptic && git pull origin main && pnpm install --frozen-lockfile
```

`--region=<id>` borne le géocodage Nominatim à la bbox de la zone (réduit les
homonymes). Ids : `alsace-vosges`, `alpes-fr`, `alpes-ch`, `alpes-it`
(`server/src/import/osm/regions.ts`). Omettre le flag = géocodage sur tout le
périmètre pilote puis filtre par région.

```bash
cd /opt/triptic/server && ZONE=<zone-slug> && REGION=<region-id> && \
  grep -vE '^\s*(#|$)' src/import/blogs/queues/$ZONE.txt | while read -r url; do
    echo "=== $(date +%H:%M:%S) $url ==="
    pnpm import:blog -- --url="$url" --region="$REGION"
  done 2>&1 | tee /tmp/import-blog-$ZONE.log
```

Résolution des coordonnées (les blogs n'ont pas de GPS) : chaque nom est ancré
(a) sur un lieu déjà cartographié de même nom (→ recoupé, peut passer `active`),
sinon (b) géocodé via Nominatim (→ non recoupé, `pending` pour revue).

Contrôle après :

```bash
curl -s https://triptic.hakoe-alsace.com/api/places/stats
```

→ `tdm.sources_total` ≥ nb de domaines fouillés ; `tdm.web_active` +
`tdm.web_pending` > 0 si des faits ont passé. Audit conformité :
`grep compliance /tmp/import-blog-$ZONE.log`.

## Convention de nommage des slugs

`vallée de Munster` → `vallee-de-munster` · `Queyras` → `queyras` ·
`Vosges du Sud` → `vosges-du-sud` · `Alpes-Maritimes` → `alpes-maritimes`.
