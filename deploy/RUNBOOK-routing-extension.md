# TRIPTIC — Runbook : extension du routing (Lorraine, Alpes FR, puis Pyrénées)

> Commandes à coller **une par une** dans le terminal Hostinger (VPS, root).
> Couverture actuelle : Alsace seule. Objectif : + Lorraine, + Alpes FR,
> puis + Pyrénées (GR10 / HRP).
>
> **Stratégie retenue** : télécharger `france-latest.osm.pbf` (4,7 Go) une
> seule fois, puis découper la zone voulue avec `osmium extract --bbox`
> (source unique → zéro nœud dupliqué). Le `osmium merge` d'extraits
> adjacents est **abandonné** : il fait planter l'import GraphHopper 12
> (gotcha confirmé — extraits coupés sur des snapshots différents = mêmes
> objets en versions différentes, résultat indéfini).
>
> Suisse / Italie : pas dans ce runbook — voir la section « Et la Suisse /
> l'Italie ? » en bas (honnêtement : pas raisonnable sur ce VPS pour l'instant).

⚠️ Pendant chaque réimport (étapes 2, 3 et 3bis), le routing est indisponible
(1-2 h pour la Lorraine, jusqu'à une nuit pour les Alpes, jusqu'à 12 h pour
les Pyrénées). L'app continue de fonctionner : elle retombe automatiquement
sur les estimations LLM (`RoutingService` renvoie null → fallback). Lancer
les étapes Alpes et Pyrénées le soir.

---

## 1. Pré-vol (5 min)

Récupérer le script (après merge de la PR sur main) :

```bash
cd /opt/triptic && git pull origin main
```

Espace disque — il faut **au moins 20 Go libres** sur `/opt` (4,7 Go de
France + ~1,5 Go d'extrait + ~5-8 Go de graphe et tuiles d'élévation) :

```bash
df -h /opt
```

RAM et swap — l'import tourne avec la JVM plafonnée à 4 Go (KVM 2 = 8 Go).
Vérifier s'il y a déjà du swap :

```bash
free -h && swapon --show
```

Si `swapon --show` n'affiche **rien**, créer 4 Go de swap temporaire (filet
de sécurité anti-OOM pendant l'import ; disparaît au prochain reboot, c'est
voulu) :

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

Optionnel — faire le ménage des anciens extraits régionaux devenus inutiles
(garde `france-latest.osm.pbf` s'il existe déjà) :

```bash
find /opt/graphhopper/data/pbf -name '*.osm.pbf' ! -name 'france-latest.osm.pbf' -delete
```

---

## 2. Étape A — Lorraine (Alsace + Lorraine)

Durée totale : téléchargement de la France ~15-45 min (selon débit), découpe
~10-20 min, import GraphHopper ~1-2 h. Tout est enchaîné par le script, en
arrière-plan :

```bash
cd /opt/triptic && nohup env STAGE=nordest bash deploy/graphhopper-extend.sh > /var/log/triptic-gh-extend.log 2>&1 &
```

Suivre l'avancement (Ctrl-C pour quitter le suivi, ça continue en fond) :

```bash
tail -f /var/log/triptic-gh-extend.log
```

Si besoin, les logs du conteneur pendant l'import :

```bash
docker logs --tail 50 triptic-graphhopper
```

### Vérification A1 — GraphHopper en direct (Nancy → Metz, profil scenic)

```bash
curl -sS "http://localhost:8989/route?point=48.6937,6.1834&point=49.1203,6.1778&profile=car_scenic" | head -c 300
```

Attendu : un JSON avec `"distance":` autour de 55 000-90 000 (mètres — le
profil scenic évite l'A31, donc plus long que l'autoroute). Si
`Cannot find point` ou `Connection refused` : l'import n'est pas fini.

### Vérification A2 — via l'API publique TRIPTIC

```bash
curl -sS -X POST https://triptic.hakoe-alsace.com/api/trips/recompute -H "Content-Type: application/json" -d '{"mode":"roadtrip","duration_days":1,"days":[{"day":1,"title":"Test Lorraine","activities":[{"type":"visit","time_of_day":"morning","title":"Nancy - place Stanislas","lat":48.6937,"lng":6.1834},{"type":"visit","time_of_day":"afternoon","title":"Metz - cathedrale","lat":49.1203,"lng":6.1778}]}]}' | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['days'][0]['segments'][0] if 'days' in d else None;print('routed:',s.get('routed'),'| distance_km:',s['distance_km'],'| duration_min:',s['duration_min']) if s else print('erreur API:',d)"
```

Attendu : `routed: True | distance_km: ~55-90 | duration_min: ~60-110`.
Si `routed: False` : GraphHopper n'a pas répondu (import en cours, ou
`GRAPHHOPPER_URL` absent du `.env` — vérifier avec la commande suivante).

```bash
grep GRAPHHOPPER_URL /opt/triptic/.env
```

---

## 3. Étape B — Alpes françaises (est de la France complet)

