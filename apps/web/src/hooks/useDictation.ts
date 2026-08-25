import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Reconnaissance vocale du navigateur (Web Speech API). Le type n'est pas
 * dans lib.dom : on décrit le strict nécessaire plutôt que d'élargir la
 * config TypeScript de tout le projet.
 */
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface UseDictationOptions {
  /** Langue de dictée (fr, en, de) — l'API attend une étiquette BCP-47. */
  lang: string;
  /** Reçoit chaque bout de phrase reconnu, à ajouter à la demande. */
  onText: (text: string) => void;
}

/**
 * Dictée de la demande. `supported` est faux là où l'API n'existe pas
 * (Firefox notamment) : l'appelant masque alors le micro plutôt que de
 * proposer un bouton qui ne ferait rien.
 */
export function useDictation({ lang, onText }: UseDictationOptions) {
  const supported = useMemo(() => recognitionCtor() !== null, []);
  const [listening, setListening] = useState(false);
  const recognition = useRef<RecognitionLike | null>(null);
  // La dernière callback, sans relancer la reconnaissance à chaque frappe
  const latestOnText = useRef(onText);
  latestOnText.current = onText;

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const instance = new Ctor();
    // BCP-47 : « fr » seul suffit, le navigateur choisit la variante
    instance.lang = lang;
    instance.continuous = true;
    // Seuls les segments définitifs sont ajoutés : un texte provisoire
    // réécrirait sans cesse ce que l'utilisateur voit s'inscrire.
    instance.interimResults = false;
    instance.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) {
          const said = result[0]?.transcript?.trim();
          if (said) latestOnText.current(said);
        }
      }
    };
    // Micro refusé ou coupé : on retombe simplement à l'état repos
    instance.onerror = () => {
      recognition.current = null;
      setListening(false);
    };
    instance.onend = () => {
      recognition.current = null;
      setListening(false);
    };
    recognition.current = instance;
    setListening(true);
    instance.start();
  }, [lang]);

  // Quitter la page pendant la dictée ne doit pas laisser le micro ouvert
  useEffect(() => () => recognition.current?.stop(), []);

  return { supported, listening, toggle: () => (listening ? stop() : start()) };
}
