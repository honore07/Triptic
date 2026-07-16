---
name: api-security
description: Security best practices for Node.js/Express APIs, JWT auth,
  RGPD compliance, Stripe webhooks, and API key management. Triggers on
  any authentication, payment, or data handling task.
user-invocable: false
---

# API Security — TRIPTIC

## JWT & Auth
- Toujours valider le JWT côté serveur avant d'accéder aux données user
- Expiration courte (15min) + refresh token httpOnly cookie
- Rate limiting sur /api/auth/* (max 5 req/min par IP)

## Clés API
- Jamais de clé API dans le code ou les logs
- Variables d'env uniquement (.env non versionné, .env.example versionné)
- Rotation des clés en cas de suspicion de fuite

## Stripe Webhooks
- Toujours vérifier la signature webhook (stripe.webhooks.constructEvent)
- Idempotence : vérifier si l'événement a déjà été traité (event.id en BDD)
- Répondre 200 immédiatement, traiter en async

## RGPD
- Données utilisateurs sur VPS EU uniquement (Hostinger EU)
- Deepseek : ne pas envoyer de données personnelles identifiables dans les prompts
- Droit à l'effacement : endpoint DELETE /api/user implémenté
- Logs : anonymiser les IPs après 7 jours

## Input Sanitization (protection prompt injection)
- Toute entrée utilisateur qui entre dans un prompt Deepseek doit être :
  1. Limitée en longueur (max 2000 chars)
  2. Débarrassée des balises système (system:, assistant:, <|im_start|>)
  3. Échappée pour éviter les injections markdown qui brisent les limites de prompt
