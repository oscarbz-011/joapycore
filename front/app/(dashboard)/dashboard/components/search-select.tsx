'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchSelectProps<T> {
  items: T[];
  value: string;
  onChange: (id: string, item: T | null) => void;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | null | undefined;
  filterFn: (item: T, query: string) => boolean;
  placeholder?: string;
  emptyMessage?: string;
  onCreate?: () => void;
  createLabel?: string;
  disabled?: boolean;
  required?: boolean;
}

export function SearchSelect<T>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getDescription,
  filterFn,
  placeholder = 'Buscar...',
  emptyMessage = 'Sin resultados',
  onCreate,
  createLabel = 'Crear nuevo',
  disabled,
  required,
}: SearchSelectProps<T>) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = value ? items.find((i) => getKey(i) === value) ?? null : null;
  const filtered = query.trim() ? items.filter((i) => filterFn(i, query)) : items;

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function handleSelect(item: T) {
    onChange(getKey(item), item);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('', null);
    setQuery('');
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(true)}
        className={cn(
          'flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm transition-colors',
          open
            ? 'border-border bg-card ring-1 ring-ring/30'
            : 'border-border bg-card hover:border-ring/50',
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        )}
      >
        {open ? (
          <>
            <Search size={14} className="shrink-0 text-muted-foreground/60" />
            <input
              ref={inputRef}
              className="flex-1 outline-none bg-transparent text-foreground placeholder:text-muted-foreground/60"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {required && (
              <input
                tabIndex={-1}
                required
                value={value}
                onChange={() => {}}
                className="absolute opacity-0 w-0 h-0"
                aria-hidden
              />
            )}
          </>
        ) : selected ? (
          <>
            <span className="flex-1 truncate text-foreground">{getLabel(selected)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground"
              >
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <>
            <span className="flex-1 text-muted-foreground/60">{placeholder}</span>
            <ChevronDown size={14} className="shrink-0 text-muted-foreground/60" />
            {required && (
              <input
                tabIndex={-1}
                required
                value=""
                onChange={() => {}}
                className="absolute opacity-0 w-0 h-0"
                aria-hidden
              />
            )}
          </>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden">
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-muted-foreground/60">{emptyMessage}</li>
            ) : (
              filtered.slice(0, 60).map((item) => (
                <li
                  key={getKey(item)}
                  onMouseDown={() => handleSelect(item)}
                  className={cn(
                    'px-3 py-2 cursor-pointer hover:bg-muted/20',
                    getKey(item) === value ? 'bg-muted/30 font-medium' : '',
                  )}
                >
                  <p className="text-sm text-foreground truncate">{getLabel(item)}</p>
                  {getDescription && getDescription(item) && (
                    <p className="text-xs text-muted-foreground/60 truncate">{getDescription(item)}</p>
                  )}
                </li>
              ))
            )}
          </ul>

          {onCreate && (
            <div className="border-t border-border">
              <button
                type="button"
                onMouseDown={onCreate}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-sm text-muted-foreground hover:bg-muted/20 hover:text-foreground"
              >
                <Plus size={14} />
                {createLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
