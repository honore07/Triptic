# TRIPTIC — Runbook : profil de rando « scenic » (foot_scenic)

> Objectif : que les treks empruntent **les plus beaux sentiers** (chemins,
> pistes, itinéraires balisés) au lieu du plus court chemin piéton, qui longe
> parfois les routes. Équivalent rando du `car_scenic` (belles routes).
>
> Commandes à coller **une par une** dans le terminal Hostinger (VPS, root).
> Couverture géographique **inchangée**.

## Comment ça marche

`foot_scenic` combine le profil piéton intégré de GraphHopper avec un overlay
(`deploy/graphhopper/custom_models/foot_scenic.json`) qui :

- pénalise fortement les routes primaires/secondaires/tertiaires et les voies
  résidentielles ;
- défavorise légèrement les tronçons **hors itinéraire de rando balisé**
  (`foot_network == MISSING`) → les sentiers et GR-like OSM passent devant.

## ⚠️ Il faut RECONSTRUIRE le graphe (leçon du 2026-08-06)

On a d'abord cru qu'un simple redémarrage suffirait (les encoded values
`road_class`/`foot_network` sont déjà dans le graphe). **Faux.** GraphHopper 12
fige la liste des profils à l'import : ajouter `foot_scenic` à la config d'un
graphe déjà bâti fait crasher le conteneur au démarrage :

```
IllegalStateException: You cannot add new profiles to the loaded graph.
Profile 'foot_scenic' is new. Existing profiles: car_scenic,foot,bike
```

Il faut donc **reconstruire le graphe** — mais **sans couper le service** : le
script construit le nouveau graphe dans un conteneur séparé (port 8990),
vérifie que `foot_scenic` y route vraiment, puis ne bascule (graphe + config
ensemble) qu'en cas de succès. En cas d'échec, rien ne bouge. La couverture ne
change pas : on réutilise le `triptic.osm.pbf` en service (pas de
téléchargement, pas d'osmium). Import constaté ~20 min.

---

## 1. Récupérer le code (après merge de la PR)

```bash
cd /opt/triptic && git pull origin main
```

Vérifier que les fichiers clés sont là :

```bash
ls -l deploy/graphhopper/custom_models/foot_scenic.json deploy/graphhopper-foot-scenic.sh
```

## 2. Reconstruire le graphe avec foot_scenic (sans coupure)

```bash
cd /opt/triptic && nohup bash deploy/graphhopper-foot-scenic.sh > /var/log/triptic-gh-scenic.log 2>&1 &
```

Suivre en direct (Ctrl-C arrête juste l'affichage, le script continue) :

```bash
tail -f /var/log/triptic-gh-scenic.log
```

Pendant toute la construction, le routing actuel (`car_scenic`/`foot`/`bike`)
reste **disponible** sur le port public.

## 3. Vérifier le résultat

État en une ligne quand c'est fini :

```bash
cat /opt/graphhopper/DERNIER-SCENIC.txt
```

- `état : SUCCES` → `foot_scenic` est en service, passer à l'étape 4.
- `état : ECHEC` → rien n'a bougé, le routing tourne sur l'ancien graphe.
  Cause dans `/var/log/triptic-gh-scenic.log`.

Test manuel (doit renvoyer un JSON avec `"paths"`) :

```bash
curl -s -X POST http://localhost:8989/route -H 'Content-Type: application/json' \
  -d '{"points":[[6.8720,47.9950],[6.9250,47.9600]],"profile":"foot_scenic","points_encoded":false,"instructions":false}' \
  | head -c 200
```

## 4. Activer le profil côté application

Tant que cette étape n'est pas faite, l'app utilise le profil `foot` classique
(le graphe reconstruit sait faire les deux). Pour basculer les treks sur
`foot_scenic` :

```bash
cd /opt/triptic
grep -q '^GRAPHHOPPER_FOOT_PROFILE=' .env \
  && sed -i 's/^GRAPHHOPPER_FOOT_PROFILE=.*/GRAPHHOPPER_FOOT_PROFILE=foot_scenic/' .env \
  || echo 'GRAPHHOPPER_FOOT_PROFILE=foot_scenic' >> .env
```

Recharger l'API sans coupure (PM2 reload > restart) :

```bash
pm2 reload triptic-api && pm2 logs triptic-api --lines 20 --nostream
```

## 5. Vérifier de bout en bout

Générer un trek dans l'app (ex. Vosges / La Bresse). Le tracé doit désormais
suivre les sentiers. Comparer les deux profils sur le même trajet :

```bash
for p in foot foot_scenic; do
  echo -n "$p : "
  curl -s -X POST http://localhost:8989/route -H 'Content-Type: application/json' \
    -d "{\"points\":[[6.8720,47.9950],[6.9250,47.9600]],\"profile\":\"$p\",\"points_encoded\":false,\"instructions\":false}" \
    | grep -o '"distance":[0-9.]*' | head -1
done
```

`foot_scenic` sera souvent un peu plus long (détour par les beaux chemins) —
c'est voulu (`distance_influence: 15` borne le détour).

---

## Revenir en arrière (rollback)

Le graphe reconstruit sait toujours router le profil `foot` classique. Pour
revenir sans rien reconstruire — il suffit de repointer l'app :

```bash
cd /opt/triptic
sed -i 's/^GRAPHHOPPER_FOOT_PROFILE=.*/GRAPHHOPPER_FOOT_PROFILE=foot/' .env
pm2 reload triptic-api
```

## Réglage fin (optionnel)

Le comportement se pilote dans `deploy/graphhopper/custom_models/foot_scenic.json` :

- `distance_influence` (défaut 15) : **plus bas** = accepte de plus gros
  détours pour de plus beaux sentiers ; **plus haut** = privilégie le plus
  direct. `car_scenic` utilise 5.
- Les `multiply_by` par `road_class` : plus proche de 0 = route plus évitée.

Après toute modification du JSON, relancer l'étape 2 (reconstruction).
