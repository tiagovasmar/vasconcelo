import { languageLabel } from "@/content/labels";
import type { Language } from "@/content/schema";

/** Banderas pequeñas en SVG propio (los emojis de bandera se ven como letras en Windows). Decorativas: el texto identifica el idioma. */
const flags: Partial<Record<Language, React.ReactNode>> = {
  ja: (<><rect width="24" height="16" fill="#fff" /><circle cx="12" cy="8" r="4.6" fill="#bc002d" /></>),
  zh: (<><rect width="24" height="16" fill="#de2910" /><polygon points="4.6,2.2 5.3,4.3 7.5,4.3 5.7,5.6 6.4,7.7 4.6,6.4 2.8,7.7 3.5,5.6 1.7,4.3 3.9,4.3" fill="#ffde00" /></>),
  en: (<><rect width="24" height="16" fill="#fff" /><circle cx="12" cy="8" r="4" fill="none" stroke="#1e3a8a" strokeWidth="1.6" /></>),
  es: (<><rect width="24" height="16" fill="#c60b1e" /><rect y="4" width="24" height="8" fill="#ffc400" /></>),
};

/** Bandera de un idioma de edición (decorativa). */
export function Flag({ language, className = "h-3 w-[18px]" }: { language: Language; className?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={`shrink-0 rounded-[2px] ring-1 ring-ink/25 ${className}`} aria-hidden="true" focusable="false">
      {flags[language]}
    </svg>
  );
}

/** Idioma de una edición: bandera + texto. Un solo lugar para el mapeo, así no hay etiquetas contradictorias. */
export function LanguageBadge({ language, size = "sm", className = "" }: { language: Language; size?: "sm" | "lg" | "plain"; className?: string }) {
  const box = size === "lg" ? "min-h-8 px-3 text-sm" : size === "sm" ? "min-h-6 px-2 text-[.72rem] sm:text-xs" : "";
  const frame = size === "plain" ? "" : "rounded-full border border-ink/20 bg-white";
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium text-ink/80 ${frame} ${box} ${className}`} data-testid={size === "plain" ? undefined : "etiqueta-idioma"} data-language={language}>
      <Flag language={language} />
      {languageLabel[language]}
    </span>
  );
}
