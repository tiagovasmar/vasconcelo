"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";
import { cartActions } from "@/features/cart/store";
import { useAccount } from "./account-provider";

const input = "h-12 w-full border border-ink/40 bg-white px-3 text-sm aria-[invalid=true]:border-vermilion aria-[invalid=true]:bg-vermilion/5";
const labelCls = "mb-1 block text-[.7rem] font-bold uppercase tracking-[.14em] text-ink/70";
const button = "min-h-12 w-full bg-ink px-6 font-bold text-paper hover:bg-emerald disabled:cursor-not-allowed disabled:opacity-50";

export const MIN_PASSWORD = 10;
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Err = { code?: string; status?: number; message?: string } | null | undefined;
/** Mensajes en español para los errores de la librería (sin revelar si un correo existe). */
export function authMessage(error: Err): string {
  if (!error) return "No pudimos completar la acción. Intentá de nuevo.";
  if (error.status === 503) return "Por ahora no se pueden enviar correos en este entorno: esta acción no está disponible.";
  if (error.status === 429) return "Hiciste demasiados intentos seguidos. Esperá un minuto e intentá de nuevo.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Correo o contraseña incorrectos.";
    case "EMAIL_NOT_VERIFIED":
      return "Tu correo todavía no está confirmado.";
    case "PASSWORD_TOO_SHORT":
      return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
    case "PASSWORD_TOO_LONG":
      return "La contraseña es demasiado larga.";
    case "INVALID_PASSWORD":
      return "La contraseña actual no es correcta.";
    case "INVALID_TOKEN":
      return "El enlace no es válido o ya venció. Pedí uno nuevo.";
    default:
      if (error.status === 403) return "Tu correo todavía no está confirmado.";
      if (error.status === 401) return "Correo o contraseña incorrectos.";
      return "No pudimos completar la acción. Intentá de nuevo.";
  }
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink/60">{hint}</p>}
      {error && <p id={`err-${id}`} role="alert" className="mt-1 text-sm font-semibold text-vermilion">{error}</p>}
    </div>
  );
}

/** Aviso cuando el entorno no puede enviar correos: no se ofrece la acción (nunca se simula un envío). */
export function MailUnavailable({ what }: { what: string }) {
  return (
    <div role="note" className="border-l-4 border-vermilion bg-vermilion/10 p-4 text-sm" data-testid="correo-no-disponible">
      <p className="text-base font-bold">Por ahora no está disponible.</p>
      <p className="mt-2">Este entorno todavía no puede enviar correos, así que no se puede {what}. Podés <Link href="/sellados" className="font-semibold underline">comprar como invitado</Link> sin cuenta.</p>
    </div>
  );
}

export function LoginForm({ next, notice }: { next?: string; notice?: string }) {
  const router = useRouter();
  const { refresh } = useAccount();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!emailRe.test(email.trim())) er.email = "Ingresá un correo válido.";
    if (!password) er.password = "Ingresá tu contraseña.";
    setErrors(er);
    setFormError("");
    setUnverified(false);
    if (Object.keys(er).length) return;
    setBusy(true);
    const { error } = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      if (error.code === "EMAIL_NOT_VERIFIED" || error.status === 403) setUnverified(true);
      setFormError(authMessage(error));
      return;
    }
    await refresh();
    router.push(safeNext(next));
    router.refresh();
  }

  async function resend() {
    const { error } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: "/cuenta/verificado" });
    if (error) return setFormError(authMessage(error)); // no se afirma un reenvío que no ocurrió
    setResent(true);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4" aria-describedby={formError ? "login-error" : undefined}>
      {notice && <p role="note" className="border-l-4 border-emerald bg-emerald/10 p-3 text-sm">{notice}</p>}
      <Field id="email" label="Correo electrónico" error={errors.email}>
        <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "err-email" : undefined} className={input} />
      </Field>
      <Field id="password" label="Contraseña" error={errors.password}>
        <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "err-password" : undefined} className={input} />
      </Field>
      {formError && (
        <div id="login-error" role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm">
          <p className="font-semibold">{formError}</p>
          {unverified && (
            <p className="mt-2">
              Te enviamos un correo para confirmarlo. {resent ? <b>Reenviamos el correo.</b> : <button type="button" onClick={resend} className="font-bold underline">Reenviar correo de confirmación</button>}
            </p>
          )}
        </div>
      )}
      <button type="submit" disabled={busy} className={button}>{busy ? "Ingresando…" : "Ingresar"}</button>
      <p className="text-sm"><Link href="/cuenta/recuperar" className="font-semibold underline">Olvidé mi contraseña</Link></p>
    </form>
  );
}

