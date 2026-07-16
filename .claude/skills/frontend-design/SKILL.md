---
name: frontend-design
description: UI/UX design philosophy and TRIPTIC design system (palette
  summit/trail/ridge, typographie DM Sans/Inter, composants TripCard, chat,
  carte, paywall). Triggers on any UI component, page, or design task.
user-invocable: true
---

# Frontend Design — TRIPTIC

## Philosophie
- Penser hiérarchie visuelle AVANT le code : un seul point focal par écran
- Mobile-first, toujours — chaque composant est d'abord pensé pour 375px
- La profondeur existe mais ne s'impose pas ("progressivement complexe")
- Éviter le look "IA générique" : pas de dégradés violets, pas de glassmorphism
  gratuit, pas d'emoji dans l'UI produit
- Espaces généreux (échelle 4/8/12/16/24/32/48), rythme vertical cohérent
- Micro-interactions sobres (Framer Motion) : durée 150–250ms, ease-out,
  respecter `prefers-reduced-motion`

## Palette (CSS custom properties — source de vérité)
```css
:root {
  --color-summit:  #1A6BDB; /* CTA principal */
  --color-trail:   #0D1B2A; /* textes */
  --color-ridge:   #3A5068; /* textes secondaires */
  --color-terrain: #F0F5FB; /* surfaces */
  --color-pine:    #1A8A4A; /* succès */
  --color-amber:   #C97A00; /* warning */
  --color-storm:   #C03030; /* erreur */
  --color-snow:    #FFFFFF;
  --color-mist:    #D0DCE8; /* bordures */
  --color-fog:     #8AA0B8; /* placeholders */
}
```

## Typographie
- Display : `DM Sans` — titres, chiffres clés des TripCards
- Body : `Inter` — texte courant
- Mono : `JetBrains Mono` — coordonnées, distances, données techniques

## Composants clés
- **TripCard** : photo réelle en fond, dégradé `linear-gradient(180deg,
  transparent 30%, rgba(13,27,42,.85))`, données superposées en bas
  (durée, dénivelé, difficulté), radius 16px
- **TripCompare** : les 3 cards côte à côte (colonne sur mobile), le choix
  doit être difficile et plaisant
- **ChatBubble** : bulles asymétriques, IA à gauche fond terrain, user à
  droite fond summit texte snow
- **PaywallModal** : hiérarchie claire — bénéfice d'abord, prix ensuite,
  CTA summit plein, option "plus tard" discrète en texte
- **DifficultyBadge** : radius 6px, fond teinté 12% de la couleur sémantique

## Accessibilité (non négociable)
- Contraste ≥ 4.5:1 texte normal, ≥ 3:1 large
- Focus visible (outline 2px summit) sur tout élément interactif
- aria-label sur tout bouton sans texte, alt descriptif sur toute image
- Cibles tactiles ≥ 44×44px
