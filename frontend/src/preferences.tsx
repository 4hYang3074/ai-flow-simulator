import { useEffect, type Dispatch, type SetStateAction, type RefObject, createContext, useContext, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { animate } from "motion";
import { translations } from "./translations";
export type Language = "zh" | "en";
type Phase = "idle" | "blurring" | "focusing";
const root = document.documentElement;
let currentLanguage: Language = root.lang === "en" ? "en" : "zh";
export function pick(zh: string, en: string): string { return currentLanguage === "zh" ? zh : en; }
export function t(text: string): string {
  const entry = translations[text];
  return entry ? entry[currentLanguage === "en" ? 1 : 0] : text;
}
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Storage can be unavailable. */ } }
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const Preferences = createContext<{
  language: Language; state: Phase; dark: boolean; busy: boolean;
  switchLanguage: (value: Language) => void; toggleTheme: (button: HTMLButtonElement) => void;
} | null>(null);
const LANGUAGE_MOTION = { blurPx: 6, duration: .3, focusDuration: .6 };
export function LanguageTransition({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(currentLanguage);
  const [state, setState] = useState<Phase>("idle");
  const [dark, setDark] = useState(root.classList.contains("dark"));
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const explicitTheme = useRef(false);
  // Listen only until the user makes an explicit choice, for this page.
  useThemeSystem(setDark, explicitTheme);
  function phase(next: Phase) { root.dataset.langState = next; setState(next); }
  function commitLanguage(value: Language) {
    currentLanguage = value; root.lang = value === "zh" ? "zh-Hans" : "en";
    setLanguage(value); save("flow-sim.language.v1", value);
  }
  async function tween(from: number, to: number, duration: number) {
    let timer: ReturnType<typeof setTimeout>;
    const update = (n: number) => { root.style.setProperty("--lang-blur", `${n * LANGUAGE_MOTION.blurPx}px`); root.style.setProperty("--lang-fill", `${100 - n * 100}%`); };
    const animation = animate(from, to, { duration, ease: to ? [0.42, 0, 0.58, 1] : [.165, .84, .44, 1], onUpdate: update });
    await Promise.race([Promise.resolve(animation), new Promise<void>(resolve => { timer = setTimeout(resolve, duration * 1000 + 400); })]);
    clearTimeout(timer!); animation.stop(); update(to);
  }
  async function switchLanguage(value: Language) {
    if (locked.current || value === language) return;
    locked.current = true; setBusy(true); root.setAttribute("aria-busy", "true");
    try {
      if (!reduced()) { phase("blurring"); await tween(0, 1, LANGUAGE_MOTION.duration); }
      flushSync(() => commitLanguage(value));
      if (!reduced()) { phase("focusing"); await tween(1, 0, LANGUAGE_MOTION.focusDuration); }
    } finally { phase("idle"); root.style.removeProperty("--lang-blur"); root.style.removeProperty("--lang-fill"); root.removeAttribute("aria-busy"); locked.current = false; setBusy(false); }
  }
  async function toggleTheme(button: HTMLButtonElement) {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    const next = !dark;
    const swap = () => { explicitTheme.current = true; root.classList.toggle("dark", next); setDark(next); save("flow-sim.theme.v1", next ? "dark" : "light"); };
    try {
      if (!document.startViewTransition || reduced()) { swap(); return; }
      const bounds = button.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2, y = bounds.top + bounds.height / 2;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = document.startViewTransition(() => flushSync(swap));
      try { await transition.ready;
        await root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 650, easing: "cubic-bezier(.4,0,.2,1)", pseudoElement: "::view-transition-new(root)" }).finished;
      } catch { transition.skipTransition(); }
      await transition.finished;
    } finally { locked.current = false; setBusy(false); }
  }
  return <Preferences.Provider value={{ language, state, dark, busy, switchLanguage, toggleTheme }}>{children}</Preferences.Provider>;
}
function useThemeSystem(setDark: Dispatch<SetStateAction<boolean>>, explicit: RefObject<boolean>) {
  useEffect(() => {
    try { explicit.current = ["dark", "light"].includes(localStorage.getItem("flow-sim.theme.v1") ?? ""); } catch { /* Follow system. */ }
    const query = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => { if (!explicit.current) { root.classList.toggle("dark", query.matches); setDark(query.matches); } };
    query.addEventListener("change", sync);
    const observer = new MutationObserver(() => setDark(root.classList.contains("dark")));
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => { query.removeEventListener("change", sync); observer.disconnect(); };
  }, [setDark, explicit]);
}
export function useLanguageSwitch() { const value = useContext(Preferences); if (!value) throw new Error("Missing LanguageTransition"); return value; }
export function AppearanceControls() {
  const { language, dark, busy, switchLanguage, toggleTheme } = useLanguageSwitch();
  return <div className="flex shrink-0 items-center gap-2">
    <div className="flex rounded-full border border-border bg-surface p-1" role="group" aria-label={t("界面语言")}>
      {(["zh", "en"] as const).map(code => <button key={code} type="button" disabled={busy} aria-pressed={language === code} lang={code === "zh" ? "zh-Hans" : "en"} onClick={() => switchLanguage(code)} className={`min-h-9 min-w-11 rounded-full px-2 text-xs disabled:cursor-wait ${language === code ? "bg-surface-2 font-semibold text-text" : "text-muted"}`}>{code === "zh" ? "中文" : "EN"}</button>)}
    </div>
    <button type="button" className="relative flex size-11 items-center justify-center rounded-full border border-border bg-surface text-text disabled:cursor-wait" disabled={busy} onClick={e => toggleTheme(e.currentTarget)} aria-label={t(dark ? "切换到浅色模式" : "切换到深色模式")} title={t(dark ? "切换到浅色模式" : "切换到深色模式")}>
      <span className={`theme-icon ${dark ? "hidden-icon" : ""}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg></span>
      <span className={`theme-icon ${dark ? "" : "hidden-icon"}`} aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/></svg></span>
    </button>
  </div>;
}