export function RegisterForm({ devMail, next }: { devMail: boolean; next?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (name.trim().length < 2) er.name = "Ingresá tu nombre.";
    if (!emailRe.test(email.trim())) er.email = "Ingresá un correo válido.";
    if (password.length < MIN_PASSWORD) er.password = `Usá al menos ${MIN_PASSWORD} caracteres.`;
    if (confirm !== password) er.confirm = "Las contraseñas no coinciden.";
    setErrors(er);
    setFormError("");
    if (Object.keys(er).length) return;
    setBusy(true);
    const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: `/cuenta/verificado${next ? `?next=${encodeURIComponent(next)}` : ""}` });
    setBusy(false);
    if (error) {
      setFormError(authMessage(error));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="registro-ok">
        <p className="text-base font-bold">Revisá tu correo para confirmar la cuenta.</p>
        <p className="mt-2">Si el correo es válido, te enviamos un enlace de confirmación (vale 24 horas). Todavía no iniciaste sesión: primero confirmá tu correo.</p>
        {devMail && <p className="mt-2 text-xs text-ink/70">Entorno de desarrollo: el correo no sale a internet, se guarda en la carpeta local <code>.local/mail/</code> (comando <code>npm run mail:last</code>).</p>}
        <p className="mt-3"><Link href={next ? `/cuenta/ingresar?next=${encodeURIComponent(next)}` : "/cuenta/ingresar"} className="font-semibold underline">Ir a ingresar</Link></p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="name" label="Nombre" error={errors.name}>
        <input id="name" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "err-name" : undefined} className={input} />
      </Field>
      <Field id="email" label="Correo electrónico" error={errors.email}>
        <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "err-email" : undefined} className={input} />
      </Field>
      <Field id="password" label="Contraseña" error={errors.password} hint={`Mínimo ${MIN_PASSWORD} caracteres.`}>
        <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "err-password" : undefined} className={input} />
      </Field>
      <Field id="confirm" label="Repetí la contraseña" error={errors.confirm}>
        <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? "err-confirm" : undefined} className={input} />
      </Field>
      {formError && <p role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">{formError}</p>}
      <button type="submit" disabled={busy} className={button}>{busy ? "Creando cuenta…" : "Crear cuenta"}</button>
      <p className="text-xs text-ink/65">Solo guardamos tu nombre y tu correo. No pedimos direcciones completas ni datos de pago.</p>
    </form>
  );
}

