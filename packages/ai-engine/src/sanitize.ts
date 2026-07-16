const MAX_INPUT_LENGTH = 2000;

/** Balises qui pourraient briser les limites du prompt (protection injection). */
const FORBIDDEN_PATTERNS = [
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /^\s*system\s*:/gim,
  /^\s*assistant\s*:/gim,
];

/**
 * Nettoie une entrée utilisateur avant de l'inclure dans un prompt LLM.
 * Voir .claude/skills/api-security — longueur max, balises système, markdown.
 */
export function sanitizeUserInput(raw: string): string {
  let text = raw.slice(0, MAX_INPUT_LENGTH);
  for (const pattern of FORBIDDEN_PATTERNS) {
    text = text.replace(pattern, '');
  }
  // Neutralise les blocs de code qui pourraient injecter des instructions
  text = text.replace(/```/g, "'''");
  return text.trim();
}
