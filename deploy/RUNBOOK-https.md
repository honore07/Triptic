# RUNBOOK — HTTPS sur triptic.hakoe-alsace.com

> Objectif : servir l'app en HTTPS. Répare d'un coup les 3 features bloquées
> par le contexte non sécurisé : copie du lien public (clipboard), service
> worker (PWA/offline) et géolocalisation.
> Prérequis : accès au dashboard Cloudflare de hakoe-alsace.com + terminal VPS.

## 1. DNS (dashboard Cloudflare, 2 min)

Sur cloudflare.com → hakoe-alsace.com → DNS → Add record :

- **Type** : A
- **Name** : `triptic`
- **IPv4** : `82.25.118.185`
- **Proxy status** : ⚠️ **DNS only (nuage GRIS)** — indispensable pour que
  certbot puisse valider le domaine. (Le nuage orange peut être réactivé plus
  tard si tu veux le CDN Cloudflare, avec SSL mode « Full (strict) ».)

Vérifier la propagation depuis le VPS (ou n'importe où) :

```bash
dig +short triptic.hakoe-alsace.com
```

Attendu : `82.25.118.185`. Si vide, attendre 1-2 min et relancer.

## 2. Config Nginx (terminal VPS)

Récupérer la config du repo et l'activer :

```bash
cd /opt/triptic && git pull
```

```bash
sudo cp /opt/triptic/deploy/nginx-triptic.conf /etc/nginx/sites-available/triptic
```

```bash
sudo ln -sf /etc/nginx/sites-available/triptic /etc/nginx/sites-enabled/triptic
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Vérifier que le proxy répond en HTTP sur le domaine :

```bash
curl -s http://triptic.hakoe-alsace.com/health
```

Attendu : `{"status":"ok",...}`.

## 3. Certificat TLS (certbot)

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

```bash
sudo certbot --nginx -d triptic.hakoe-alsace.com --redirect -m jules.million07@gmail.com --agree-tos --no-eff-email
```

`--redirect` fait ajouter par certbot la redirection 80 → 443.
Le renouvellement est automatique (timer systemd) ; vérifier :

```bash
sudo certbot renew --dry-run
```

## 4. Mettre à jour l'app

`APP_URL` sert aux liens publics partagés — le passer en HTTPS :

```bash
sed -i 's#^APP_URL=.*#APP_URL=https://triptic.hakoe-alsace.com#' /opt/triptic/.env && pm2 reload triptic-api
```

## 5. Vérifications finales

```bash
curl -s https://triptic.hakoe-alsace.com/health
```

Attendu : `{"status":"ok",...}`.

```bash
curl -sI https://triptic.hakoe-alsace.com/ | head -5
```

Attendu : `HTTP/1.1 200` (ou HTTP/2) — plus de port :3001 dans l'URL.

Puis dans le navigateur sur https://triptic.hakoe-alsace.com :
- Console : `window.isSecureContext` → `true`
- « Lien public » sur un trip → « Lien copié » s'affiche
- Application → Service Workers : le SW est enregistré (PWA installable)
- Explore → « Autour de moi » : la demande de position s'affiche

## Notes

- Le port 3001 reste ouvert en direct (http://82.25.118.185:3001) tant que le
  firewall ne le bloque pas. Une fois le domaine validé, tu peux le fermer :
  `sudo ufw deny 3001` (l'accès passe alors uniquement par Nginx :443).
- Bascule future vers triptic.app : même procédure (DNS chez le registrar →
  A record vers le VPS, puis `sudo certbot --nginx -d triptic.app -d www.triptic.app`),
  le `server_name` de la config couvre déjà triptic.app.