export function ForgotForm({ devMail }: { devMail: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!emailRe.test(email.trim())) return setError("Ingresá un correo válido.");
    setBusy(true);
    const { error: err } = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/cuenta/restablecer" });
    setBusy(false);
    if (err?.status === 429) return setError(authMessage(err));
    setDone(true); // respuesta idéntica exista o no la cuenta
  }

  if (done) {
    return (
      <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="recuperar-ok">
        <p className="text-base font-bold">Revisá tu correo.</p>
        <p className="mt-2">Si hay una cuenta con ese correo, te enviamos un enlace para elegir una contraseña nueva (vale 1 hora y se usa una sola vez).</p>
        {devMail && <p className="mt-2 text-xs text-ink/70">Entorno de desarrollo: el correo se guarda en <code>.local/mail/</code> (comando <code>npm run mail:last</code>), no sale a internet.</p>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="email" label="Correo electrónico" error={error}>
        <input id="email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "err-email" : undefined} className={input} />
      </Field>
      <button type="submit" disabled={busy} className={button}>{busy ? "Enviando…" : "Enviarme el enlace"}</button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (password.length < MIN_PASSWORD) er.password = `Usá al menos ${MIN_PASSWORD} caracteres.`;
    if (confirm !== password) er.confirm = "Las contraseñas no coinciden.";
    setErrors(er);
    setFormError("");
    if (Object.keys(er).length) return;
    setBusy(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setBusy(false);
    if (error) return setFormError(authMessage(error));
    setDone(true);
  }

  if (done) {
    return (
      <div role="status" className="border-l-4 border-emerald bg-emerald/10 p-4 text-sm" data-testid="reset-ok">
        <p className="text-base font-bold">Listo: cambiaste tu contraseña.</p>
        <p className="mt-2">Por seguridad cerramos las demás sesiones abiertas. Ya podés ingresar con la nueva.</p>
        <p className="mt-3"><Link href="/cuenta/ingresar" className="font-semibold underline">Ingresar</Link></p>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="password" label="Contraseña nueva" error={errors.password} hint={`Mínimo ${MIN_PASSWORD} caracteres.`}>
        <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "err-password" : undefined} className={input} />
      </Field>
      <Field id="confirm" label="Repetí la contraseña" error={errors.confirm}>
        <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? "err-confirm" : undefined} className={input} />
      </Field>
      {formError && (
        <p role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">
          {formError} <Link href="/cuenta/recuperar" className="underline">Pedir un enlace nuevo</Link>
        </p>
      )}
      <button type="submit" disabled={busy} className={button}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
    </form>
  );
}

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const { refresh } = useAccount();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        cartActions.clearPersonal(); // el carrito se conserva; se borran nombre y datos de entrega del formulario
        await refresh();
        router.push("/cuenta/ingresar?salio=1");
        router.refresh();
      }}
      className={className || "min-h-12 border border-ink px-6 font-bold hover:bg-gold disabled:opacity-50"}
    >
      {busy ? "Cerrando…" : "Cerrar sesión"}
    </button>
  );
}

export function ProfileForm({ name: initial, email, verified }: { name: string; email: string; verified: boolean }) {
  const router = useRouter();
  const { refresh } = useAccount();
  const [name, setName] = useState(initial);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (name.trim().length < 2) return setErr("Ingresá tu nombre.");
    setBusy(true);
    const { error } = await authClient.updateUser({ name: name.trim() });
    setBusy(false);
    if (error) return setErr(authMessage(error));
    await refresh();
    router.refresh();
    setMsg("Guardamos tu nombre.");
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="name" label="Nombre" error={err}>
        <input id="name" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(err)} aria-describedby={err ? "err-name" : undefined} className={input} />
      </Field>
      <div>
        <p className={labelCls}>Correo electrónico</p>
        <p className="flex min-h-12 flex-wrap items-center gap-x-3 break-all border border-ink/20 bg-paper-2 px-3 py-2 text-sm">{email} <span className="text-xs font-bold text-emerald">{verified ? "Confirmado" : "Sin confirmar"}</span></p>
        <p className="mt-1 text-xs text-ink/60">Por ahora el correo no se puede cambiar desde la web.</p>
      </div>
      <button type="submit" disabled={busy} className={button}>{busy ? "Guardando…" : "Guardar cambios"}</button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-semibold text-emerald">{msg}</p>
    </form>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!current) er.current = "Ingresá tu contraseña actual.";
    if (next.length < MIN_PASSWORD) er.next = `Usá al menos ${MIN_PASSWORD} caracteres.`;
    if (confirm !== next) er.confirm = "Las contraseñas no coinciden.";
    setErrors(er);
    setFormError("");
    setMsg("");
    if (Object.keys(er).length) return;
    setBusy(true);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (error) return setFormError(authMessage(error));
    setCurrent("");
    setNext("");
    setConfirm("");
    setMsg("Cambiaste tu contraseña y cerramos las otras sesiones.");
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field id="current" label="Contraseña actual" error={errors.current}>
        <input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} aria-invalid={Boolean(errors.current)} aria-describedby={errors.current ? "err-current" : undefined} className={input} />
      </Field>
      <Field id="new" label="Contraseña nueva" error={errors.next} hint={`Mínimo ${MIN_PASSWORD} caracteres.`}>
        <input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-invalid={Boolean(errors.next)} aria-describedby={errors.next ? "err-new" : undefined} className={input} />
      </Field>
      <Field id="confirm2" label="Repetí la contraseña nueva" error={errors.confirm}>
        <input id="confirm2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={Boolean(errors.confirm)} aria-describedby={errors.confirm ? "err-confirm2" : undefined} className={input} />
      </Field>
      {formError && <p role="alert" className="border-l-4 border-vermilion bg-vermilion/10 p-3 text-sm font-semibold">{formError}</p>}
      <button type="submit" disabled={busy} className={button}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
      <p role="status" aria-live="polite" className="min-h-5 text-sm font-semibold text-emerald">{msg}</p>
    </form>
  );
}

