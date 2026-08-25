# RUNBOOK — HTTPS sur triptic.hakoe-alsace.com

> **État : EN SERVICE.** Certificat émis le 19/08/2026, vérifié de bout en bout
> le 25/08/2026. Ce document décrit l'installation **réelle** du VPS — il ne
> reste rien à exécuter pour ce domaine.
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

- **DNS** : `triptic.hakoe-alsace.com` → `82.25.118.185` (A record Cloudflare,
  **nuage gris / DNS only** — requis pour le challenge HTTP-01).
- **Route** : `/docker/traefik/dynamic/triptic.yml` (provider fichier, `watch=true`,
  donc pris en compte sans redémarrer Traefik) :

```yaml
http:
  routers:
    triptic:
      rule: "Host(`triptic.hakoe-alsace.com`)"
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

## Ajouter un domaine (ex. bascule vers triptic.app)

1. Chez le registrar : A record `triptic.app` → `82.25.118.185` (+ `www`),
   sans proxy CDN le temps de l'émission du certificat.
2. Sur le VPS, ajouter le host à la règle du routeur — Traefik demande le
   certificat tout seul dans la minute :

```bash
sudo sed -i 's#rule: "Host(`triptic.hakoe-alsace.com`)"#rule: "Host(`triptic.hakoe-alsace.com`) || Host(`triptic.app`) || Host(`www.triptic.app`)"#' /docker/traefik/dynamic/triptic.yml
```

3. Passer `APP_URL` sur le nouveau domaine et recharger l'API :

```bash
sed -i 's#^APP_URL=.*#APP_URL=https://triptic.app#' /opt/triptic/.env && pm2 reload triptic-api
```

## Reste à durcir (non bloquant)

- **Port 3001 exposé.** `ufw` est `inactive` et Express écoute sur `0.0.0.0`,
  donc `http://82.25.118.185:3001` sert l'app en clair, hors HTTPS. Deux façons
  de fermer, par ordre de sécurité :
  1. Faire écouter Express sur la boucle locale uniquement (Traefik tape déjà
     sur `127.0.0.1:3001`) — demande une petite modif de `server/src/index.ts`,
     aucun risque de se couper l'accès SSH.
  2. Activer le firewall — **ne jamais lancer `ufw enable` sans autoriser SSH
     d'abord**, sous peine de perdre l'accès à la machine :
     `sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable`.
     (`ufw deny 3001` seul ne fait rien tant que `ufw` est inactive.)
- **`HEAD /` renvoie 404** alors que `GET /` renvoie 200 : le fallback SPA de
  `server/src/app.ts` ne traite que `GET`. Sans effet pour les navigateurs,
  mais un monitoring d'uptime configuré en HEAD verra le site « down ».
