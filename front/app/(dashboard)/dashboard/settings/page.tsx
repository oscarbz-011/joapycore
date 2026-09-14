'use client';

import { usePermission } from '@/lib/permissions';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Shield, Bell, Puzzle, Camera, CheckCircle2, AlertTriangle,
  FileKey, Upload, X, RefreshCw, Trash2, Receipt, KeyRound, ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { usersApi } from '../../../../lib/api/users';
import { useAuth } from '../../../../lib/auth-context';
import { sifenApi, type SifenEnvironment } from '../../../../lib/api/sifen';
import { creditBureauApi, type CreditBureauCheckFrequency } from '../../../../lib/api/credit-bureau';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useActiveModules } from '@/lib/use-active-modules';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'profile' | 'security' | 'notifications' | 'integrations' | 'certificates' | 'billing';

// ── Toggle switch ──────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        checked ? 'bg-primary' : 'bg-border'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Brand icons (SVG inline — no CDN) ─────────────────────────────────────────

function GoogleDriveIcon() {
  return (
    <svg viewBox="0 0 87.3 78" className="h-8 w-8">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L26.6 53H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L30.8 3.5c-1.35.8-2.5 1.9-3.3 3.3L1.2 52.5A9.08 9.08 0 000 57h26.6z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L85.1 57c.8-1.4 1.2-2.95 1.2-4.5H60l5.45 10.55z" fill="#ea4335"/>
      <path d="M43.65 25L56.5 3.5C55.15 2.7 53.6 2.25 52 2.25H35.3c-1.6 0-3.15.45-4.5 1.25z" fill="#00832d"/>
      <path d="M60 57H26.6L13.75 79.8c1.35.8 2.9 1.2 4.5 1.2H69.1c1.6 0 3.15-.45 4.5-1.25z" fill="#2684fc"/>
      <path d="M73.4 26.5l-13.3-23C58.8 2.7 57.25 2.25 55.65 2.25H52c1.6 0 3.15.45 4.5 1.25L69.35 26.5z" fill="#ffba00"/>
      <path d="M73.4 26.5L60.1 3.5l-.05-.05L56.5 3.5 43.65 25 60 57h25.1l.8-1.4-13.3-22.9z" fill="#ffba00"/>
    </svg>
  );
}

function DropboxIcon() {
  return (
    <svg viewBox="0 0 200 175" className="h-8 w-8" fill="#0061FF">
      <path d="M50 0L0 31.25 50 62.5 100 31.25 50 0zM150 0L100 31.25 150 62.5 200 31.25 150 0zM0 93.75L50 125l50-31.25L50 62.5 0 93.75zM150 62.5l-50 31.25 50 31.25 50-31.25L150 62.5zM50 137.5l50 31.25 50-31.25-50-31.25L50 137.5z"/>
    </svg>
  );
}

function SlackIcon() {
  return (
    <svg viewBox="0 0 54 54" className="h-8 w-8">
      <path d="M19.712.133a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386h5.376V5.52A5.381 5.381 0 0 0 19.712.133m0 14.365H5.376A5.381 5.381 0 0 0 0 19.884a5.381 5.381 0 0 0 5.376 5.387h14.336a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386" fill="#36C5F0"/>
      <path d="M53.76 19.884a5.381 5.381 0 0 0-5.376-5.386 5.381 5.381 0 0 0-5.376 5.386v5.387h5.376a5.381 5.381 0 0 0 5.376-5.387m-14.336 0V5.52A5.381 5.381 0 0 0 34.048.133a5.381 5.381 0 0 0-5.376 5.387v14.364a5.381 5.381 0 0 0 5.376 5.387 5.381 5.381 0 0 0 5.376-5.387" fill="#2EB67D"/>
      <path d="M34.048 54a5.381 5.381 0 0 0 5.376-5.387 5.381 5.381 0 0 0-5.376-5.386h-5.376v5.386A5.381 5.381 0 0 0 34.048 54m0-14.365h14.336a5.381 5.381 0 0 0 5.376-5.386 5.381 5.381 0 0 0-5.376-5.387H34.048a5.381 5.381 0 0 0-5.376 5.387 5.381 5.381 0 0 0 5.376 5.386" fill="#ECB22E"/>
      <path d="M0 34.249a5.381 5.381 0 0 0 5.376 5.386 5.381 5.381 0 0 0 5.376-5.386v-5.387H5.376A5.381 5.381 0 0 0 0 34.249m14.336 0v14.364A5.381 5.381 0 0 0 19.712 54a5.381 5.381 0 0 0 5.376-5.387V34.249a5.381 5.381 0 0 0-5.376-5.387 5.381 5.381 0 0 0-5.376 5.387" fill="#E01E5A"/>
    </svg>
  );
}

function GCalendarIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8">
      <rect x="5" y="8" width="38" height="36" rx="4" fill="white"/>
      <rect x="5" y="8" width="38" height="12" rx="4" fill="#1A73E8"/>
      <rect x="5" y="16" width="38" height="4" fill="#1A73E8"/>
      <text x="24" y="36" textAnchor="middle" fontSize="15" fontWeight="bold" fill="#1A73E8" fontFamily="Arial,sans-serif">24</text>
      <circle cx="15" cy="8" r="3" fill="#1558B0"/>
      <circle cx="33" cy="8" r="3" fill="#1558B0"/>
      <rect x="5" y="8" width="38" height="36" rx="4" fill="none" stroke="#DADCE0" strokeWidth="1.5"/>
    </svg>
  );
}

function GmailIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-8 w-8">
      <path d="M6 12h36v26H6z" fill="white"/>
      <path d="M6 12h36v2L24 28 6 14v-2z" fill="#EA4335"/>
      <path d="M6 14l18 14 18-14v24H6V14z" fill="white"/>
      <path d="M6 12v2l18 14 18-14v-2H6z" fill="#EA4335"/>
      <path d="M6 14v22h6V21L6 14z" fill="#C5221F"/>
      <path d="M42 14v22h-6V21l6-7z" fill="#C5221F"/>
      <path d="M12 21v15H6V14l6 7z" fill="#FBBC05"/>
      <path d="M36 21v15h6V14l-6 7z" fill="#34A853"/>
    </svg>
  );
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-foreground" fill="currentColor">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}

// ── Integrations data ──────────────────────────────────────────────────────────

const INTEGRATIONS = [
  { id: 'gdrive',    name: 'Google Drive',    description: 'Almacená y accedé a documentos empresariales desde cualquier lugar.',      icon: <GoogleDriveIcon />, on: true  },
  { id: 'dropbox',   name: 'Dropbox',         description: 'Manteń los archivos sincronizados y compartí reportes y facturas.',         icon: <DropboxIcon />,     on: true  },
  { id: 'slack',     name: 'Slack',           description: 'Permanecé conectado con notificaciones en tiempo real.',                    icon: <SlackIcon />,       on: true  },
  { id: 'gcalendar', name: 'Google Calendar', description: 'Sincronizá agendas, reuniones y eventos automáticamente en todos los dispositivos.', icon: <GCalendarIcon />,   on: true  },
  { id: 'gmail',     name: 'Gmail',           description: 'Recibí notificaciones, aprobaciones y actualizaciones en tu casilla.',     icon: <GmailIcon />,       on: true  },
  { id: 'github',    name: 'GitHub',          description: 'Almacená y accedé a repositorios con herramientas de colaboración.',       icon: <GithubIcon />,      on: true  },
];

const NOTIF_CHANNELS = ['Push', 'SMS', 'Email'] as const;
const NOTIF_TYPES    = ['Pagos', 'Transacciones', 'Verificación de email', 'OTP', 'Actividad', 'Cuenta'];

