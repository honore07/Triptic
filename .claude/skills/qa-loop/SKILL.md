---
name: qa-loop
description: Audits the TRIPTIC app for bugs, design drift, broken links,
  performance issues, and accessibility violations. Writes findings to QA.md,
  then fixes them incrementally. Trigger at the start of any production session.
user-invocable: true
---

# QA Loop — TRIPTIC

## Audit (Phase 1)
1. Vérifier les routes API (health check, erreurs 500)
2. Tester les flows critiques : génération trip → affichage 3 cards → sélection → export GPX
3. Vérifier le paywall (free → limit → modal → Stripe)
4. Tester i18n (fr/en/de) sur tous les composants
5. Accessibilité : contraste, aria-labels, focus visible
6. Performance : Lighthouse score ≥ 85 (mobile)
7. Offline : service worker actif, tuiles disponibles
8. Écrire tous les problèmes dans QA.md avec priorité (P1/P2/P3)

## Fix (Phase 2)
1. Lire QA.md
2. Traiter les P1 (bloquants) en premier
3. Un fix = un commit avec message conventionnel
4. Re-tester après chaque fix
5. Archiver dans QA.md avec statut "FIXED + date"

## Règles
- Ne jamais fixer un P2 si des P1 existent
- Chaque fix doit avoir un test associé
- Ne pas introduire de régression (run tests avant commit)
