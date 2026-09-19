/**
 * Shared attendee language preference for the consolidated Ikhos platform.
 * Member A's translation stream and Member B's engine pipeline both read it,
 * and it is persisted in localStorage as `targetLanguageCode`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const IKHOS_LANGUAGES = [
  { name: "Spanish", code: "es" },
  { name: "Mandarin", code: "zh" },
  { name: "Hindi", code: "hi" },
  { name: "Vietnamese", code: "vi" },
  { name: "Arabic", code: "ar" },
  { name: "Nepali", code: "ne" },
  { name: "Swahili", code: "sw" },
  { name: "German", code: "de" },
  { name: "French", code: "fr" },
] as const;

export type LanguageName = (typeof IKHOS_LANGUAGES)[number]["name"];

const STORAGE_KEY = "targetLanguageCode";

function nameForCode(code: string | null): LanguageName | null {
  const match = IKHOS_LANGUAGES.find((item) => item.code === code);
  return match ? match.name : null;
}

type LanguageContextValue = {
  language: LanguageName;
  languageCode: string;
  setLanguage: (language: LanguageName) => void;
  /** True until the attendee has picked a language at least once. */
  needsOnboarding: boolean;
  completeOnboarding: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function IkhosLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageName>("Spanish");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const stored = nameForCode(window.localStorage.getItem(STORAGE_KEY));
    if (stored) setLanguageState(stored);
    else setNeedsOnboarding(true);
  }, []);

  const setLanguage = useCallback((next: LanguageName) => {
    setLanguageState(next);
    const entry = IKHOS_LANGUAGES.find((item) => item.name === next);
    if (entry) window.localStorage.setItem(STORAGE_KEY, entry.code);
  }, []);

  const value = useMemo<LanguageContextValue>(() => {
    const entry = IKHOS_LANGUAGES.find((item) => item.name === language);
    return {
      language,
      languageCode: entry ? entry.code : "es",
      setLanguage,
      needsOnboarding,
      completeOnboarding: () => setNeedsOnboarding(false),
    };
  }, [language, needsOnboarding, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Reads the shared language preference. If a component renders outside the
 * provider (hot reload, isolated preview), it falls back to a self-contained
 * localStorage-backed preference instead of crashing the screen.
 */
export function useIkhosLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  const [language, setLanguageState] = useState<LanguageName>("Spanish");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (context) return;
    const stored = nameForCode(window.localStorage.getItem(STORAGE_KEY));
    if (stored) setLanguageState(stored);
    else setNeedsOnboarding(true);
  }, [context]);

  const fallback = useMemo<LanguageContextValue>(() => {
    const entry = IKHOS_LANGUAGES.find((item) => item.name === language);
    return {
      language,
      languageCode: entry ? entry.code : "es",
      setLanguage: (next: LanguageName) => {
        setLanguageState(next);
        const match = IKHOS_LANGUAGES.find((item) => item.name === next);
        if (match) window.localStorage.setItem(STORAGE_KEY, match.code);
      },
      needsOnboarding,
      completeOnboarding: () => setNeedsOnboarding(false),
    };
  }, [language, needsOnboarding]);

  return context ?? fallback;
}