export function ClaimGuestCard({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState("");
  if (count === 0 && result === null) return null;
  async function claim() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/inquiries/claim", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { claimed: number };
      setResult(data.claimed);
      router.refresh();
    } catch {
      setError("No pudimos agregarlas. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border border-ink/30 bg-gold/30 p-4 text-sm" data-testid="reclamar">
      {result === null ? (
        <>
          <p className="font-bold">Tenés {count} {count === 1 ? "consulta" : "consultas"} de invitado en este navegador.</p>
          <p className="mt-1">Podés agregarlas a tu cuenta para verlas en «Mis consultas». Solo se pueden agregar las que preparaste desde este navegador.</p>
          <button type="button" onClick={claim} disabled={busy} className="mt-3 min-h-11 bg-ink px-5 font-bold text-paper hover:bg-emerald disabled:opacity-50">{busy ? "Agregando…" : "Agregar a mi cuenta"}</button>
          {error && <p role="alert" className="mt-2 font-semibold text-vermilion">{error}</p>}
        </>
      ) : (
        <p role="status" className="font-bold">Agregamos {result} {result === 1 ? "consulta" : "consultas"} a tu cuenta.</p>
      )}
    </div>
  );
}

/** Mensajes del regreso de Google (la librería agrega ?error=… a la dirección de error). Nunca revelan si un correo ya estaba registrado. */
export function googleErrorMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (code === "access_denied") return "Cancelaste el ingreso con Google. Podés intentarlo de nuevo o ingresar con tu correo.";
  if (/account_not_linked|unable_to_link|email_doesn't_match|email_does_not_match/i.test(code)) return "No pudimos unir Google a una cuenta existente. Ingresá con tu correo y contraseña (si todavía no confirmaste ese correo, confirmalo o recuperá el acceso) y probá de nuevo.";
  return "No pudimos completar el ingreso con Google. Intentá de nuevo o ingresá con tu correo.";
}

/** «Continuar con Google»: sirve para ingresar y para crear la cuenta (si no existe se crea con el correo verificado por Google). Solo se muestra si el servidor tiene las credenciales configuradas. */
export function GoogleSection({ next, back }: { next?: string; back: "ingresar" | "registro" }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: safeNext(next), errorCallbackURL: `/cuenta/${back === "registro" ? "registro" : "ingresar"}${next ? `?next=${encodeURIComponent(next)}` : ""}` });
    if (error) {
      setBusy(false);
      setErr(authMessage(error));
    }
  }
  return (
    <div className="mb-5" data-testid="google-seccion">
      <button type="button" onClick={go} disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-3 border border-ink bg-white px-6 font-bold hover:bg-paper-2 disabled:opacity-50" data-testid="continuar-google">
        <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full border border-ink/40 text-sm font-extrabold">G</span>
        {busy ? "Abriendo Google…" : "Continuar con Google"}
      </button>
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-vermilion">{err}</p>}
      <p className="mt-3 flex items-center gap-3 text-xs text-ink/60" aria-hidden="true"><span className="h-px flex-1 bg-ink/20" />o con tu correo<span className="h-px flex-1 bg-ink/20" /></p>
    </div>
  );
}
