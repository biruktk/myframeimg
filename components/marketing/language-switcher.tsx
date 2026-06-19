"use client";

import { useEffect, useRef, useState } from "react";

import { localeFlags, localeNativeNames } from "@/lib/locale-labels";
import type { Locale } from "@/lib/i18n";

type LangRow = { code: string; name?: string; native_name?: string };

type Props = {
  locale: Locale;
  languages: LangRow[];
  onChange: (code: string) => void;
};

export function LanguageSwitcher({ locale, languages, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options = languages.length ? languages : [{ code: "en", native_name: "English" }];
  const current = options.find((l) => l.code === locale) ?? options[0];

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const flag = localeFlags[locale as Locale] ?? "🌐";
  const label = current.native_name || current.name || localeNativeNames[locale as Locale] || locale;

  return (
    <div ref={rootRef} className={`lang-switcher${open ? " open" : ""}`}>
      <button
        type="button"
        className="lang-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <span className="lang-switcher-flag">{flag}</span>
        <span className="lang-switcher-label">{label}</span>
        <i className="fas fa-chevron-down lang-switcher-chevron" aria-hidden />
      </button>
      <div className="lang-switcher-panel" role="listbox" aria-label="Language">
        {options.map((lang) => {
          const selected = lang.code === locale;
          const native = lang.native_name || lang.name || lang.code;
          const english = lang.name && lang.name !== native ? lang.name : null;
          return (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={selected}
              className={`lang-switcher-option${selected ? " is-selected" : ""}`}
              onClick={() => {
                setOpen(false);
                if (lang.code !== locale) onChange(lang.code);
              }}
            >
              <span className="lang-switcher-option-flag">
                {localeFlags[lang.code as Locale] ?? "🌐"}
              </span>
              <span className="lang-switcher-option-text">
                <strong>{native}</strong>
                {english ? <small>{english}</small> : null}
              </span>
              {selected ? <i className="fas fa-check lang-switcher-check" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