Même script, bbox élargie : Alsace + Lorraine + Franche-Comté + Jura +
Alpes FR (Rhône-Alpes + PACA), zone **contiguë** — indispensable pour router
un trip Colmar → Chamonix sans trou dans le graphe. Extrait ~1,5 Go,
**import : compter une demi-journée à une nuit** sur le KVM 2 (2 vCPU).
À lancer le soir :

```bash
cd /opt/triptic && nohup env STAGE=est bash deploy/graphhopper-extend.sh > /var/log/triptic-gh-extend.log 2>&1 &
```

```bash
tail -f /var/log/triptic-gh-extend.log
```

### Vérification B1 — GraphHopper en direct (Chamonix → Annecy)

```bash
curl -sS "http://localhost:8989/route?point=45.9237,6.8694&point=45.8992,6.1294&profile=car_scenic" | head -c 300
```

Attendu : `"distance":` autour de 90 000-140 000 (mètres).

### Vérification B2 — régression Alsace (le test historique doit toujours passer)

```bash
curl -sS "http://localhost:8989/route?point=48.0631,7.0209&point=47.9014,7.0994&profile=car_scenic" | head -c 300
```

### Vérification B3 — API publique, trip Alpes

```bash
curl -sS -X POST https://triptic.hakoe-alsace.com/api/trips/recompute -H "Content-Type: application/json" -d '{"mode":"roadtrip","duration_days":1,"days":[{"day":1,"title":"Test Alpes","activities":[{"type":"visit","time_of_day":"morning","title":"Chamonix","lat":45.9237,"lng":6.8694},{"type":"visit","time_of_day":"afternoon","title":"Annecy","lat":45.8992,"lng":6.1294}]}]}' | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['days'][0]['segments'][0] if 'days' in d else None;print('routed:',s.get('routed'),'| distance_km:',s['distance_km'],'| duration_min:',s['duration_min']) if s else print('erreur API:',d)"
```

Attendu : `routed: True | distance_km: ~90-140`.

### Vérification B4 — boucle rando à pied (round-trip, profil foot)

```bash
curl -sS "http://localhost:8989/route?point=45.9237,6.8694&profile=foot&algorithm=round_trip&round_trip.distance=12000&ch.disable=true" | head -c 300
```

Attendu : un JSON avec `"distance":` autour de 10 000-15 000.

---

## 3bis. Étape C — Pyrénées (GR10 / HRP, du Pays basque au Perthus)

Rectangle contigu qui **ajoute** les Pyrénées à la couverture Est. La bbox
englobe aussi le Massif central, les Cévennes et l'Aveyron (effet de bord :
osmium extract est bien plus rapide sur bbox que sur polygone — 15 min contre
plusieurs heures — et un rectangle est le seul moyen simple de garder une
zone contiguë sans îlots). Extrait ~2,5-3 Go, **import : jusqu'à 12 h** sur
le KVM 2 (2 vCPU, 4 Go JVM). À lancer le soir, idéalement un vendredi.

```bash
cd /opt/triptic && nohup env STAGE=pyrenees bash deploy/graphhopper-extend.sh > /var/log/triptic-gh-extend.log 2>&1 &
```

```bash
tail -f /var/log/triptic-gh-extend.log
```

### Vérification C1 — GraphHopper en direct (Cauterets → Gavarnie, profil foot_scenic)

Le cœur des Hautes-Pyrénées, sur le tracé du GR10 (~25-40 km selon le tracé retenu) :

```bash
curl -sS "http://localhost:8989/route?point=42.8883,-0.1131&point=42.7358,-0.0122&profile=foot_scenic" | head -c 300
```

Attendu : un JSON avec `"distance":` autour de 25 000-40 000. Si
`Cannot find point` : l'import n'est pas fini, ou le point est hors bbox.

### Vérification C2 — GR10 au départ atlantique (Hendaye → Sare, foot_scenic)

```bash
curl -sS "http://localhost:8989/route?point=43.3591,-1.7749&point=43.3125,-1.5794&profile=foot_scenic" | head -c 300
```

Attendu : `"distance":` autour de 15 000-30 000.

### Vérification C3 — régression Alsace et Alpes (les tests historiques doivent toujours passer)

```bash
curl -sS "http://localhost:8989/route?point=48.0631,7.0209&point=47.9014,7.0994&profile=car_scenic" | head -c 200
curl -sS "http://localhost:8989/route?point=45.9237,6.8694&point=45.8992,6.1294&profile=car_scenic" | head -c 200
```

Si l'un des deux renvoie `Cannot find point`, la bbox pyrenees a mal
englobé la couverture précédente — arrêter et vérifier `BBOX` dans
`deploy/graphhopper-extend.sh`.

### Vérification C4 — boucle rando Pyrénées (round_trip, foot)

```bash
curl -sS "http://localhost:8989/route?point=42.8883,-0.1131&profile=foot&algorithm=round_trip&round_trip.distance=15000&ch.disable=true" | head -c 300
```

Attendu : `"distance":` autour de 12 000-18 000.

### Vérification C5 — API publique, trek Pyrénées