// ── Tab: Profile ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const queryClient = useQueryClient();
  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: usersApi.getMe });
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '' });
  const [ready, setReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState('');

  if (me && !ready) {
    setForm({ firstName: me.firstName, lastName: me.lastName, username: me.username ?? '' });
    setReady(true);
  }

  const mutation = useMutation({
    mutationFn: () =>
      usersApi.updateMe({ firstName: form.firstName, lastName: form.lastName, username: form.username.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] });
      setSuccess(true);
      setServerError('');
      setTimeout(() => setSuccess(false), 2500);
    },
    onError: (err: Error) => {
      setServerError(apiErrorMessage(err, 'Error al guardar'));
    },
  });

  const set = (f: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [f]: e.target.value }));

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground/60">Cargando...</div>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); setServerError(''); mutation.mutate(); }} className="space-y-4">
      {/* Avatar */}
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-4">Foto de perfil</p>
        <div className="flex items-center gap-5">
          <div className="h-20 w-20 shrink-0 rounded-xl border border-border bg-muted/30 flex items-center justify-center">
            <User size={30} className="text-muted-foreground/60" />
          </div>
          <div>
            <Button type="button" variant="outline" size="sm">
              <Camera size={14} />
              Subir imagen
            </Button>
            <p className="mt-1.5 text-xs text-muted-foreground/60">Formato JPG o PNG, máximo 5 MB.</p>
          </div>
        </div>
      </div>

      {/* Personal data */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={form.firstName} onChange={set('firstName')} required placeholder="Juan" />
          </div>
          <div className="space-y-1.5">
            <Label>Apellido <span className="text-destructive">*</span></Label>
            <Input value={form.lastName} onChange={set('lastName')} required placeholder="García" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Email <span className="text-destructive">*</span></Label>
            <Input value={me?.email ?? ''} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>Teléfono</Label>
            <Input placeholder="+595 981 000 000" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Nombre de usuario</Label>
          <div className="flex items-center rounded-3xl border border-transparent bg-input/50 px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 transition-[box-shadow,border-color]">
            <span className="select-none text-sm text-muted-foreground/60 mr-1">@</span>
            <input
              className="flex-1 h-9 text-sm text-foreground outline-none bg-transparent placeholder:text-muted-foreground/40"
              value={form.username}
              onChange={set('username')}
              placeholder="juan.garcia"
              pattern="[a-zA-Z0-9._]+"
              minLength={3}
              maxLength={30}
            />
          </div>
        </div>
      </div>

      {/* Address — stub */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-foreground">Detalles de dirección</p>
          <span className="rounded-full bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground/60">Próximamente</span>
        </div>
        <div className="space-y-4 opacity-40 pointer-events-none select-none">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Dirección línea 1</Label>
              <Input disabled placeholder="Av. Principal 123" />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección línea 2</Label>
              <Input disabled placeholder="Apto. 4B" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>País</Label>
              <Input disabled placeholder="Seleccionar" />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento</Label>
              <Input disabled placeholder="Seleccionar" />
            </div>
            <div className="space-y-1.5">
              <Label>Ciudad</Label>
              <Input disabled placeholder="Seleccionar" />
            </div>
            <div className="space-y-1.5">
              <Label>Código postal</Label>
              <Input disabled placeholder="1001" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        {serverError && <span className="text-sm text-destructive">{serverError}</span>}
        {success    && <span className="text-sm text-emerald-500">Cambios guardados</span>}
        <Button type="button" variant="outline">Cancelar</Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </form>
  );
}

// ── Tab: Security ──────────────────────────────────────────────────────────────

