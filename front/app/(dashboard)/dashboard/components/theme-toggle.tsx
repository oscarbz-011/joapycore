'use client';

import { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../../../lib/theme-context';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // El ícono del botón refleja el modo "system" cuando está activo — no
  // solo el tema resuelto — así se ve de un vistazo si está siguiendo al SO.
  const TriggerIcon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <div ref={ref} className="relative">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => setOpen((v) => !v)}
        title="Tema"
        className="text-muted-foreground"
      >
        <TriggerIcon size={15} />
      </Button>

      {open && (
        <div className="animate-rise-in absolute right-0 top-[calc(100%+8px)] z-50 w-44 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-lg">
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setTheme(value); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors cursor-pointer border-0 bg-transparent font-[inherit]',
                theme === value ? 'text-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              <Icon size={14} className="shrink-0" />
              {label}
              {theme === value && <Check size={13} className="ml-auto shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
