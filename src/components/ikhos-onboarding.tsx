import { useState } from "react";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { IKHOS_LANGUAGES, useIkhosLanguage, type LanguageName } from "@/lib/ikhos-language";

/** First-load native language selection for the consolidated attendee experience. */
export function IkhosOnboarding() {
  const { language, setLanguage, needsOnboarding, completeOnboarding } = useIkhosLanguage();
  const [choice, setChoice] = useState<LanguageName>(language);

  return (
    <Dialog open={needsOnboarding}>
      <DialogContent className="max-w-lg" aria-describedby="ikhos-onboarding-copy">
        <DialogHeader>
          <p className="eyebrow">Welcome to Ikhos AI</p>
          <DialogTitle className="font-display text-2xl">Choose your listening language</DialogTitle>
          <DialogDescription id="ikhos-onboarding-copy">
            Stage audio is isolated, translated and spoken back to you in this language. You can change it at any time
            from the header badge.
          </DialogDescription>
        </DialogHeader>
        <label htmlFor="ikhos-onboarding-language" className="data-label">
          Native language
        </label>
        <select
          id="ikhos-onboarding-language"
          className="mb-field"
          value={choice}
          onChange={(event) => setChoice(event.target.value as LanguageName)}
          aria-label="Select your native language"
        >
          {IKHOS_LANGUAGES.map((item) => (
            <option key={item.code} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <DialogFooter>
          <Button
            className="min-h-11 w-full"
            onClick={() => {
              setLanguage(choice);
              completeOnboarding();
            }}
          >
            <Languages aria-hidden="true" />
            Start listening in {choice}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
