'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// La preferencia que elige el usuario — 'system' no es un tema en sí, es un
// modo que sigue el del sistema operativo en vivo (ver el listener de
// matchMedia más abajo).
export type ThemePreference = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? systemTheme() : pref;
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

const Ctx = createContext<{
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemePreference) => void;
}>({
  theme: 'system',
  resolvedTheme: 'light',
  setTheme: () => {},
});

// Lee la preferencia guardada — el mismo cálculo que ya hizo el script
// inline en app/layout.tsx antes de la hidratación (evita el flash). Se usa
// como inicializador perezoso de useState (corre una vez, sincrónico, antes
// del primer render en el cliente) en vez de un efecto, porque acá no hace
// falta un setState adicional después de montar.
function initialTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  return (localStorage.getItem('joappy-theme') as ThemePreference | null) ?? 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'light' : resolve(initialTheme()),
  );

  // Mientras la preferencia sea "system", sigue el tema del SO en vivo —
  // si el usuario lo cambia (Windows/macOS) con la pestaña abierta, la app
  // se actualiza sola sin recargar.
  useEffect(() => {
    if (theme !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    function handle() {
      const resolved = systemTheme();
      setResolvedTheme(resolved);
      apply(resolved);
    }
    mql.addEventListener('change', handle);
    return () => mql.removeEventListener('change', handle);
  }, [theme]);

  const setTheme = (next: ThemePreference) => {
    setThemeState(next);
    localStorage.setItem('joappy-theme', next);
    const resolved = resolve(next);
    setResolvedTheme(resolved);
    apply(resolved);
  };

  return <Ctx.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
