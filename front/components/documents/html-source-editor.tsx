'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { RichTextEditorHandle } from '../rich-text-editor';

// Editor de código simple (textarea monoespaciada) para plantillas de
// HTML/CSS crudo — mismo contrato (insertToken vía ref, RichTextEditorHandle
// reutilizado tal cual) que RichTextEditor, para poder intercambiarlos en
// DocumentEditorForm con un único ref según contentFormat. Sin resaltado de
// sintaxis por ahora: no hay ninguna librería de ese tipo instalada todavía
// y el volumen de edición esperado (retoques puntuales sobre la plantilla
// por defecto) no lo justifica.

interface HtmlSourceEditorProps {
  content?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

export const HtmlSourceEditor = forwardRef<RichTextEditorHandle, HtmlSourceEditorProps>(
  function HtmlSourceEditor({ content, onChange, placeholder, minHeight = 240, readOnly = false }, ref) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      insertToken: (token: string) => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? el.value.length;
        const end = el.selectionEnd ?? el.value.length;
        const next = el.value.slice(0, start) + token + el.value.slice(end);
        onChange?.(next);
        const caret = start + token.length;
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      },
    }), [onChange]);

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
      // Tab inserta 2 espacios en vez de mover el foco — esperable en un
      // editor de código, y si no el usuario no puede indentar HTML.
      if (e.key !== 'Tab') return;
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = el.value.slice(0, start) + '  ' + el.value.slice(end);
      onChange?.(next);
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2));
    }

    return (
      <textarea
        ref={textareaRef}
        value={content ?? ''}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        readOnly={readOnly}
        spellCheck={false}
        style={{ minHeight }}
        className="w-full resize-y rounded-xl border border-border bg-muted/20 p-4 font-mono text-[12.5px] leading-relaxed text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 transition-[box-shadow,border-color]"
      />
    );
  },
);
