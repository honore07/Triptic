# RUNBOOK — HTTPS (viretrip.com + triptic.hakoe-alsace.com)

> **État : EN SERVICE.** Certificat émis le 19/08/2026, vérifié de bout en bout
> le 25/08/2026. **Le 10/09/2026, `viretrip.com` et `www.viretrip.com` ont été
> ajoutés au routeur** : Traefik a étendu le certificat aux trois domaines tout
> seul, et `APP_URL` est passé sur `https://viretrip.com`. L'ancien domaine
> continue de répondre. Ce document décrit l'installation **réelle** du VPS — il
> ne reste rien à exécuter.
>
> Les 3 features qui étaient bloquées par le contexte non sécurisé sont
> débloquées : clipboard (lien public), service worker (PWA/offline) et
> géolocalisation.

## ⚠️ Ne pas installer nginx ni certbot sur ce VPS

Une version précédente de ce runbook décrivait une mise en place `nginx` +
`certbot --nginx`. **C'était faux** : nginx n'est pas installé sur ce VPS, et
les ports 80/443 sont tenus par **Traefik**, qui sert aussi les autres services
de la machine.

Lancer `apt-get install nginx` / `certbot --nginx` ferait échouer nginx au
démarrage (port 80 occupé) et, si Traefik était arrêté pour « libérer » le port,
**couperait tous les sites du VPS**. Le TLS est déjà automatisé — il n'y a rien
à ajouter.

## Architecture réelle du TLS

```
Internet :443 ──► Traefik (conteneur Docker `traefik-traefik-1`, network host)
                   │  resolver ACME « letsencrypt » (HTTP-01 sur l'entrypoint web)
                   │  redirection globale 80 → 443
                   └──► http://127.0.0.1:3001  (Express / PM2 « triptic-api »)
```

- **DNS** : `triptic.hakoe-alsace.com`, `viretrip.com` et `www.viretrip.com` →
  `82.25.118.185` (A records Cloudflare, **nuage gris / DNS only** — requis pour
  le challenge HTTP-01).
  ⚠️ Passer `viretrip.com` en proxy (nuage orange) casserait la génération : le
  flux SSE de `/api/ai/generate-trips` n'émet un événement qu'au changement
  d'étape, sans battement régulier, et Cloudflare coupe une requête restée
  silencieuse ~100 s (erreur 524). Ajouter un ping de maintien dans `sseWrite`
  (`server/src/routes/ai.ts`) **avant** d'activer le proxy, et régler le mode
  SSL/TLS sur « Full (strict) » pour éviter la boucle de redirection.
- **Route** : `/docker/traefik/dynamic/triptic.yml` (provider fichier, `watch=true`,
  donc pris en compte sans redémarrer Traefik) :

```yaml
http:
  routers:
    triptic:
      rule: "Host(`triptic.hakoe-alsace.com`) || Host(`viretrip.com`) || Host(`www.viretrip.com`)"
      entryPoints:
        - websecure
      service: triptic
      tls:
        certResolver: letsencrypt
  services:
    triptic:
      loadBalancer:
        servers:
          - url: "http://127.0.0.1:3001"
```

- **Certificat** : Let's Encrypt, stocké dans le volume Docker
  `traefik_traefik-letsencrypt` (`/letsencrypt/acme.json`).
- **Renouvellement : automatique.** Traefik réévalue les certificats toutes les
  24 h (`Testing certificate renew...` dans les logs) et renouvelle ~30 jours
  avant expiration. Aucun timer systemd, aucun cron, aucune action manuelle.
- **`APP_URL`** dans `/opt/triptic/.env` vaut `https://triptic.hakoe-alsace.com`
  (sert au CORS et aux balises OG des liens publics).

## Vérifier que tout va bien

Depuis n'importe quelle machine :

```bash
curl -s https://triptic.hakoe-alsace.com/health
```

