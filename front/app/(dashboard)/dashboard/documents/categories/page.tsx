'use client';

import { CategoriesTab } from '../../../../../components/documents/categories-tab';
import { DocumentsNav } from '../documents-nav';

export default function DocumentCategoriesPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Categorías</h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Organizá documentos y plantillas por categoría.
        </p>
      </div>

      <DocumentsNav />
      <CategoriesTab />
    </div>
  );
}
