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

```bash
cd /opt/triptic/server && ZONE=<zone-slug> && \
  grep -vE '^\s*(#|$)' src/import/blogs/queues/$ZONE.txt | while read -r url; do
    echo "=== $(date +%H:%M:%S) $url ==="
    pnpm import:blog -- --url="$url"
  done 2>&1 | tee /tmp/import-blog-$ZONE.log
```

Contrôle après :

```bash
curl -s http://82.25.118.185:3001/api/places/stats
```

→ `tdm.sources_total` ≥ nb de domaines fouillés ; `tdm.web_active` +
`tdm.web_pending` > 0 si des faits ont passé. Audit conformité :
`grep compliance /tmp/import-blog-$ZONE.log`.

## Convention de nommage des slugs

`vallée de Munster` → `vallee-de-munster` · `Queyras` → `queyras` ·
`Vosges du Sud` → `vosges-du-sud` · `Alpes-Maritimes` → `alpes-maritimes`.