Attendu : `{"status":"ok",...}`.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -I http://triptic.hakoe-alsace.com/health
```

Attendu : `301` (redirection vers HTTPS, faite par Traefik).

Date d'expiration du certificat en cours :

```bash
echo | openssl s_client -servername triptic.hakoe-alsace.com -connect triptic.hakoe-alsace.com:443 2>/dev/null | openssl x509 -noout -dates
```

Sur le VPS, l'activité ACME de Traefik :

```bash
docker logs traefik-traefik-1 --since 48h 2>&1 | grep -i acme
```

Dans le navigateur sur https://triptic.hakoe-alsace.com :
- Console : `window.isSecureContext` → `true`
- « Lien public » sur un trip → « Lien copié » s'affiche
- Application → Service Workers : le SW est enregistré (PWA installable)
- Explore → « Autour de moi » : la demande de position s'affiche

## Ajouter un domaine (méthode suivie le 10/09/2026 pour viretrip.com)

1. Chez le registrar : A records du domaine **et** de son `www` →
   `82.25.118.185`, en **DNS only** (nuage gris chez Cloudflare) le temps de
   l'émission du certificat. Vérifier la propagation avant de continuer :
   `nslookup <domaine> 8.8.8.8`.
2. Sauvegarder la config, puis ajouter le host à la règle du routeur.
   **Ne pas utiliser `sed` par SSH** : les accents graves de la règle Traefik
   sont interprétés comme des substitutions de commande par le shell, des deux
   côtés de la connexion. Écrire le fichier complet ailleurs, le vérifier, puis
   le déplacer — `/root` et `/docker` sont sur `/dev/sda1`, le `mv` est donc
   atomique et Traefik (`watch=true`) ne peut pas lire un fichier à moitié écrit.

```bash
cp /docker/traefik/dynamic/triptic.yml /docker/traefik/dynamic/triptic.yml.bak-$(date +%Y%m%d)
```

   Puis, une fois le nouveau contenu écrit et relu dans `/root/triptic-new.yml` :

```bash
mv /root/triptic-new.yml /docker/traefik/dynamic/triptic.yml
```

3. Passer `APP_URL` sur le nouveau domaine et recharger l'API (il pilote le CORS
   et les balises OG des liens publics ; le front, lui, appelle `/api` en
   relatif — aucune reconstruction nécessaire) :

```bash
sed -i 's#^APP_URL=.*#APP_URL=https://viretrip.com#' /opt/triptic/.env && pm2 reload triptic-api --update-env
```

4. Vérifier : `/health` sur le nouveau domaine et sur l'ancien, la redirection
   `http` → `https` (308), et les noms couverts par le certificat :

```bash
echo | openssl s_client -servername viretrip.com -connect viretrip.com:443 2>/dev/null | openssl x509 -noout -text | grep -A2 "Subject Alternative Name"
```

## Durcissement

- **Port 3001 fermé au public.** Express écoute sur `127.0.0.1` (`HOST`, défaut
  boucle locale) : `http://82.25.118.185:3001` ne répond plus, tout passe par
  Traefik en HTTPS. Pour réouvrir temporairement (debug) : `HOST=0.0.0.0` dans
  `/opt/triptic/.env` puis `pm2 restart triptic-api --update-env`.
  ⚠️ **n8n est en réseau bridge** (`n8n_default`), il ne peut donc pas joindre la
  loopback de l'hôte : ses workflows appellent l'API par le domaine HTTPS.
  Toute nouvelle intégration depuis un conteneur doit faire pareil.
  `ufw` reste `inactive` — si tu l'actives un jour, **`ufw allow 22` d'abord**,
  sinon tu perds l'accès SSH.
- **`HEAD /` renvoie 404** alors que `GET /` renvoie 200 : le fallback SPA de
  `server/src/app.ts` ne traite que `GET`. Sans effet pour les navigateurs,
  mais un monitoring d'uptime configuré en HEAD verra le site « down ».
- Le watchdog `/opt/triptic/deploy/healthcheck-watchdog.sh` (cron 5 min) tape sur
  `http://127.0.0.1:3001/health` — compatible loopback. Il n'est **pas versionné** :
  il n'existe que sur le VPS.
