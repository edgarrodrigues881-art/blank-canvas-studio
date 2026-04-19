import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Renders a soft veil over the app whenever the theme changes, eliminating
 * the harsh light/dark flash. Listens to `resolvedTheme` and briefly fades in
 * a neutral backdrop-blur layer while the new tokens swap in underneath.
 */
const ThemeTransition = () => {
  const { resolvedTheme } = useTheme();
  const previous = useRef<string | undefined>(resolvedTheme);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!resolvedTheme) return;
    // Skip the very first paint
    if (previous.current === undefined) {
      previous.current = resolvedTheme;
      return;
    }
    if (previous.current === resolvedTheme) return;

    previous.current = resolvedTheme;
    const html = document.documentElement;
    html.classList.add("theme-switching");
    setActive(true);

    const t1 = window.setTimeout(() => setActive(false), 380);
    const t2 = window.setTimeout(() => html.classList.remove("theme-switching"), 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [resolvedTheme]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[2147483646]"
      style={{
        opacity: active ? 1 : 0,
        transition: "opacity 300ms ease",
        background: "hsl(var(--background) / 0.08)",
      }}
    />
  );
};

export default ThemeTransition;
