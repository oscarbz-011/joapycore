interface Props {
  status: 'ACTIVE' | 'INACTIVE';
}

export function UserStatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        status === 'ACTIVE'
          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20'
          : 'bg-surface-2 text-muted ring-1 ring-slate-200'
      }`}
    >
      {status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
    </span>
  );
}
