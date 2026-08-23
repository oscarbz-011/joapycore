'use client';

import { forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Minus, Undo, Redo, Heading1, Heading2, Heading3,
  Table as TableIcon, Rows3, Columns3, Trash2,
} from 'lucide-react';

// ── Toolbar button ─────────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick,
  active,
  disabled,
  children,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-zinc-200 dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-zinc-800 dark:hover:text-zinc-100'
      } disabled:opacity-30 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-0.5" />;
}

// ── Editor ─────────────────────────────────────────────────────────────────────

interface RichTextEditorProps {
  content?: string;
  onChange?: (json: string) => void;
  placeholder?: string;
  minHeight?: number;
  readOnly?: boolean;
}

export interface RichTextEditorHandle {
  insertToken: (token: string) => void;
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor({
  content,
  onChange,
  placeholder = 'Escribí el contenido del documento...',
  minHeight = 240,
  readOnly = false,
}, ref) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content ? JSON.parse(content) : undefined,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange?.(JSON.stringify(editor.getJSON()));
    },
  });

  useImperativeHandle(ref, () => ({
    insertToken: (token: string) => {
      editor?.chain().focus().insertContent(token).run();
    },
  }), [editor]);

  if (!editor) return null;

  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  return (
    <div className="border rounded-xl overflow-hidden dark:border-zinc-700 focus-within:ring-2 focus-within:ring-blue-500">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60">
          <ToolbarBtn title="Deshacer (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!canUndo}>
            <Undo size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Rehacer (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!canRedo}>
            <Redo size={14} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title="Título 1"
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Título 2"
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Título 3"
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <Heading3 size={14} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title="Negrita (Ctrl+B)"
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Cursiva (Ctrl+I)"
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Tachado"
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Código inline"
            active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code size={14} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title="Lista con viñetas"
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Lista numerada"
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={14} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title="Cita"
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Separador horizontal"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Minus size={14} />
          </ToolbarBtn>

          <Divider />

          <ToolbarBtn
            title="Insertar tabla"
            active={editor.isActive('table')}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <TableIcon size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Agregar fila"
            disabled={!editor.isActive('table')}
            onClick={() => editor.chain().focus().addRowAfter().run()}
          >
            <Rows3 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Eliminar fila"
            disabled={!editor.isActive('table')}
            onClick={() => editor.chain().focus().deleteRow().run()}
          >
            <Trash2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Agregar columna"
            disabled={!editor.isActive('table')}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
          >
            <Columns3 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Eliminar columna"
            disabled={!editor.isActive('table')}
            onClick={() => editor.chain().focus().deleteColumn().run()}
          >
            <Trash2 size={14} />
          </ToolbarBtn>
          <ToolbarBtn
            title="Eliminar tabla"
            disabled={!editor.isActive('table')}
            onClick={() => editor.chain().focus().deleteTable().run()}
          >
            <Trash2 size={14} className="opacity-70" />
          </ToolbarBtn>
        </div>
      )}

      {/* Editor + placeholder wrapper */}
      <div
        className={`relative ${readOnly ? '' : 'bg-white dark:bg-zinc-900'}`}
        style={{ minHeight }}
      >
        <EditorContent
          editor={editor}
          className="
            prose prose-sm dark:prose-invert max-w-none px-4 py-3
            text-zinc-800 dark:text-zinc-100
            [&_.tiptap]:outline-none
            [&_.tiptap_p]:my-1
            [&_.tiptap_h1]:text-xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mt-3 [&_.tiptap_h1]:mb-1
            [&_.tiptap_h2]:text-lg [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mt-2 [&_.tiptap_h2]:mb-1
            [&_.tiptap_h3]:text-base [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mt-2 [&_.tiptap_h3]:mb-1
            [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:my-1
            [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5 [&_.tiptap_ol]:my-1
            [&_.tiptap_blockquote]:border-l-4 [&_.tiptap_blockquote]:border-zinc-300 [&_.tiptap_blockquote]:dark:border-zinc-600 [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:text-zinc-500
            [&_.tiptap_code]:bg-zinc-100 [&_.tiptap_code]:dark:bg-zinc-800 [&_.tiptap_code]:px-1 [&_.tiptap_code]:rounded [&_.tiptap_code]:text-xs [&_.tiptap_code]:font-mono
            [&_.tiptap_hr]:border-zinc-200 [&_.tiptap_hr]:dark:border-zinc-700 [&_.tiptap_hr]:my-3
            [&_.tiptap_table]:w-full [&_.tiptap_table]:my-2 [&_.tiptap_table]:border-collapse
            [&_.tiptap_th]:border [&_.tiptap_th]:border-zinc-300 [&_.tiptap_th]:dark:border-zinc-600 [&_.tiptap_th]:bg-zinc-100 [&_.tiptap_th]:dark:bg-zinc-800 [&_.tiptap_th]:px-2 [&_.tiptap_th]:py-1 [&_.tiptap_th]:text-left [&_.tiptap_th]:font-semibold
            [&_.tiptap_td]:border [&_.tiptap_td]:border-zinc-300 [&_.tiptap_td]:dark:border-zinc-600 [&_.tiptap_td]:px-2 [&_.tiptap_td]:py-1
          "
        />

        {/* Placeholder — shown when editor is empty and not read-only */}
        {!readOnly && editor.isEmpty && (
          <p className="absolute top-3 left-4 text-sm text-zinc-400 dark:text-zinc-500 pointer-events-none select-none">
            {placeholder}
          </p>
        )}
      </div>
    </div>
  );
});

// ── Read-only renderer ─────────────────────────────────────────────────────────

export function DocumentContent({ content }: { content: string }) {
  return <RichTextEditor content={content} readOnly minHeight={0} />;
}