```bash
curl -sS -X POST https://triptic.hakoe-alsace.com/api/trips/recompute -H "Content-Type: application/json" -d '{"mode":"trek","duration_days":1,"days":[{"day":1,"title":"Test Pyrénées","activities":[{"type":"hike","time_of_day":"morning","title":"Cauterets","lat":42.8883,"lng":-0.1131},{"type":"visit","time_of_day":"afternoon","title":"Pont d Espagne","lat":42.8547,"lng":-0.1442},{"type":"camp","time_of_day":"evening","title":"Refuge Wallon","lat":42.8550,"lng":-0.1650}]}]}' | python3 -c "import sys,json;d=json.load(sys.stdin);segs=d['days'][0]['segments'] if 'days' in d else [];print(f'{len(segs)} segments, routés :', [s.get('routed') for s in segs]) if segs else print('erreur API:',d)"
```

Attendu : `2 segments, routés : [True, True]`. Si `[False, False]` :
GraphHopper n'a pas répondu, voir logs.

---

## 4. Et la Suisse / l'Italie ?

**Pas maintenant sur ce VPS** — dit honnêtement :

- `europe/alps` (Geofabrik, 2,1 Go, pré-fusionné, arc alpin FR/CH/IT/AT/DE/SI)
  existe et s'importerait seul sans problème de doublons… mais il ne couvre
  **pas** l'Alsace ni la Lorraine. Il faudrait le fusionner avec notre
  extrait → retour au gotcha `osmium merge`. Rejeté.
- La voie propre serait `europe-latest.osm.pbf` (~30 Go) découpé par polygone
  en un seul fichier Alsace+Lorraine+arc alpin FR/CH/IT (~2,5 Go). Faisable
  techniquement, mais : ~35 Go de disque temporaire, des heures de
  téléchargement, et un import proche des limites du KVM 2 (JVM 4 Go +
  2 vCPU, nuit complète). À envisager seulement quand l'étape B est stable
  et si le besoin CH/IT est réel — sinon, jamais sur ce VPS.
- Piste non testée pour plus tard : re-tenter `osmium merge` avec des extraits
  téléchargés **le même jour** (même snapshot quotidien Geofabrik → mêmes
  versions d'objets). À valider sur une machine de test, pas en prod.

---

## 5. OpenTopoData — élévation fine (optionnel, ~3 Go de tuiles)

Le script existant `deploy/opentopodata-setup.sh` télécharge déjà les tuiles
Copernicus GLO-30 pour **lat 43-50°N / lon 4-14°E** : ça couvre Alsace +
Lorraine + Alpes (et même CH/IT) — **rien à modifier**, il suffit de le
lancer. Vérifier d'abord le disque (~3 Go) :

```bash
df -h /opt
```

Lancer en arrière-plan (téléchargement d'environ 70 tuiles, ~15-45 min) :

```bash
cd /opt/triptic && nohup bash deploy/opentopodata-setup.sh > /var/log/triptic-otd.log 2>&1 &
```

```bash
tail -f /var/log/triptic-otd.log
```

Vérification — élévation à Nancy (~210 m) et Chamonix (~1 040 m) :

```bash
curl -sS "http://localhost:5000/v1/cop30?locations=48.6937,6.1834|45.9237,6.8694"
```

Brancher l'API TRIPTIC dessus (si pas déjà fait) :

```bash
grep -q OPENTOPODATA_URL /opt/triptic/.env || echo "OPENTOPODATA_URL=http://localhost:5000" >> /opt/triptic/.env
```

```bash
pm2 reload triptic-api && curl -fsS http://localhost:3001/health
```

---

## 6. Risques restants (à connaître)

| Risque | Détail | Parade |
|---|---|---|
| RAM pendant l'import Alpes/Pyrénées | JVM 4 Go + MMAP sur 8 Go : ça passe pour ~1,5-3 Go de pbf, mais un OOM reste possible si d'autres services chargent | Swap 4 Go (pré-vol), lancer la nuit, `docker logs` en cas d'arrêt |
| Durée import étapes B et C | 2 vCPU : demi-journée à 12 h (le script attend 12 h max) | nohup + tail ; routing en fallback LLM pendant ce temps |
| Disque étape C | ~16-18 Go consommés au total (France 4,7 + extrait ~3 + graphe + élévation) sur 100 Go | `df -h` avant chaque étape ; ménage des vieux extraits (pré-vol) |
| Régression sur zones existantes | Le stage pyrenees remplace le graphe : si sa bbox n'englobe pas la précédente, Alsace/Alpes tombent en fallback | Vérifications C3 après import ; la bbox pyrenees (-2,42.3,8.35,49.7) inclut par construction celle du stage est (4.5,43,8.35,49.7) |
| Tuiles d'élévation CGIAR | GraphHopper télécharge les tuiles SRTM pendant l'import ; le serveur CGIAR est parfois capricieux | Relancer le script (idempotent) ; les tuiles déjà en cache sont réutilisées |
| Couverture limitée à la France | Un trip qui sort de la bbox (Bâle, Genève côté suisse, Turin, Andorre, Espagne côté Pyrénées…) ne sera pas routé → fallback estimation | Assumé — voir section 4 |