function SecurityTab() {
  const { mustChangePassword, changePassword } = useAuth();
  const [pwOpen,  setPwOpen]  = useState(!!mustChangePassword);
  const [form,    setForm]    = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwOk,    setPwOk]    = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      changePassword(form.current, form.next),
    onSuccess: () => {
      setForm({ current: '', next: '', confirm: '' });
      setPwOk(true);
      setPwError('');
      setTimeout(() => setPwOk(false), 2500);
      setPwOpen(false);
    },
    onError: (err: Error) => {
      setPwError(apiErrorMessage(err, 'Error al cambiar contraseña'));
    },
  });

  function handlePw(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (form.next !== form.confirm) { setPwError('Las contraseñas no coinciden'); return; }
    if (form.next.length < 8)       { setPwError('Mínimo 8 caracteres');          return; }
    mutation.mutate();
  }

  const row = 'flex items-center justify-between py-5 border-b border-border last:border-0';

  return (
    <div className="space-y-4">
      {mustChangePassword && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-4 py-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-300">Tu cuenta tiene una contraseña temporal. Cambiala antes de continuar.</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card px-6">
        {/* Password */}
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-foreground">Cambiar contraseña</p>
            <p className="text-xs text-muted-foreground mt-0.5">Recibí un código de verificación al cambiar tu contraseña.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setPwOpen((v) => !v)}>
            {pwOpen ? 'Cerrar' : 'Cambiar'}
          </Button>
        </div>

        {pwOpen && (
          <form onSubmit={handlePw} className="pb-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Contraseña actual</Label>
                <Input type="password" value={form.current} onChange={(e) => setForm((f) => ({ ...f, current: e.target.value }))} required autoComplete="current-password" />
              </div>
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <Input type="password" value={form.next} onChange={(e) => setForm((f) => ({ ...f, next: e.target.value }))} required minLength={8} autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar</Label>
                <Input type="password" value={form.confirm} onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))} required autoComplete="new-password" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={mutation.isPending} size="sm">
                {mutation.isPending ? 'Guardando...' : 'Actualizar contraseña'}
              </Button>
              {pwError && <span className="text-xs text-destructive">{pwError}</span>}
              {pwOk    && <span className="text-xs text-emerald-500">Contraseña actualizada</span>}
            </div>
          </form>
        )}

        {/* 2FA */}
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-foreground">Verificación en dos pasos</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agregá una capa adicional de seguridad a tu cuenta al activarla.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm">Cancelar</Button>
            <Button type="button" size="sm">Configurar</Button>
          </div>
        </div>

        {/* Phone */}
        <div className={row}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Verificación por teléfono</p>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500">
                <CheckCircle2 size={10} /> Número verificado · +595 981 000 000
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Verificá tu número de teléfono para mayor seguridad.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm">Eliminar</Button>
            <Button type="button" variant="outline" size="sm">Cambiar</Button>
          </div>
        </div>

        {/* Email */}
        <div className={row}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Verificación por email</p>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-500">
                <CheckCircle2 size={10} /> Email verificado
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Verificá tu email para proteger tu cuenta.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm">Eliminar</Button>
            <Button type="button" variant="outline" size="sm">Cambiar</Button>
          </div>
        </div>
      </div>

      {/* Danger */}
      <div className="rounded-xl border border-border bg-card px-6">
        <div className={row}>
          <div>
            <p className="text-sm font-medium text-foreground">Desactivar cuenta</p>
            <p className="text-xs text-muted-foreground mt-0.5">Tu cuenta quedará suspendida. Podés reactivarla iniciando sesión.</p>
          </div>
          <Button type="button" variant="outline" size="sm">Desactivar</Button>
        </div>
        <div className="flex items-center justify-between py-5">
          <div>
            <p className="text-sm font-medium text-destructive">Eliminar cuenta</p>
            <p className="text-xs text-muted-foreground mt-0.5">Elimina permanentemente la cuenta y todos los datos asociados.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10">
            Eliminar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Notifications ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const [globals, setGlobals] = useState({ push: true, desktop: true, email: true, sms: true });
  const [matrix,  setMatrix]  = useState<Record<string, Record<string, boolean>>>(() =>
    Object.fromEntries(NOTIF_TYPES.map((t) => [t, { Push: true, SMS: true, Email: true }])),
  );

  const toggleGlobal = (k: keyof typeof globals) => setGlobals((g) => ({ ...g, [k]: !g[k] }));
  const toggleCell   = (type: string, ch: string) =>
    setMatrix((m) => ({ ...m, [type]: { ...m[type], [ch]: !m[type][ch] } }));

  const GLOBAL_ROWS: { key: keyof typeof globals; label: string }[] = [
    { key: 'push',    label: 'Notificaciones push móvil' },
    { key: 'desktop', label: 'Notificaciones de escritorio' },
    { key: 'email',   label: 'Notificaciones por email' },
    { key: 'sms',     label: 'Notificaciones por SMS' },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {GLOBAL_ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between px-6 py-4">
            <span className="text-sm text-foreground">{label}</span>
            <Toggle checked={globals[key]} onChange={() => toggleGlobal(key)} />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-6 py-3 text-left text-xs font-semibold text-foreground">Notificación general</th>
              {NOTIF_CHANNELS.map((ch) => (
                <th key={ch} className="px-4 py-3 text-center text-xs font-semibold text-foreground w-24">{ch}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {NOTIF_TYPES.map((type) => (
              <tr key={type} className="hover:bg-muted/20 transition-colors">
                <td className="px-6 py-3.5 text-sm text-muted-foreground">{type}</td>
                {NOTIF_CHANNELS.map((ch) => (
                  <td key={ch} className="px-4 py-3.5 text-center">
                    <button
                      type="button"
                      onClick={() => toggleCell(type, ch)}
                      className="inline-flex items-center justify-center transition-colors"
                    >
                      {matrix[type][ch]
                        ? <CheckCircle2 size={18} className="text-primary fill-primary/20" />
                        : <span className="h-4 w-4 rounded border border-border block" />
                      }
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline">Cancelar</Button>
        <Button type="button">Guardar cambios</Button>
      </div>
    </div>
  );
}

// ── Tab: Integrations ──────────────────────────────────────────────────────────

function CreditBureauIntegrationCard() {
  const queryClient = useQueryClient();
  const { data: cfg } = useQuery({ queryKey: ['credit-bureau-config'], queryFn: creditBureauApi.getConfig });

  const mutation = useMutation({
    mutationFn: (dto: { isEnabled: boolean; checkFrequency: CreditBureauCheckFrequency }) =>
      creditBureauApi.updateConfig(dto),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['credit-bureau-config'] }),
  });

  const isEnabled = cfg?.isEnabled ?? false;
  const frequency = cfg?.checkFrequency ?? 'EVERY_REQUEST';

  return (
    <div className="rounded-xl border border-border bg-card px-6 py-5">
      <div className="flex items-center gap-4">
        <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-lg bg-muted/30">
          <ShieldCheck size={18} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Buró de crédito</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Verificación de morosidad de clientes (registro manual — integración con proveedores como Equifax preparada para el futuro).
          </p>
        </div>
        <Toggle checked={isEnabled} onChange={(v) => mutation.mutate({ isEnabled: v, checkFrequency: frequency })} />
      </div>

      {isEnabled && (
        <div className="mt-4 pl-14">
          <p className="mb-2 text-xs text-muted-foreground">¿Cuándo pedir la verificación?</p>
          <div className="flex gap-2">
            {(['FIRST_PURCHASE_ONLY', 'EVERY_REQUEST'] as const).map((freq) => (
              <button
                key={freq}
                type="button"
                onClick={() => mutation.mutate({ isEnabled: true, checkFrequency: freq })}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  frequency === freq
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-ring/50',
                )}
              >
                {freq === 'FIRST_PURCHASE_ONLY' ? 'Solo primera compra a crédito' : 'Cada solicitud de crédito'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationsTab() {
  const { hasModule } = useActiveModules();
  const canUpdateTenant = usePermission('tenants:update');
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.on])),
  );

  return (
    <div className="space-y-4">
      {/* El buró es parte de la evaluación de crédito: sin Financiamiento
          activo el backend responde 403. */}
      {hasModule('finance') && (
        <fieldset disabled={!canUpdateTenant} className="m-0 min-w-0 border-0 p-0">
          <CreditBureauIntegrationCard />
        </fieldset>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {INTEGRATIONS.map((int) => (
          <div key={int.id} className="flex items-center gap-4 px-6 py-5">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center">{int.icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{int.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{int.description}</p>
            </div>
            <Toggle checked={enabled[int.id]} onChange={(v) => setEnabled((e) => ({ ...e, [int.id]: v }))} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Certificates ─────────────────────────────────────────────────────────

function CertDropZone({
  accept, onFile, label, hint, loaded, filename, onRemove, isRemoving,
}: {
  accept: string;
  onFile: (f: File) => void;
  label: string;
  hint: string;
  loaded: boolean;
  filename: string | null;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (loaded && filename) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <FileKey size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">{filename}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Certificado cargado</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          className="border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <Trash2 size={12} />
          {isRemoving ? 'Eliminando...' : 'Eliminar'}
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 border-dashed transition-colors cursor-pointer px-6 py-8 text-center',
        dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
      />
      <Upload size={22} className="mx-auto mb-2.5 text-muted-foreground/60" />
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground/60">{hint}</p>
    </div>
  );
}

function CertificatesTab() {
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const { data: cfg, isLoading } = useQuery({ queryKey: ['sifen-config'], queryFn: sifenApi.getConfig });
  const inv = () => void queryClient.invalidateQueries({ queryKey: ['sifen-config'] });

  const uploadMut   = useMutation({ mutationFn: ({ file, pass }: { file: File; pass: string }) => sifenApi.uploadCertificate(file, pass || undefined), onSuccess: () => { inv(); setPendingFile(null); setPassword(''); } });
  const removeMut   = useMutation({ mutationFn: sifenApi.removeCertificate,   onSuccess: inv });
  const uploadCaMut = useMutation({ mutationFn: (f: File) => sifenApi.uploadCaCertificate(f), onSuccess: inv });
  const removeCaMut = useMutation({ mutationFn: sifenApi.removeCaCertificate, onSuccess: inv });

  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;

  const certOk = cfg?.certValidUntil ? new Date(cfg.certValidUntil) > new Date() : cfg?.isConfigured ?? false;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Certificado de firma digital</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Certificado .p12 o .pfx usado para firmar documentos del sistema: facturas electrónicas,
              contratos de crédito, notas de entrega, etc.
            </p>
          </div>
          {cfg?.isConfigured && (
            <span className={cn('ml-4 shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              certOk ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-100 text-red-700',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', certOk ? 'bg-emerald-500' : 'bg-red-500')} />
              {certOk ? 'Vigente' : 'Vencido'}
            </span>
          )}
        </div>

        <div className="mt-4">
          {cfg?.certFilename && !pendingFile ? (
            <CertDropZone
              accept=".p12,.pfx,.cer,.crt"
              onFile={setPendingFile}
              label="Reemplazar certificado"
              hint="Arrastrá o hacé clic para seleccionar"
              loaded filename={cfg.certFilename}
              onRemove={() => removeMut.mutate()}
              isRemoving={removeMut.isPending}
            />
          ) : pendingFile ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <FileKey size={16} className="text-primary" />
                  <span className="text-sm text-foreground">{pendingFile.name}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPendingFile(null)}>
                  <X size={15} />
                </Button>
              </div>
              <div className="space-y-1.5">
                <Label>
                  Contraseña del certificado
                  <span className="ml-1 text-muted-foreground/60 font-normal">(dejar vacío si no tiene)</span>
                </Label>
                <Input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Contraseña opcional"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button type="button" onClick={() => setShowPass((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground">
                  {showPass ? 'Ocultar' : 'Mostrar'} contraseña
                </button>
              </div>
              {uploadMut.isError && (
                <p className="text-xs text-destructive">
                  {apiErrorMessage(uploadMut.error, 'Error al cargar el certificado')}
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => uploadMut.mutate({ file: pendingFile, pass: password })}
                  disabled={uploadMut.isPending}
                >
                  <Upload size={13} />
                  {uploadMut.isPending ? 'Guardando...' : 'Guardar certificado'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPendingFile(null)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <CertDropZone
              accept=".p12,.pfx,.cer,.crt"
              onFile={setPendingFile}
              label="Arrastrá el certificado aquí o hacé clic para seleccionar"
              hint="Formatos aceptados: .p12 · .pfx · .cer · .crt"
              loaded={false} filename={null}
              onRemove={() => {}} isRemoving={false}
            />
          )}
        </div>

        {cfg?.certValidFrom && (
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground/60">Válido desde</p>
              <p className="mt-0.5 font-medium text-foreground">
                {new Date(cfg.certValidFrom).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </p>
            </div>
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <p className="text-muted-foreground/60">Vence el</p>
              <p className={cn('mt-0.5 font-medium', certOk ? 'text-foreground' : 'text-destructive')}>
                {new Date(cfg.certValidUntil!).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
              </p>
            </div>
            {cfg.certSubject && (
              <div className="col-span-2 rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-muted-foreground/60">Titular</p>
                <p className="mt-0.5 font-medium text-foreground">{cfg.certSubject}</p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Certificado CA raíz</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Opcional. Certificado de la autoridad certificante usada para validar respuestas de
          servicios externos (SET Paraguay, u otros). Solo necesario con proxies TLS o sin acceso a internet.
        </p>
        <CertDropZone
          accept=".cer,.crt,.pem"
          onFile={(f) => uploadCaMut.mutate(f)}
          label="Arrastrá el certificado CA aquí o hacé clic"
          hint="Formatos aceptados: .cer · .crt · .pem"
          loaded={!!cfg?.caCertFilename}
          filename={cfg?.caCertFilename ?? null}
          onRemove={() => removeCaMut.mutate()}
          isRemoving={removeCaMut.isPending}
        />
      </section>
    </div>
  );
}

// ── Tab: Billing (SIFEN) ───────────────────────────────────────────────────────

function BillingTab({ onGoToCerts }: { onGoToCerts: () => void }) {
  const queryClient = useQueryClient();
  const { data: cfg, isLoading } = useQuery({ queryKey: ['sifen-config'], queryFn: sifenApi.getConfig });
  const inv = () => void queryClient.invalidateQueries({ queryKey: ['sifen-config'] });

  const envMutation = useMutation({ mutationFn: (e: SifenEnvironment) => sifenApi.updateSettings(e), onSuccess: inv });
  const testMut = useMutation({ mutationFn: sifenApi.testConnection, onSuccess: inv });

  if (isLoading) return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;

  const env    = cfg?.environment ?? 'TESTING';
  const certOk = cfg?.certValidUntil ? new Date(cfg.certValidUntil) > new Date() : cfg?.isConfigured ?? false;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Ambiente SIFEN</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Usá el ambiente de pruebas durante la homologación con el SET.
          Cambiá a Producción solo cuando el timbrado esté habilitado.
        </p>
        <div className="flex gap-3">
          {(['TESTING', 'PRODUCTION'] as const).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => envMutation.mutate(e)}
              disabled={envMutation.isPending}
              className={cn(
                'flex-1 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all',
                env === e
                  ? e === 'PRODUCTION'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/50',
              )}
            >
              {e === 'TESTING' ? 'Pruebas (Test)' : 'Producción'}
            </button>
          ))}
        </div>
        {env === 'PRODUCTION' && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5">
            <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              En modo Producción los documentos emitidos tienen validez fiscal ante el SET.
              Asegurate de tener el timbrado vigente configurado en los datos de empresa.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Certificado de firma</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          El certificado digital usado para firmar los documentos electrónicos emitidos.
          Se administra desde la sección{' '}
          <button type="button" onClick={onGoToCerts} className="font-medium text-primary hover:underline">
            Certificados
          </button>
          .
        </p>

        {cfg?.isConfigured ? (
          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <FileKey size={18} className={certOk ? 'text-emerald-600' : 'text-destructive'} />
              <div>
                <p className="text-sm font-medium text-foreground">{cfg.certFilename}</p>
                {cfg.certValidUntil && (
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Vence: {new Date(cfg.certValidUntil).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}
                  </p>
                )}
              </div>
            </div>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
              certOk ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-100 text-red-700',
            )}>
              <span className={cn('h-1.5 w-1.5 rounded-full', certOk ? 'bg-emerald-500' : 'bg-red-500')} />
              {certOk ? 'Vigente' : 'Vencido'}
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <FileKey size={18} className="text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">No hay certificado configurado</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onGoToCerts}>
              Configurar
              <ArrowRight size={12} />
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Prueba de conexión</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Verificá que el certificado y los datos fiscales estén correctos antes de emitir documentos con validez ante el SET.
        </p>
        <div className="flex items-center gap-4">
          <Button
            type="button"
            onClick={() => testMut.mutate()}
            disabled={!cfg?.isConfigured || testMut.isPending}
          >
            <RefreshCw size={14} className={testMut.isPending ? 'animate-spin' : ''} />
            {testMut.isPending ? 'Probando...' : 'Probar conexión'}
          </Button>
          {testMut.data && (
            <div className={cn('flex items-center gap-2 text-sm', testMut.data.ok ? 'text-emerald-600' : 'text-destructive')}>
              {testMut.data.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
              {testMut.data.message}
            </div>
          )}
        </div>
        {cfg?.lastTestedAt && (
          <p className="mt-3 text-xs text-muted-foreground/60">
            Última prueba:{' '}
            {new Date(cfg.lastTestedAt).toLocaleString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            {' — '}
            <span className={cfg.lastTestOk ? 'text-emerald-600' : 'text-destructive'}>
              {cfg.lastTestOk ? 'Exitosa' : 'Fallida'}
            </span>
          </p>
        )}
      </section>
    </div>
  );
}

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'profile',       label: 'Perfil',        icon: <User     size={14} /> },
  { id: 'security',      label: 'Seguridad',      icon: <Shield   size={14} /> },
  { id: 'notifications', label: 'Notificaciones', icon: <Bell     size={14} /> },
  { id: 'integrations',  label: 'Integraciones',  icon: <Puzzle   size={14} /> },
  { id: 'certificates',  label: 'Certificados',   icon: <KeyRound size={14} /> },
  { id: 'billing',       label: 'Facturación',    icon: <Receipt  size={14} /> },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  // SIFEN (certificados y facturación electrónica): verlo requiere sifen:read
  // y modificarlo sifen:manage; sin manage los controles quedan deshabilitados.
  const canManageSifen = usePermission('sifen:manage');
  const canReadSifen = usePermission('sifen:read') || canManageSifen;
  const visibleTabs = TABS.filter(
    (t) => (t.id !== 'certificates' && t.id !== 'billing') || canReadSifen,
  );

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administrá y controlá todas las configuraciones de la plataforma desde un panel centralizado.
        </p>
      </div>

      <div className="flex border-b border-border mb-6">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-[14px] py-[10px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <span className={activeTab === tab.id ? 'text-primary' : ''}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile'       && <ProfileTab />}
      {activeTab === 'security'      && <SecurityTab />}
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'integrations'  && <IntegrationsTab />}
      {activeTab === 'certificates' && canReadSifen && (
        <fieldset disabled={!canManageSifen} className="m-0 min-w-0 border-0 p-0">
          <CertificatesTab />
        </fieldset>
      )}
      {activeTab === 'billing' && canReadSifen && (
        <fieldset disabled={!canManageSifen} className="m-0 min-w-0 border-0 p-0">
          <BillingTab onGoToCerts={() => setActiveTab('certificates')} />
        </fieldset>
      )}
    </div>
  );
}
