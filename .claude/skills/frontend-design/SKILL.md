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

## Palette v2 — juillet 2026 (CSS custom properties — source de vérité : apps/web/src/styles.css)
Charte fondateur : Shadow Grey · Rosy Copper · Sunflower Gold · Pale Sky.
Ambiance chill & aventure, moderne, très animée.
```css
:root {
  --color-summit:      #C86341; /* Rosy Copper — accent aventure (icônes, hovers, halos) */
  --color-copper-deep: #A64E30; /* copper lisible sur fond clair (petits textes, liens) */
  --color-gold:        #FAC05E; /* Sunflower Gold — CTA (TOUJOURS texte trail dessus) */
  --color-gold-deep:   #E8A83D; /* hover des CTA gold */
  --color-trail:       #1E1E24; /* Shadow Grey — textes, fonds sombres (hero, bulle user) */
  --color-ridge:       #4A4A55; /* textes secondaires */
  --color-sky:         #CDE6F5; /* Pale Sky — surfaces accent, texte sur fond sombre */
  --color-terrain:     #EAF4FB; /* surface claire dérivée de Pale Sky */
  --color-cloud:       #F6FAFD; /* fond de page */
  --color-pine:        #1A8A4A; /* succès */
  --color-amber:       #C97A00; /* warning */
  --color-storm:       #C03030; /* erreur */
  --color-snow:        #FFFFFF;
  --color-mist:        #B9D8EA; /* bordures */
  --color-fog:         #6E7480; /* placeholders (4.5:1 sur snow) */
}
```

### Règles de contraste de la palette v2
- CTA = `bg-gold` + `text-trail` (9:1). JAMAIS `text-snow` sur gold ni sur copper
  en petit texte (copper/snow ≈ 3.4:1) — pour du copper texte sur fond clair,
  utiliser `copper-deep`
- Fond sombre (trail) : textes en snow / sky / gold
- Animations signature : `.fade-up` (entrées, stagger via animation-delay),
  `.hero-blob` (halos copper/gold flottants sur le hero), `.glow-cta`
  (lueur pulsée des CTA gold), `.tuner-range` (curseurs du TripTuner)

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
