'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';

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

  const baseCls =
    'flex items-center gap-2 w-full rounded-lg border px-3 py-2 text-sm transition-colors';
  const activeCls = open
    ? 'border-slate-500 ring-1 ring-slate-500'
    : 'border-slate-300 hover:border-slate-400';
  const disabledCls = disabled ? 'bg-slate-50 cursor-not-allowed opacity-60' : 'cursor-pointer';

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <div
        role="combobox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen(true)}
        className={`${baseCls} ${activeCls} ${disabledCls}`}
      >
        {open ? (
          <>
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              className="flex-1 outline-none bg-transparent text-slate-900 placeholder:text-slate-400"
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
            {/* hidden native input for required validation */}
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
            <span className="flex-1 truncate text-slate-900">{getLabel(selected)}</span>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="shrink-0 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <>
            <span className="flex-1 text-slate-400">{placeholder}</span>
            <ChevronDown size={14} className="shrink-0 text-slate-400" />
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
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-slate-400">{emptyMessage}</li>
            ) : (
              filtered.slice(0, 60).map((item) => (
                <li
                  key={getKey(item)}
                  onMouseDown={() => handleSelect(item)}
                  className={`px-3 py-2 cursor-pointer hover:bg-slate-50 ${
                    getKey(item) === value ? 'bg-slate-50 font-medium' : ''
                  }`}
                >
                  <p className="text-sm text-slate-900 truncate">{getLabel(item)}</p>
                  {getDescription && getDescription(item) && (
                    <p className="text-xs text-slate-400 truncate">{getDescription(item)}</p>
                  )}
                </li>
              ))
            )}
          </ul>

          {onCreate && (
            <div className="border-t border-slate-100">
              <button
                type="button"
                onMouseDown={onCreate}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
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
