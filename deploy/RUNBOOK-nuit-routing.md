# RUNBOOK — étendre le routing pendant la nuit (Lorraine + Alpes FR/CH/IT)

> Tout tourne **sur le VPS**, pas sur ton PC. Une fois lancé, tu peux fermer
> le navigateur, éteindre le PC ou le laisser se mettre en veille : le
> processus continue. Le terminal web n'est qu'une fenêtre sur le serveur.

## Ce que fait la nuit

Deux paliers enchaînés, du plus sûr au plus ambitieux :

| Palier | Couverture ajoutée | Durée typique |
|---|---|---|
| 1 — `nordest` | Alsace + **Lorraine** | 1-2 h |
| 2 — `intl` | + Jura, **Alpes FR, Suisse, Italie du Nord-Ouest** | 4-12 h |

**Garantie** : le graphe en service n'est jamais supprimé. Le nouveau se
construit à côté (conteneur séparé, port 8990) et ne prend la place de
l'ancien qu'une fois qu'il répond correctement. Conséquences :

- le routing **reste disponible toute la nuit**, y compris pendant l'import ;
- si le palier Alpes échoue ou manque de temps, **la Lorraine reste acquise** ;
- tu ne peux pas te réveiller avec moins de couverture qu'au coucher.

## 1. Avant de lancer (2 min)

Dans le terminal web Hostinger, sur le **shell hôte** (`root@srv1731348`,
fais `exit` si le prompt affiche un conteneur) :

```bash
cd /opt/triptic && git pull origin main && df -h /opt && free -g
```

Il faut **au moins 60 Go libres** sur `/opt` (europe-latest pèse ~30 Go, plus
l'extrait et le graphe). Si tu es juste, libère l'ancien fichier France :

```bash
rm -f /opt/graphhopper/data/pbf/france-latest.osm.pbf
```

## 2. Lancer la nuit (1 commande)

```bash
cd /opt/triptic && nohup bash deploy/graphhopper-overnight.sh > /var/log/triptic-gh-nuit.log 2>&1 &
```

`nohup` détache le processus du terminal : il survit à la fermeture de
l'onglet, à l'expiration du jeton Hostinger, à la veille et à l'extinction de
ton PC. Le `&` rend la main immédiatement.

Vérifie juste que c'est bien parti (facultatif, 30 s après) :

```bash
tail -5 /var/log/triptic-gh-nuit.log
```

Tu peux fermer l'onglet. **Ne relance pas la commande une seconde fois** : un
seul import à la fois.

## 3. Demain matin — une seule commande

```bash
cat /opt/graphhopper/DERNIERE-NUIT.txt
```

| `état` | Signification | À faire |
|---|---|---|
| `SUCCES` | Lorraine + Alpes FR/CH/IT en service | Rien — vérifs ci-dessous |
| `PARTIEL` | Lorraine acquise, Alpes non abouties | Relancer la nuit suivante |
| `EN_COURS` | Import encore en route | Laisser finir, revérifier plus tard |
| `ECHEC` | Rien n'a abouti | Lire le log, couverture d'origine intacte |

En cas d'`ECHEC` ou de `PARTIEL`, la raison est dans le journal :

```bash
grep -E "✗|⚠" /var/log/triptic-gh-nuit.log | tail -20
```

## 4. Vérifier que ça marche vraiment (3 curl)

Nancy → Metz (Lorraine, palier 1) :

```bash
curl -sS "http://localhost:8989/route?point=48.6937,6.1834&point=49.1203,6.1778&profile=car_scenic" | head -c 200
```

Chamonix → Genève (Alpes + passage de frontière, palier 2) :

```bash
curl -sS "http://localhost:8989/route?point=45.9237,6.8694&point=46.2044,6.1432&profile=car_scenic" | head -c 200
```

Non-régression Alsace (doit toujours répondre) :

```bash
curl -sS "http://localhost:8989/route?point=48.0794,7.3585&point=48.0403,7.1409&profile=car_scenic" | head -c 200
```

Attendu : un JSON contenant `"distance":`. Un message `Cannot find point`
signifie que le point est hors de la couverture obtenue.

Bout en bout, via l'API publique TRIPTIC (Colmar → Chamonix) :

```bash
curl -sS -X POST http://82.25.118.185:3001/api/trips/recompute -H "Content-Type: application/json" -d '{"mode":"roadtrip","duration_days":1,"days":[{"day":1,"title":"Test","activities":[{"type":"visit","time_of_day":"morning","title":"Colmar","lat":48.0794,"lng":7.3585},{"type":"visit","time_of_day":"afternoon","title":"Chamonix","lat":45.9237,"lng":6.8694}]}]}' | head -c 300
```

Attendu : `"routed":true`. Si `false`, le trajet sort de la couverture.

## 5. Si tu veux suivre en direct (facultatif)

```bash
tail -f /var/log/triptic-gh-nuit.log
```

`Ctrl+C` quitte le suivi **sans arrêter l'import**.

Pour tout arrêter volontairement (le graphe en service reste intact) :

```bash
pkill -f graphhopper-overnight.sh; docker rm -f triptic-gh-build
```

## Notes techniques

- **Source unique** `europe-latest.osm.pbf` découpée par bbox : pas de
  `osmium merge`, donc aucun nœud dupliqué — c'est ce qui faisait planter
  GraphHopper 12 (cf. `RUNBOOK-routing-extension.md`).
- **Zone contiguë** Alsace → Lorraine → Jura → Alpes → Suisse → Italie du NO :
  un graphe en îlots séparés ne sait pas router d'un îlot à l'autre.
- **Autriche et Slovénie exclues** : hors région pilote (CLAUDE.md §4bis) et
  chaque degré de longitude en plus allonge la préparation CH.
- Un **swap de 8 Go** est créé si absent : filet anti-OOM pendant la phase de
  contraction hierarchies, la plus gourmande. Il disparaît au reboot.
- Le téléchargement reprend où il s'est arrêté (`curl -C -`) en cas de coupure.
