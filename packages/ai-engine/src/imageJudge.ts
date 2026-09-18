import Anthropic from '@anthropic-ai/sdk';

/** Une image à montrer au modèle, déjà téléchargée et encodée. */
export interface JudgedImage {
  data: string; // base64
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
}

/**
 * Un modèle qui VOIT les images. Deepseek ne lit que du texte : le titre d'une
 * photo Commons peut mentir (« Viewpoint, Waterfall » montrait des pieds sur
 * une passerelle grillagée), seul un regard sur l'image le révèle.
 */
export interface ImageJudge {
  name: string;
  /** Réponse texte du modèle, ou une erreur (le code appelant se replie). */
  look(opts: {
    system: string;
    prompt: string;
    images: JudgedImage[];
    timeoutMs?: number;
  }): Promise<string>;
}

/** Modèle surchargeable par env (ANTHROPIC_VISION_MODEL) sans redéploiement de code. */
const DEFAULT_VISION_MODEL = 'claude-opus-5';

export function createAnthropicImageJudge(
  apiKey: string,
  model = process.env['ANTHROPIC_VISION_MODEL'] ?? DEFAULT_VISION_MODEL,
): ImageJudge {
  const client = new Anthropic({ apiKey });
  return {
    name: `anthropic:${model}`,
    async look({ system, prompt, images, timeoutMs = 30_000 }) {
      const content: Anthropic.Beta.BetaContentBlockParam[] = images.flatMap((image, n) => [
        { type: 'text' as const, text: `Photo ${n}` },
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
        },
      ]);
      content.push({ type: 'text', text: prompt });
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: 4000,
          // Classer des photos : peu de réflexion suffit
          output_config: { effort: 'low' },
          // Un refus de sécurité relance la même requête sur un autre modèle
          betas: ['server-side-fallback-2026-06-01'],
          fallbacks: [{ model: 'claude-opus-4-8' }],
          system,
          messages: [{ role: 'user', content }],
        },
        { timeout: timeoutMs, maxRetries: 1 },
      );
      if (response.stop_reason === 'refusal') throw new Error('Image judge refused the request');
      return response.content
        .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
    },
  };
}
