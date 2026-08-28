"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle, ArrowRight, BriefcaseBusiness, Building2, CalendarDays, Check,
  Bell, CheckCheck, CheckCircle2, ChevronRight, Clock3, CornerUpLeft, Eye, EyeOff, Hash, Home, ImagePlus, Loader2,
  History, LockKeyhole, LogOut, Mail, Menu, MessageCircle, Plus, Send, Settings, ShieldCheck,
  Sparkles, Pencil, RefreshCw, Trash2, UserPlus, Users, Video, Wifi, WifiOff, X,
} from "lucide-react";
import { Component, FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppNotification, AuditEvent, AuthUser, Channel, ChatMessage, MeetFlowApi, Meeting, TeamInvitation, TeamMember, TeamStatus, UserRole, meetFlowApi,
} from "./lib/meetflow-api";
import {
  PRIVACY_VERSION, TERMS_VERSION, LegalConsent, LegalDocumentPage, legalDocumentFromHash,
} from "./legal-documents";
import AiAssistant from "./ai-assistant";

const SESSION_KEY = "meetflow.local.session";
const MAX_STATUS_UPLOAD_BYTES = 3_000_000;
const MAX_STATUS_SOURCE_IMAGE_BYTES = 20_000_000;
type Session = { token: string; user: AuthUser; remember: boolean };
type View = "inicio" | "agenda" | "chat" | "status" | "equipe" | "configuracoes";
type Modal = "meeting" | "channel" | "status" | "member" | "delete" | null;
type RealtimeState = "checking" | "live" | "fallback";

const nav: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "inicio", label: "Visão geral", icon: Home },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "chat", label: "Chat da equipe", icon: MessageCircle },
  { id: "status", label: "Status", icon: Video },
  { id: "equipe", label: "Colaboradores", icon: Users },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function roleName(role: UserRole) {
  if (role === "OWNER") return "Proprietário";
  if (role === "ADMIN") return "Administrador";
  if (role === "MANAGER") return "Gestor";
  return "Colaborador";
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date)
    : "Data indisponível";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date)
    : "--:--";
}

function relativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "agora";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
}

function fileSize(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1).replace(".0", "")} MB`;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível otimizar esta imagem")), type, quality);
  });
}

async function prepareStatusFile(file: File) {
  const supported = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
  if (!supported.has(file.type.toLowerCase())) throw new Error("Use JPG, PNG, WebP, MP4, MOV ou WebM");
  if (!file.size) throw new Error("O arquivo escolhido está vazio");
  if (file.type.startsWith("video/")) {
    if (file.size > MAX_STATUS_UPLOAD_BYTES) throw new Error(`O vídeo tem ${fileSize(file.size)}. Nesta versão, vídeos devem ter até 3 MB.`);
    return file;
  }
  if (file.size <= MAX_STATUS_UPLOAD_BYTES) return file;
  if (file.size > MAX_STATUS_SOURCE_IMAGE_BYTES) throw new Error(`A foto tem ${fileSize(file.size)}. Escolha uma imagem de até 20 MB.`);

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Não foi possível abrir esta imagem"));
      image.src = sourceUrl;
    });
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível otimizar esta imagem");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.7, 0.58]) {
      const blob = await canvasBlob(canvas, "image/webp", quality);
      if (blob.size <= MAX_STATUS_UPLOAD_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "status";
        const outputType = blob.type === "image/webp" ? "image/webp" : "image/png";
        return new File([blob], `${baseName}.${outputType === "image/webp" ? "webp" : "png"}`, { type: outputType, lastModified: Date.now() });
      }
    }
    throw new Error("A foto ainda ficou muito grande. Escolha outra imagem.");
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

class DashboardErrorBoundary extends Component<{ children: ReactNode; onRecover: () => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="page-crash"><span><AlertTriangle /></span><h2>Esta página encontrou um problema</h2><p>O restante do MeetFlow continua funcionando. Você pode voltar ao início sem precisar atualizar o navegador.</p><button className="button button-primary" onClick={() => { this.setState({ failed: false }); this.props.onRecover(); }}>Voltar ao início</button></section>;
  }
}

function localDateTime(offsetHours = 1) {
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function Avatar({ name, url, api, small = false }: { name: string; url?: string; api: MeetFlowApi; small?: boolean }) {
  const source = api.mediaUrl(url);
  if (source) return <img className={`avatar${small ? " avatar-small" : ""}`} src={source} alt={`Foto de ${name}`} />;
  return <span className={`avatar avatar-fallback${small ? " avatar-small" : ""}`}>{initials(name)}</span>;
}

export default function LocalApp() {
  const [legalDocument, setLegalDocument] = useState(() => typeof window === "undefined" ? null : legalDocumentFromHash(window.location.hash));
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const syncLegalDocument = () => setLegalDocument(legalDocumentFromHash(window.location.hash));
    window.addEventListener("hashchange", syncLegalDocument);
    return () => window.removeEventListener("hashchange", syncLegalDocument);
  }, []);

  useEffect(() => {
    if (legalDocument) return;
    const linkParameters = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (linkParameters.has("reset_token") || linkParameters.has("invite_token")) {
      queueMicrotask(() => setSession(null));
      return;
    }
    const local = window.localStorage.getItem(SESSION_KEY);
    const temporary = window.sessionStorage.getItem(SESSION_KEY);
    const raw = local ?? temporary;
    if (!raw) { queueMicrotask(() => setSession(null)); return; }
    try {
      const saved = JSON.parse(raw) as Session;
      meetFlowApi.authenticated(saved.token).me().then((user) => setSession({ token: saved.token, user, remember: local !== null }))
        .catch(() => { window.localStorage.removeItem(SESSION_KEY); window.sessionStorage.removeItem(SESSION_KEY); setSession(null); });
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      window.sessionStorage.removeItem(SESSION_KEY);
      queueMicrotask(() => setSession(null));
    }
  }, [legalDocument]);

  const saveSession = (next: Session | null) => {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_KEY);
    if (next) (next.remember ? window.localStorage : window.sessionStorage).setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
  };

  if (legalDocument) return <LegalDocumentPage key={legalDocument} kind={legalDocument} />;
  if (session === undefined) return <Loading label="Abrindo seu workspace" />;
  if (!session) return <LocalAuth onAuthenticated={saveSession} />;
  return <LocalDashboard session={session} onSession={saveSession} />;
}

function Loading({ label }: { label: string }) {
  return <main className="loading-screen"><span className="brand-mark pulse"><Sparkles /></span><h1>MeetFlow</h1><p>{label}...</p></main>;
}

function LocalAuth({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [avatar, setAvatar] = useState<File>();
  const [dialog, setDialog] = useState<"recovery" | null>(null);
  const [resetToken, setResetToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reset_token") ?? "";
  });
  const [inviteToken, setInviteToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("invite_token") ?? "";
  });

  useEffect(() => {
    if ((resetToken || inviteToken) && window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }, [inviteToken, resetToken]);

  const passwordChecks = [
    { label: "10 caracteres", valid: password.length >= 10 },
    { label: "letra maiúscula", valid: /[A-Z]/.test(password) },
    { label: "número", valid: /\d/.test(password) },
  ];

  function changeMode(next: "login" | "register") {
    setMode(next); setError(""); setPassword(""); setConfirmation(""); setAvatar(undefined); setShowPassword(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "register" && password !== confirmation) throw new Error("As senhas informadas não são iguais");
      if (mode === "register" && !passwordChecks.every((item) => item.valid)) throw new Error("Crie uma senha que atenda a todos os requisitos");
      if (mode === "login") {
        const remember = form.get("remember") === "on";
        const result = await meetFlowApi.login(String(form.get("email")), password, remember);
        onAuthenticated({ ...result, remember });
      } else {
        const result = await meetFlowApi.register({
          name: String(form.get("name")), jobTitle: String(form.get("jobTitle")),
          email: String(form.get("email")), password,
          organizationName: String(form.get("organizationName")), acceptTerms: form.get("acceptTerms") === "on",
          termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION,
        });
        const user = avatar ? await meetFlowApi.authenticated(result.token).uploadAvatar(avatar).catch(() => result.user) : result.user;
        onAuthenticated({ ...result, user, remember: true });
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível continuar"); }
    finally { setBusy(false); }
  }

  return (
    <main className="local-auth-shell">
      <aside className="local-auth-aside">
        <a className="brand" href="#"><span className="brand-mark"><Sparkles /></span>MeetFlow</a>
        <div className="auth-presentation"><span className="hero-pill"><span /> AMBIENTE EMPRESARIAL</span><h1>Onde equipes transformam conversas em movimento.</h1><p>Reuniões, chat, colaboradores e atualizações em um único workspace seguro.</p><div className="auth-benefits"><span><CheckCircle2 /> Dados separados por empresa</span><span><CheckCircle2 /> Contas individuais para a equipe</span><span><CheckCircle2 /> Informações salvas na nuvem</span></div></div>
        <footer><ShieldCheck /> Ambiente protegido e conectado ao PostgreSQL</footer>
      </aside>
      <section className="local-auth-card">
        {inviteToken ? <InvitationAcceptForm token={inviteToken} onAuthenticated={(result) => onAuthenticated({ ...result, remember: true })} onBack={() => { setInviteToken(""); changeMode("login"); }} /> : resetToken ? <PasswordResetForm token={resetToken} onBack={() => { setResetToken(""); changeMode("login"); }} /> : <>
        <div className="auth-tabs" role="tablist"><button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Entrar</button><button type="button" role="tab" aria-selected={mode === "register"} className={mode === "register" ? "active" : ""} onClick={() => changeMode("register")}>Criar empresa</button></div>
        <div className="auth-heading"><span className="auth-secure"><LockKeyhole /> ACESSO SEGURO</span><h2>{mode === "login" ? "Bem-vindo de volta" : "Crie seu workspace"}</h2><p>{mode === "login" ? "Use os dados cadastrados para acessar sua empresa." : "Configure sua conta de administrador em poucos passos."}</p></div>
        {error && <div className="form-error">{error}</div>}
        <form className={`auth-form auth-form-${mode}`} onSubmit={submit}>
          {mode === "register" && <><div className="auth-form-section"><span>1</span><div><strong>Seus dados</strong><small>Perfil do administrador</small></div></div><div className="auth-field-grid"><label>Nome completo<div className="input-with-icon"><Users /><input name="name" required maxLength={120} autoComplete="name" placeholder="Seu nome completo" /></div></label><label>Cargo<div className="input-with-icon"><BriefcaseBusiness /><input name="jobTitle" required maxLength={120} placeholder="Ex.: Diretor comercial" /></div></label></div><div className="auth-form-section"><span>2</span><div><strong>Dados da empresa</strong><small>Workspace privado</small></div></div><label>Nome da empresa<div className="input-with-icon"><Building2 /><input name="organizationName" required maxLength={120} autoComplete="organization" placeholder="Nome da sua empresa" /></div></label></>}
          <label>E-mail profissional<div className="input-with-icon"><Mail /><input name="email" required type="email" autoComplete="email" inputMode="email" placeholder="voce@empresa.com" /></div></label>
          <div className={mode === "register" ? "auth-field-grid" : ""}><label>Senha<div className="input-with-icon"><LockKeyhole /><input name="password" required type={showPassword ? "text" : "password"} minLength={mode === "register" ? 10 : 8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === "login" ? "Digite sua senha" : "Crie uma senha forte"} /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label>{mode === "register" && <label>Confirmar senha<div className="input-with-icon"><LockKeyhole /><input required type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repita a senha" /></div></label>}</div>
          {mode === "register" && <><div className="password-strength"><div><span style={{ width: `${passwordChecks.filter((item) => item.valid).length / passwordChecks.length * 100}%` }} /></div><small>{passwordChecks.map((item) => <span className={item.valid ? "valid" : ""} key={item.label}><Check /> {item.label}</span>)}</small></div><label className="avatar-register"><span className="avatar avatar-fallback">{avatar ? <ImagePlus /> : "MF"}</span><div><strong>Foto de perfil <em>opcional</em></strong><small>{avatar?.name ?? "JPG, PNG ou WebP, até 3,5 MB"}</small></div><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setAvatar(event.target.files?.[0])} /></label><LegalConsent /></>}
          {mode === "login" && <div className="login-options"><label className="auth-check"><input name="remember" type="checkbox" /><span>Manter conectado neste dispositivo</span></label><button type="button" onClick={() => setDialog("recovery")}>Esqueci minha senha</button></div>}
          <button className="button button-primary button-wide auth-submit" disabled={busy}>{busy ? <Loader2 className="spin" /> : <>{mode === "login" ? "Entrar no MeetFlow" : "Criar meu workspace"}<ArrowRight /></>}</button>
        </form>
        </>}
        <small><ShieldCheck /> Seus dados são protegidos e não aparecem para outras empresas</small>
      </section>
      {dialog && <div className="auth-dialog-backdrop" role="presentation" onMouseDown={() => setDialog(null)}><section className="auth-dialog" role="dialog" aria-modal="true" aria-label="Recuperar senha" onMouseDown={(event) => event.stopPropagation()}><header><span><ShieldCheck /></span><button onClick={() => setDialog(null)} aria-label="Fechar"><X /></button></header><PasswordRecoveryRequest onClose={() => setDialog(null)} /></section></div>}
    </main>
  );
}

function PasswordRecoveryRequest({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try { setMessage((await meetFlowApi.requestPasswordReset(email)).message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível solicitar a recuperação"); }
    finally { setBusy(false); }
  }

  if (message) return <div className="recovery-success"><span><Mail /></span><h3>Confira seu e-mail</h3><p>{message}</p><p>O link é válido por 60 minutos e funciona apenas uma vez. Verifique também as pastas Spam e Promoções.</p><button className="button button-dark button-wide" onClick={onClose}>Voltar ao login</button></div>;
  return <><h3>Recuperar sua senha</h3><p>Informe o e-mail usado no MeetFlow. Se a conta existir, enviaremos um link seguro para você criar uma nova senha.</p>{error && <div className="form-error">{error}</div>}<form className="recovery-form" onSubmit={submit}><label>E-mail da conta<div className="input-with-icon"><Mail /><input type="email" inputMode="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></div></label><button className="button button-dark button-wide" disabled={busy}>{busy ? <Loader2 className="spin" /> : <><Mail /> Enviar link de recuperação</>}</button></form><small className="recovery-security"><ShieldCheck /> Por segurança, não informamos se um e-mail está cadastrado.</small></>;
}

function PasswordResetForm({ token, onBack }: { token: string; onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const checks = [
    { label: "10 caracteres", valid: password.length >= 10 },
    { label: "letra maiúscula", valid: /[A-Z]/.test(password) },
    { label: "número", valid: /\d/.test(password) },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!checks.every((item) => item.valid)) { setError("Crie uma senha que atenda a todos os requisitos"); return; }
    if (password !== confirmation) { setError("As senhas informadas não são iguais"); return; }
    setBusy(true);
    try { setMessage((await meetFlowApi.resetPassword(token, password)).message); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível redefinir a senha"); }
    finally { setBusy(false); }
  }

  if (message) return <div className="reset-password-success"><span><CheckCircle2 /></span><div className="auth-heading"><span className="auth-secure"><ShieldCheck /> SENHA ATUALIZADA</span><h2>Tudo pronto!</h2><p>{message}</p></div><button className="button button-primary button-wide" onClick={onBack}>Entrar com a nova senha <ArrowRight /></button></div>;
  return <div className="reset-password-card"><button className="auth-back" type="button" onClick={onBack}>Voltar ao login</button><div className="auth-heading"><span className="auth-secure"><LockKeyhole /> LINK SEGURO</span><h2>Crie uma nova senha</h2><p>Escolha uma senha forte e diferente da anterior.</p></div>{error && <div className="form-error">{error}</div>}<form className="auth-form" onSubmit={submit}><label>Nova senha<div className="input-with-icon"><LockKeyhole /><input required type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma senha forte" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label><label>Confirmar nova senha<div className="input-with-icon"><LockKeyhole /><input required type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repita a nova senha" /></div></label><div className="password-strength"><div><span style={{ width: `${checks.filter((item) => item.valid).length / checks.length * 100}%` }} /></div><small>{checks.map((item) => <span className={item.valid ? "valid" : ""} key={item.label}><Check /> {item.label}</span>)}</small></div><button className="button button-primary button-wide auth-submit" disabled={busy}>{busy ? <Loader2 className="spin" /> : <>Salvar nova senha <ArrowRight /></>}</button></form></div>;
}

function InvitationAcceptForm({ token, onAuthenticated, onBack }: { token: string; onAuthenticated: (result: { token: string; user: AuthUser }) => void; onBack: () => void }) {
  const [invitation, setInvitation] = useState<TeamInvitation | null>();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const checks = [
    { label: "10 caracteres", valid: password.length >= 10 },
    { label: "letra maiúscula", valid: /[A-Z]/.test(password) },
    { label: "número", valid: /\d/.test(password) },
  ];

  useEffect(() => {
    let alive = true;
    meetFlowApi.inspectInvitation(token)
      .then((details) => { if (alive) setInvitation(details); })
      .catch((reason) => { if (alive) { setInvitation(null); setError(reason instanceof Error ? reason.message : "Não foi possível abrir este convite"); } });
    return () => { alive = false; };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!checks.every((item) => item.valid)) { setError("Crie uma senha que atenda a todos os requisitos"); return; }
    if (password !== confirmation) { setError("As senhas informadas não são iguais"); return; }
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try { onAuthenticated(await meetFlowApi.acceptInvitation(token, password, form.get("acceptTerms") === "on", TERMS_VERSION, PRIVACY_VERSION)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível aceitar o convite"); }
    finally { setBusy(false); }
  }

  if (invitation === undefined) return <div className="invitation-loading"><Loader2 className="spin" /><h2>Validando seu convite</h2><p>Estamos confirmando os dados da empresa.</p></div>;
  if (!invitation) return <div className="invitation-invalid"><span><AlertTriangle /></span><h2>Convite indisponível</h2><p>{error}</p><button className="button button-dark button-wide" onClick={onBack}>Voltar ao login</button></div>;
  return <div className="invitation-accept"><button className="auth-back" type="button" onClick={onBack}>Voltar ao login</button><div className="auth-heading"><span className="auth-secure"><UserPlus /> CONVITE SEGURO</span><h2>Entre para {invitation.organizationName}</h2><p>{invitation.invitedByName} convidou você como <strong>{roleName(invitation.role)}</strong>.</p></div><div className="invitation-profile"><span className="avatar avatar-fallback">{initials(invitation.name)}</span><div><strong>{invitation.name}</strong><small>{invitation.jobTitle} · {invitation.email}</small></div><ShieldCheck /></div>{error && <div className="form-error">{error}</div>}<form className="auth-form" onSubmit={submit}><label>Crie sua senha<div className="input-with-icon"><LockKeyhole /><input required type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Crie uma senha forte" /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff /> : <Eye />}</button></div></label><label>Confirme sua senha<div className="input-with-icon"><LockKeyhole /><input required type={showPassword ? "text" : "password"} minLength={10} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repita a senha" /></div></label><div className="password-strength"><div><span style={{ width: `${checks.filter((item) => item.valid).length / checks.length * 100}%` }} /></div><small>{checks.map((item) => <span className={item.valid ? "valid" : ""} key={item.label}><Check /> {item.label}</span>)}</small></div><LegalConsent /><button className="button button-primary button-wide auth-submit" disabled={busy}>{busy ? <Loader2 className="spin" /> : <>Aceitar convite e entrar <ArrowRight /></>}</button></form></div>;
}

function LocalDashboard({ session, onSession }: { session: Session; onSession: (session: Session | null) => void }) {
  const api = useMemo(() => meetFlowApi.authenticated(session.token), [session.token]);
  const [user, setUser] = useState(session.user);
  const [view, setView] = useState<View>("inicio");
  const [modal, setModal] = useState<Modal>(null);
  const [sidebar, setSidebar] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [statuses, setStatuses] = useState<TeamStatus[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>("checking");
  const [activeChannel, setActiveChannel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [story, setStory] = useState<TeamStatus | null>(null);
  const canManageTeam = user.role === "OWNER" || user.role === "ADMIN";

  const showError = useCallback((reason: unknown) => setError(reason instanceof Error ? reason.message : "Algo deu errado"), []);
  const refresh = useCallback(async () => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date(Date.now() + 365 * 86400000).toISOString();
    const results = await Promise.allSettled([
      api.meetings(from, to), api.channels(), api.team(), api.statuses(), api.notifications(),
      canManageTeam ? api.auditLog() : Promise.resolve([] as AuditEvent[]),
    ]);
    const [meetingResult, channelResult, memberResult, statusResult, notificationResult, auditResult] = results;
    if (meetingResult.status === "fulfilled") setMeetings(Array.isArray(meetingResult.value) ? meetingResult.value : []);
    if (channelResult.status === "fulfilled") {
      const nextChannels = Array.isArray(channelResult.value) ? channelResult.value : [];
      setChannels(nextChannels);
      setActiveChannel((current) => nextChannels.some((channel) => channel.id === current) ? current : nextChannels[0]?.id || "");
    }
    if (memberResult.status === "fulfilled") setMembers(Array.isArray(memberResult.value) ? memberResult.value : []);
    if (statusResult.status === "fulfilled") setStatuses(Array.isArray(statusResult.value) ? statusResult.value : []);
    if (notificationResult.status === "fulfilled") setNotifications(Array.isArray(notificationResult.value) ? notificationResult.value : []);
    if (auditResult.status === "fulfilled") setAuditEvents(Array.isArray(auditResult.value) ? auditResult.value : []);
    // Notificações são uma melhoria progressiva: a API Java local antiga pode não expor a rota ainda.
    const failed = results.slice(0, 4).find((result) => result.status === "rejected");
    if (failed?.status === "rejected") showError(failed.reason);
    else setError("");
    setLoading(false);
  }, [api, canManageTeam, showError]);

  const refreshChannels = useCallback(async () => {
    const next = await api.channels();
    setChannels(Array.isArray(next) ? next : []);
  }, [api]);

  const refreshNotifications = useCallback(async () => {
    const next = await api.notifications();
    setNotifications(Array.isArray(next) ? next : []);
  }, [api]);

  const markChannelRead = useCallback(async (channelId: string) => {
    if (!channelId) return;
    await api.markChannelRead(channelId);
    await refreshChannels();
  }, [api, refreshChannels]);

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    if (view !== "chat" || !activeChannel) return;
    let alive = true;
    const load = async (silent = false) => {
      if (!silent) setMessagesLoading(true);
      try {
        const data = await api.messages(activeChannel);
        if (alive) {
          setMessages(Array.isArray(data) ? data : []);
          if (!silent) void markChannelRead(activeChannel).catch(() => undefined);
        }
      } catch (reason) {
        if (alive) showError(reason);
      } finally {
        if (alive && !silent) setMessagesLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, realtimeState === "live" ? 30000 : 5000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeChannel, api, markChannelRead, realtimeState, showError, view]);

  const channelIds = channels.map((channel) => channel.id).join("|");
  useEffect(() => {
    let alive = true;
    let cleanup = () => undefined;
    async function connect() {
      try {
        const config = await api.realtimeConfig();
        if (!config.enabled || !alive) { if (alive) setRealtimeState("fallback"); return; }
        const { Realtime } = await import("ably");
        if (!alive) return;
        const client = new Realtime({ ...api.realtimeAuthOptions(), closeOnUnload: true, echoMessages: false });
        const subscribed = channels.map((channel) => {
          const realtimeChannel = client.channels.get(api.chatRealtimeChannel(user.organizationId, channel.id));
          const listener = () => {
            if (!alive) return;
            void refreshChannels().catch(() => undefined);
            if (view === "chat" && activeChannel === channel.id) {
              void api.messages(channel.id).then((next) => {
                if (alive) setMessages(Array.isArray(next) ? next : []);
              }).catch(() => undefined);
              void markChannelRead(channel.id).catch(() => undefined);
            }
          };
          void realtimeChannel.subscribe("chat.updated", listener).catch(() => setRealtimeState("fallback"));
          return { realtimeChannel, listener };
        });
        const userChannel = client.channels.get(api.notificationRealtimeChannel(user.organizationId, user.id));
        const notificationListener = () => { if (alive) void refreshNotifications().catch(() => undefined); };
        void userChannel.subscribe("notification.created", notificationListener).catch(() => setRealtimeState("fallback"));
        client.connection.on((change) => {
          if (!alive) return;
          setRealtimeState(change.current === "connected" ? "live" : change.current === "connecting" ? "checking" : "fallback");
        });
        cleanup = () => {
          subscribed.forEach(({ realtimeChannel, listener }) => realtimeChannel.unsubscribe("chat.updated", listener));
          userChannel.unsubscribe("notification.created", notificationListener);
          client.close();
        };
      } catch {
        if (alive) setRealtimeState("fallback");
      }
    }
    void connect();
    return () => { alive = false; cleanup(); };
  // A string estável evita reconectar quando apenas contadores e prévias mudam.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannel, api, channelIds, markChannelRead, refreshChannels, refreshNotifications, user.id, user.organizationId, view]);

  function switchView(next: View) {
    setView(next);
    setSidebar(false);
    setStory(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }
  function replaceUser(next: AuthUser) {
    setUser(next);
    onSession({ token: session.token, user: next, remember: session.remember });
  }
  function logout() { onSession(null); }

  const activeMeetings = meetings.filter((item) => item.status !== "CANCELLED" && new Date(item.endAt) >= new Date());
  const unreadChat = channels.reduce((total, channel) => total + (channel.unreadCount || 0), 0);
  const unreadNotifications = notifications.filter((item) => !item.readAt).length;
  const title = nav.find((item) => item.id === view)?.label ?? (view === "configuracoes" ? "Configurações" : "MeetFlow");

  async function openNotification(notification: AppNotification) {
    setNotificationOpen(false);
    if (!notification.readAt) {
      try {
        const updated = await api.markNotificationRead(notification.id);
        setNotifications((current) => current.map((item) => item.id === updated.id ? updated : item));
      } catch (reason) { showError(reason); }
    }
    if (notification.link?.startsWith("chat:")) {
      const channelId = notification.link.slice(5);
      if (channels.some((channel) => channel.id === channelId)) setActiveChannel(channelId);
      switchView("chat");
    }
  }

  if (loading) return <Loading label="Carregando dados reais" />;
  return (
    <main className="app-shell">
      {sidebar && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
      <aside className={`sidebar${sidebar ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Sparkles /></span>MeetFlow<button onClick={() => setSidebar(false)} aria-label="Fechar menu"><X /></button></div>
        <div className="workspace-card"><span className="avatar avatar-fallback">{initials(user.organizationName)}</span><div><strong>{user.organizationName}</strong><span>Workspace empresarial</span></div></div>
        <nav className="main-nav"><span>MENU PRINCIPAL</span>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => switchView(item.id)}><item.icon />{item.label}{item.id === "chat" && unreadChat > 0 && <em>{unreadChat > 99 ? "99+" : unreadChat}</em>}</button>)}</nav>
        <div className="sidebar-footer"><button className={view === "configuracoes" ? "active" : ""} onClick={() => switchView("configuracoes")}><Settings />Configurações</button><button onClick={logout}><LogOut />Sair</button></div>
        <div className="sidebar-profile"><Avatar name={user.name} url={user.avatarUrl} api={api} /><div><strong>{user.name}</strong><span>{user.jobTitle}</span></div></div>
      </aside>
      <section className="main-area">
        <header className="topbar"><div className="topbar-title"><button className="menu-button" onClick={() => setSidebar(true)}><Menu /></button><div><span>{user.organizationName}</span><h1>{title}</h1></div></div><div className="topbar-actions"><span className={`realtime-pill ${realtimeState}`}>{realtimeState === "live" ? <Wifi /> : <WifiOff />}{realtimeState === "live" ? "Tempo real" : realtimeState === "checking" ? "Conectando" : "Sincronização segura"}</span><div className="notification-center"><button className="notification-button" onClick={() => setNotificationOpen((value) => !value)} aria-label={`${unreadNotifications} notificações não lidas`} aria-expanded={notificationOpen}><Bell />{unreadNotifications > 0 && <em>{unreadNotifications > 9 ? "9+" : unreadNotifications}</em>}</button>{notificationOpen && <section className="notification-popover"><header><div><span className="section-kicker">CENTRAL</span><h3>Notificações</h3></div>{unreadNotifications > 0 && <button onClick={() => void api.markAllNotificationsRead().then(() => setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })))).catch(showError)}><CheckCheck /> Marcar lidas</button>}</header><div>{notifications.length ? notifications.slice(0, 20).map((notification) => <button className={`notification-item${notification.readAt ? "" : " unread"}`} key={notification.id} onClick={() => void openNotification(notification)}><span><MessageCircle /></span><div><strong>{notification.title}</strong><p>{notification.body}</p><small>{relativeTime(notification.createdAt)}</small></div></button>) : <div className="notification-empty"><Bell /><strong>Tudo tranquilo por aqui</strong><span>Novas mensagens aparecerão neste espaço.</span></div>}</div></section>}</div><span className="local-live"><i /> PostgreSQL conectado</span><button className="button button-primary" onClick={() => setModal("meeting")}><Plus /> Nova reunião</button></div></header>
        {error && <div className="error-banner"><AlertTriangle /><span>{error}</span><button onClick={() => setError("")}><X /></button></div>}
        <DashboardErrorBoundary key={view} onRecover={() => { switchView("inicio"); void refresh(); }}>
          <div className="content page-enter">
            {view === "inicio" && <Overview user={user} meetings={activeMeetings} channels={channels} statuses={statuses} members={members} onNavigate={switchView} onMeeting={() => setModal("meeting")} onStatus={() => setModal("status")} onStory={setStory} />}
            {view === "agenda" && <Agenda meetings={meetings} onCreate={() => setModal("meeting")} onCancel={async (meeting) => { const reason = window.prompt("Motivo do cancelamento:", "Reunião cancelada pela equipe"); if (!reason) return; try { await api.cancelMeeting(meeting.id, reason); await refresh(); } catch (cause) { showError(cause); } }} />}
            {view === "chat" && <Chat channels={channels} activeChannel={activeChannel} onChannel={(id) => { setMessages([]); setActiveChannel(id); }} messages={messages} loading={messagesLoading} user={user} api={api} realtimeState={realtimeState} onNewChannel={() => setModal("channel")} onRefresh={async () => { setMessagesLoading(true); try { setMessages(await api.messages(activeChannel)); await markChannelRead(activeChannel); } finally { setMessagesLoading(false); } }} onSend={async (content, replyToId) => { const sent = await api.sendMessage(activeChannel, content, replyToId); setMessages((current) => current.some((message) => message.id === sent.id) ? current : [...current, sent]); await markChannelRead(activeChannel); }} onEdit={async (messageId, content) => { const updated = await api.editMessage(activeChannel, messageId, content); setMessages((current) => current.map((message) => message.id === updated.id ? updated : message)); }} onDelete={async (messageId) => { const updated = await api.deleteMessage(activeChannel, messageId); setMessages((current) => current.map((message) => message.id === updated.id ? updated : message)); }} onError={showError} />}
            {view === "status" && <Statuses statuses={statuses} api={api} user={user} onCreate={() => setModal("status")} onStory={setStory} onDelete={async (id) => { try { await api.deleteStatus(id); await refresh(); } catch (cause) { showError(cause); } }} />}
            {view === "equipe" && <Team members={members} auditEvents={auditEvents} api={api} currentUserId={user.id} currentUserRole={user.role} canManage={canManageTeam} onAdd={() => setModal("member")} onRemove={async (id) => { if (!window.confirm("Desativar o acesso deste colaborador?")) return; try { await api.removeMember(id); await refresh(); } catch (cause) { showError(cause); } }} onRole={async (id, role) => { try { await api.changeMemberRole(id, role); await refresh(); } catch (cause) { showError(cause); } }} onResend={async (id) => { try { await api.resendInvitation(id); await refresh(); } catch (cause) { showError(cause); await refresh(); } }} onRevoke={async (id) => { if (!window.confirm("Cancelar este convite? O link enviado deixará de funcionar.")) return; try { await api.revokeInvitation(id); await refresh(); } catch (cause) { showError(cause); } }} />}
            {view === "configuracoes" && <ProfileSettings user={user} api={api} onUser={replaceUser} onLogout={logout} onDelete={() => setModal("delete")} onError={showError} />}
          </div>
        </DashboardErrorBoundary>
      </section>
      <nav className="mobile-nav"><button className={view === "inicio" ? "active" : ""} onClick={() => switchView("inicio")}><Home />Início</button><button className={view === "agenda" ? "active" : ""} onClick={() => switchView("agenda")}><CalendarDays />Agenda</button><span className="mobile-ai-slot" aria-hidden="true" /><button className={view === "chat" ? "active" : ""} onClick={() => switchView("chat")}><MessageCircle />Chat</button><button className={view === "configuracoes" ? "active" : ""} onClick={() => switchView("configuracoes")}><Settings />Ajustes</button></nav>
      <AiAssistant api={api} firstName={user.name.split(" ")[0] || "Você"} />
      {modal === "meeting" && <MeetingModal members={members.filter((member) => member.active)} onClose={() => setModal(null)} onSave={async (input) => { await api.createMeeting(input); setModal(null); await refresh(); }} onError={showError} />}
      {modal === "channel" && <SimpleModal title="Novo canal" kicker="CHAT DA EQUIPE" onClose={() => setModal(null)} onSubmit={async (form) => { const channel = await api.createChannel(String(form.get("name"))); setModal(null); await refresh(); setActiveChannel(channel.id); }} onError={showError}><label>Nome do canal<input name="name" required maxLength={100} placeholder="Ex.: Comercial" /></label></SimpleModal>}
      {modal === "status" && <StatusModal onClose={() => setModal(null)} onSave={async (caption, file) => { await api.publishStatus(caption, file); setModal(null); await refresh(); }} onError={showError} />}
      {modal === "member" && <MemberModal currentUserRole={user.role} onClose={() => setModal(null)} onSave={async (input) => { await api.inviteMember(input); setModal(null); await refresh(); }} onError={showError} />}
      {modal === "delete" && <DeleteModal onClose={() => setModal(null)} onDelete={async () => { await api.deleteAccount(); logout(); }} onError={showError} />}
      {story && <StoryViewer status={story} api={api} onClose={() => setStory(null)} />}
    </main>
  );
}

function Overview({ user, meetings, channels, statuses, members, onNavigate, onMeeting, onStatus, onStory }: { user: AuthUser; meetings: Meeting[]; channels: Channel[]; statuses: TeamStatus[]; members: TeamMember[]; onNavigate: (view: View) => void; onMeeting: () => void; onStatus: () => void; onStory: (status: TeamStatus) => void }) {
  const next = [...meetings].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)).slice(0, 5);
  const today = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return <>
    <div className="welcome-row"><div><span className="date-label">{today}</span><h2>Olá, {user.name.split(" ")[0]} 👋</h2><p>Aqui está o que está acontecendo na sua empresa.</p></div><button className="button button-primary" onClick={onMeeting}><Plus /> Agendar reunião</button></div>
    <div className="stats-grid"><article className="stat-card dark"><span className="stat-icon"><CalendarDays /></span><div><small>Próximas reuniões</small><strong>{meetings.length}</strong><em>agenda compartilhada</em></div></article><article className="stat-card"><span className="stat-icon"><MessageCircle /></span><div><small>Canais ativos</small><strong>{channels.length}</strong><em>conversas da empresa</em></div></article><article className="stat-card"><span className="stat-icon"><Users /></span><div><small>Colaboradores</small><strong>{members.filter((m) => m.active).length}</strong><em>contas cadastradas</em></div></article><article className="stat-card"><span className="stat-icon"><Video /></span><div><small>Status publicados</small><strong>{statuses.length}</strong><em>visíveis por 24 horas</em></div></article></div>
    <section className="panel status-carousel"><div className="panel-head"><div><span className="section-kicker">ATUALIZAÇÕES RÁPIDAS</span><h3>Status da equipe</h3></div><button onClick={() => onNavigate("status")}>Ver todos <ChevronRight /></button></div><div className="status-track"><button className="status-tile create" onClick={onStatus}><span className="avatar avatar-fallback">{initials(user.name)}</span><i><Plus /></i><strong>Novo status</strong><span>foto ou vídeo</span></button>{statuses.map((status) => <button className="status-tile" key={status.id} onClick={() => onStory(status)}><span className="status-ring"><span className="avatar avatar-fallback">{initials(status.authorName)}</span></span><strong>{status.authorName.split(" ")[0]}</strong><span>{relativeTime(status.createdAt)}</span></button>)}</div></section>
    <div className="overview-columns"><section className="panel"><div className="panel-head"><div><span className="section-kicker">AGENDA DA EMPRESA</span><h3>Próximas reuniões</h3></div><button onClick={() => onNavigate("agenda")}>Abrir agenda <ChevronRight /></button></div><div className="meeting-list">{next.length ? next.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />) : <Empty icon={CalendarDays} title="Agenda livre" text="Crie a primeira reunião da empresa." action="Agendar agora" onAction={onMeeting} />}</div></section><aside><section className="panel quick-panel"><div className="panel-head"><div><span className="section-kicker">ATALHOS</span><h3>Ações rápidas</h3></div></div><button className="quick-row" onClick={() => onNavigate("chat")}><span><MessageCircle /></span><div><strong>Abrir chat</strong><small>Converse com os colaboradores</small></div><ChevronRight /></button><button className="quick-row" onClick={() => onNavigate("equipe")}><span><UserPlus /></span><div><strong>Gerenciar equipe</strong><small>Contas e permissões</small></div><ChevronRight /></button></section><div className="focus-card"><ShieldCheck /><span>WORKSPACE PRIVADO</span><strong>{user.organizationName}</strong><p>Os registros deste painel pertencem somente à sua empresa.</p></div></aside></div>
  </>;
}

function MeetingRow({ meeting, onCancel }: { meeting: Meeting; onCancel?: (meeting: Meeting) => void }) {
  return <article className={`meeting-card${meeting.status === "CANCELLED" ? " cancelled" : ""}`}><div className="meeting-time"><strong>{formatTime(meeting.startAt)}</strong><span>{formatTime(meeting.endAt)}</span></div><i className="meeting-accent" /><div className="meeting-info"><small>{meeting.ownerName}</small><h3>{meeting.title}</h3><p>{meeting.mode === "VIDEO" ? <Video /> : <Building2 />} {meeting.location || (meeting.mode === "VIDEO" ? "Reunião online" : "Local a definir")}</p></div><span className="meeting-date">{formatDate(meeting.startAt)}</span>{onCancel ? <button className="row-action danger" onClick={() => onCancel(meeting)} disabled={meeting.status === "CANCELLED"} title="Cancelar reunião"><X /></button> : <Clock3 />}</article>;
}

function Agenda({ meetings, onCreate, onCancel }: { meetings: Meeting[]; onCreate: () => void; onCancel: (meeting: Meeting) => void }) {
  const ordered = [...meetings].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt));
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">PLANEJAMENTO</span><h2>Agenda empresarial</h2><p>Horários persistentes e protegidos contra conflitos.</p></div><button className="button button-primary" onClick={onCreate}><Plus /> Nova reunião</button></div><div className="calendar-summary"><div><CalendarDays /><span>Registros<strong>{meetings.length}</strong></span></div><div><CheckCircle2 /><span>Confirmadas<strong>{meetings.filter((m) => m.status !== "CANCELLED").length}</strong></span></div><p>Cada reunião criada fica salva no banco da empresa e estará disponível para toda a equipe.</p></div><section className="panel agenda-panel"><div className="meeting-list">{ordered.length ? ordered.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} onCancel={onCancel} />) : <Empty icon={CalendarDays} title="Nenhuma reunião" text="A agenda da empresa ainda está vazia." action="Criar reunião" onAction={onCreate} />}</div></section></section>;
}

function Chat({ channels, activeChannel, onChannel, messages, loading, user, api, realtimeState, onNewChannel, onRefresh, onSend, onEdit, onDelete, onError }: { channels: Channel[]; activeChannel: string; onChannel: (id: string) => void; messages: ChatMessage[]; loading: boolean; user: AuthUser; api: MeetFlowApi; realtimeState: RealtimeState; onNewChannel: () => void; onRefresh: () => Promise<void>; onSend: (content: string, replyToId?: string) => Promise<void>; onEdit: (messageId: string, content: string) => Promise<void>; onDelete: (messageId: string) => Promise<void>; onError: (reason: unknown) => void }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [replying, setReplying] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const current = channels.find((channel) => channel.id === activeChannel);
  useEffect(() => {
    const list = messageListRef.current;
    if (list) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const value = content.trim();
    if (!value || !activeChannel || sending) return;
    setSending(true);
    try {
      if (editing) await onEdit(editing.id, value);
      else await onSend(value, replying?.id);
      setContent("");
      setEditing(null);
      setReplying(null);
    }
    catch (reason) { setContent(value); onError(reason); }
    finally { setSending(false); }
  }

  function beginReply(message: ChatMessage) {
    setEditing(null);
    setReplying(message);
    setContent("");
  }

  function beginEdit(message: ChatMessage) {
    setReplying(null);
    setEditing(message);
    setContent(message.content);
  }

  async function remove(message: ChatMessage) {
    if (!window.confirm("Excluir esta mensagem? A conversa indicará que ela foi removida.")) return;
    try { await onDelete(message.id); }
    catch (reason) { onError(reason); }
  }

  return <section className="chat-shell">
    <aside className="conversation-list">
      <header><div><span className="section-kicker">CONVERSAS</span><h2>Canais <small>{channels.length}</small></h2></div><button className="icon-button" onClick={onNewChannel} title="Novo canal" aria-label="Criar canal"><Plus /></button></header>
      <span className="conversation-label">CANAIS DA EMPRESA</span>
      <div className="conversation-scroll">{channels.map((channel) => <button key={channel.id} className={`conversation${activeChannel === channel.id ? " active" : ""}`} onClick={() => onChannel(channel.id)}><span className="channel-avatar"><Hash /></span><div><strong>{channel.name}</strong><small>{channel.lastMessagePreview || "Canal compartilhado"}</small></div>{channel.unreadCount > 0 && <em className="unread-badge">{channel.unreadCount > 99 ? "99+" : channel.unreadCount}</em>}</button>)}</div>
    </aside>
    <article className="chat-room">
      <header><div><span className="channel-avatar"><Hash /></span><div><strong>{current?.name ?? "Selecione um canal"}</strong><small className={`chat-sync ${realtimeState}`}>{realtimeState === "live" ? <><i /> conectado em tempo real</> : <><RefreshCw /> sincronização automática</>}</small></div></div><button className="chat-refresh" onClick={() => void onRefresh().catch(onError)} disabled={loading || !current} title="Atualizar mensagens" aria-label="Atualizar mensagens"><RefreshCw className={loading ? "spin" : ""} /></button></header>
      <div className="messages" ref={messageListRef}><div className="day-divider"><span>{loading ? "Atualizando" : "Mensagens"}</span></div>{messages.length ? messages.map((message) => {
        const canManage = !message.deleted && (message.senderId === user.id || user.role === "OWNER" || user.role === "ADMIN");
        return <div key={message.id} className={`message-row${message.senderId === user.id ? " own" : ""}${message.deleted ? " deleted" : ""}`}><Avatar name={message.senderName} api={api} small /><div className="message-content"><span><strong>{message.senderName}</strong><time>{formatTime(message.createdAt)}</time>{message.editedAt && !message.deleted && <small>editada</small>}</span><div className="message-bubble">{message.replyTo && <div className="reply-quote"><CornerUpLeft /><span><strong>{message.replyTo.senderName}</strong>{message.replyTo.deleted ? "Mensagem removida" : message.replyTo.content}</span></div>}<p>{message.deleted ? "Esta mensagem foi removida." : message.content}</p>{!message.deleted && <div className="message-actions"><button onClick={() => beginReply(message)} title="Responder" aria-label="Responder"><CornerUpLeft /></button>{message.senderId === user.id && <button onClick={() => beginEdit(message)} title="Editar" aria-label="Editar"><Pencil /></button>}{canManage && <button onClick={() => void remove(message)} title="Excluir" aria-label="Excluir"><Trash2 /></button>}</div>}</div></div></div>;
      }) : !loading && <Empty icon={MessageCircle} title="Comece a conversa" text="As mensagens aparecerão para todos neste canal." />}<div ref={endRef} /></div>
      <div className="composer-area">{(replying || editing) && <div className={`composer-context${editing ? " editing" : ""}`}><span>{editing ? <Pencil /> : <CornerUpLeft />}</span><div><strong>{editing ? "Editando sua mensagem" : `Respondendo a ${replying?.senderName}`}</strong><small>{editing?.content || replying?.content}</small></div><button onClick={() => { setEditing(null); setReplying(null); setContent(""); }} aria-label="Cancelar"><X /></button></div>}<form className="composer" onSubmit={send}><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && (replying || editing)) { setReplying(null); setEditing(null); setContent(""); } else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={1} maxLength={4000} placeholder={editing ? "Edite sua mensagem" : `Mensagem em #${current?.name ?? "canal"}`} disabled={!current || sending} aria-label="Escrever mensagem" /><span>{content.length}/4000</span><button className="send-button" aria-label={editing ? "Salvar edição" : "Enviar mensagem"} disabled={!content.trim() || sending}>{sending ? <Loader2 className="spin" /> : editing ? <Check /> : <Send />}</button></form></div>
    </article>
  </section>;
}

function Statuses({ statuses, api, user, onCreate, onStory, onDelete }: { statuses: TeamStatus[]; api: MeetFlowApi; user: AuthUser; onCreate: () => void; onStory: (status: TeamStatus) => void; onDelete: (id: string) => void }) {
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">ATUALIZAÇÕES EM 24 HORAS</span><h2>Status da equipe</h2><p>Compartilhe novidades rápidas em texto, foto ou vídeo.</p></div><button className="button button-primary" onClick={onCreate}><ImagePlus /> Publicar status</button></div><div className="status-grid"><button className="status-card create-card" onClick={onCreate}><span><Plus /></span><strong>Novo status</strong><small>Imagem, vídeo ou texto</small></button>{statuses.map((status) => <article className="status-card" key={status.id} onClick={() => onStory(status)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onStory(status); } }} role="button" tabIndex={0}>{status.mediaType === "IMAGE" && status.mediaUrl && <img src={api.mediaUrl(status.mediaUrl)} alt="Status" />}{status.mediaType === "VIDEO" && status.mediaUrl && <video src={api.mediaUrl(status.mediaUrl)} muted />}{status.mediaType === "TEXT" && <span className="status-quote">“</span>}<div className="status-card-overlay"><span className="avatar avatar-fallback">{initials(status.authorName)}</span><span><strong>{status.authorName}</strong><small>{relativeTime(status.createdAt)}</small></span>{status.authorId === user.id && <button className="status-delete" aria-label="Excluir status" onClick={(event) => { event.stopPropagation(); onDelete(status.id); }}><Trash2 /></button>}</div><p>{status.caption}</p></article>)}</div></section>;
}

function auditDescription(event: AuditEvent) {
  const email = typeof event.metadata.email === "string" ? event.metadata.email : "um integrante";
  if (event.action === "TEAM_INVITATION_CREATED") return `enviou um convite para ${email}`;
  if (event.action === "TEAM_INVITATION_RESENT") return `reenviou o convite de ${email}`;
  if (event.action === "TEAM_INVITATION_REVOKED") return `cancelou o convite de ${email}`;
  if (event.action === "TEAM_INVITATION_ACCEPTED") return `${email} aceitou o convite`;
  if (event.action === "TEAM_MEMBER_ROLE_CHANGED") return `alterou o acesso de ${email} para ${roleName(String(event.metadata.role ?? "MEMBER") as UserRole)}`;
  if (event.action === "TEAM_MEMBER_DEACTIVATED") return `desativou o acesso de ${email}`;
  if (event.action === "TEAM_INVITATION_EMAIL_FAILED") return `registrou uma falha ao convidar ${email}`;
  return "realizou uma alteração administrativa";
}

function Team({ members, auditEvents, api, currentUserId, currentUserRole, canManage, onAdd, onRemove, onRole, onResend, onRevoke }: { members: TeamMember[]; auditEvents: AuditEvent[]; api: MeetFlowApi; currentUserId: string; currentUserRole: UserRole; canManage: boolean; onAdd: () => void; onRemove: (id: string) => void; onRole: (id: string, role: "ADMIN" | "MANAGER" | "MEMBER") => void; onResend: (id: string) => void; onRevoke: (id: string) => void }) {
  const pending = members.filter((member) => member.invitation && member.status === "PENDING").length;
  const active = members.filter((member) => member.active).length;
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">PESSOAS E ACESSOS</span><h2>Equipe e permissões</h2><p>Convide pessoas com segurança e controle o que cada nível pode administrar.</p></div>{canManage && <button className="button button-primary" onClick={onAdd}><UserPlus /> Convidar colaborador</button>}</div><div className="team-summary"><div><Users /><span><strong>{active}</strong> acessos ativos</span></div><div><Mail /><span><strong>{pending}</strong> convites pendentes</span></div><p><ShieldCheck /> Cada convite possui um link individual, expira em 7 dias e funciona uma única vez.</p></div><div className="team-grid">{members.map((member) => { const editable = canManage && member.active && member.id !== currentUserId && member.role !== "OWNER" && (currentUserRole === "OWNER" || member.role !== "ADMIN"); return <article className={`member-card${member.invitation ? " invitation-card" : ""}`} key={`${member.invitation ? "invite" : "user"}-${member.id}`}><div className="member-top"><Avatar name={member.name} url={member.avatarUrl} api={api} /><span className={`member-status ${member.status.toLowerCase()}`}>{member.status === "ACTIVE" ? "Ativo" : member.status === "PENDING" ? "Convite enviado" : member.status === "EXPIRED" ? "Expirado" : "Removido"}</span></div><h3>{member.name}</h3><p>{member.jobTitle}</p><small>{member.email}</small>{member.invitation && member.expiresAt && <div className="invite-expiry"><Clock3 /> {member.status === "EXPIRED" ? "O convite expirou" : `Válido até ${formatDate(member.expiresAt)}`}</div>}<footer>{editable ? <label className="role-select">Acesso<select value={member.role} onChange={(event) => onRole(member.id, event.target.value as "ADMIN" | "MANAGER" | "MEMBER")}><option value="MEMBER">Colaborador</option><option value="MANAGER">Gestor</option>{currentUserRole === "OWNER" && <option value="ADMIN">Administrador</option>}</select></label> : <span>{roleName(member.role)}</span>}{member.invitation && canManage ? <div className="member-actions"><button onClick={() => onResend(member.id)}><Send /> Reenviar</button><button className="danger-link" onClick={() => onRevoke(member.id)}><X /> Cancelar</button></div> : editable ? <button className="danger-link" onClick={() => onRemove(member.id)}><Trash2 /> Desativar</button> : <ShieldCheck />}</footer></article>; })}</div>{canManage && <section className="panel audit-panel"><div className="panel-head"><div><span className="section-kicker">RASTREABILIDADE</span><h3>Histórico administrativo</h3></div><History /></div><div className="audit-list">{auditEvents.length ? auditEvents.slice(0, 12).map((event) => <article key={event.id}><span><History /></span><div><p><strong>{event.actorName || "Sistema"}</strong> {auditDescription(event)}</p><small>{formatDate(event.createdAt)} às {formatTime(event.createdAt)}</small></div></article>) : <div className="audit-empty"><ShieldCheck /> As próximas alterações de acesso aparecerão aqui.</div>}</div></section>}</section>;
}

function ProfileSettings({ user, api, onUser, onLogout, onDelete, onError }: { user: AuthUser; api: MeetFlowApi; onUser: (user: AuthUser) => void; onLogout: () => void; onDelete: () => void; onError: (reason: unknown) => void }) {
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  async function update(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaved(false); const form = new FormData(event.currentTarget); try { onUser(await api.updateProfile({ name: String(form.get("name")), jobTitle: String(form.get("jobTitle")), organizationName: String(form.get("organizationName")) })); setSaved(true); } catch (reason) { onError(reason); } }
  async function avatar(file?: File) { if (!file) return; try { onUser(await api.uploadAvatar(file)); } catch (reason) { onError(reason); } }
  async function password(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPasswordSaved(false); const form = new FormData(event.currentTarget); try { await api.changePassword(String(form.get("currentPassword")), String(form.get("newPassword"))); event.currentTarget.reset(); setPasswordSaved(true); } catch (reason) { onError(reason); } }
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">SUA CONTA</span><h2>Configurações</h2><p>Atualize seus dados, foto e preferências de acesso.</p></div></div><div className="settings-layout"><nav><button className="active"><Users /> Perfil</button><button onClick={onLogout}><LogOut /> Sair da conta</button></nav><div className="settings-stack"><section className="panel settings-panel"><div className="panel-head"><div><span className="section-kicker">IDENTIDADE</span><h3>Perfil profissional</h3></div>{saved && <span className="save-success"><CheckCircle2 /> Salvo</span>}</div><div className="avatar-editor"><Avatar name={user.name} url={user.avatarUrl} api={api} /><label><ImagePlus /> Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void avatar(event.target.files?.[0])} /></label><span>JPG, PNG ou WebP, com até 3,5 MB na hospedagem gratuita.</span></div><form className="settings-form" onSubmit={update}><label>Nome completo<input name="name" required defaultValue={user.name} maxLength={120} /></label><label>Cargo<input name="jobTitle" required defaultValue={user.jobTitle} maxLength={120} /></label><label>E-mail<div className="readonly-input">{user.email}</div></label><label>Empresa<input name="organizationName" required defaultValue={user.organizationName} maxLength={120} readOnly={user.role !== "OWNER" && user.role !== "ADMIN"} /></label><div className="settings-actions"><button className="button button-primary">Salvar alterações</button><button type="button" className="button button-soft" onClick={onLogout}>Sair</button></div></form></section><section className="panel password-panel"><div className="panel-head"><div><span className="section-kicker">SEGURANÇA</span><h3>Alterar senha</h3></div>{passwordSaved && <span className="save-success"><CheckCircle2 /> Senha alterada</span>}</div><form onSubmit={password}><label>Senha atual<input name="currentPassword" type="password" required /></label><label>Nova senha<input name="newPassword" type="password" required minLength={10} placeholder="10 caracteres, maiúscula e número" /></label><button className="button button-dark">Atualizar senha</button></form></section><div className="danger-zone"><AlertTriangle /><div><strong>Excluir minha conta</strong><p>Desativa seu acesso permanentemente sem apagar o histórico empresarial.</p></div><button onClick={onDelete}>Excluir conta</button></div></div></div></section>;
}

function MeetingModal({ members, onClose, onSave, onError }: { members: TeamMember[]; onClose: () => void; onSave: (input: Record<string, unknown>) => Promise<void>; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? "");
  const [invitedMemberIds, setInvitedMemberIds] = useState<Set<string>>(() => new Set());
  const start = localDateTime(1), end = localDateTime(2);
  function toggleMember(id: string) {
    setInvitedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const recipients = new Map<string, { name: string; email: string }>();
    for (const member of members.filter((item) => invitedMemberIds.has(item.id))) {
      recipients.set(member.email.toLowerCase(), { name: member.name, email: member.email });
    }
    for (const email of String(form.get("guests") || "").split(",").map((value) => value.trim()).filter(Boolean)) {
      const normalized = email.toLowerCase();
      if (!recipients.has(normalized)) recipients.set(normalized, { name: email.split("@")[0], email });
    }
    try {
      await onSave({ title: String(form.get("title")), ownerId, startAt: new Date(String(form.get("startAt"))).toISOString(), endAt: new Date(String(form.get("endAt"))).toISOString(), mode: String(form.get("mode")), location: String(form.get("location")), notes: String(form.get("notes")), guests: [...recipients.values()] });
    } catch (reason) { onError(reason); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="modal"><header><div><span className="section-kicker">AGENDA EMPRESARIAL</span><h2>Nova reunião</h2></div><button onClick={onClose}><X /></button></header><form onSubmit={submit}><label>Título<input name="title" required maxLength={160} placeholder="Alinhamento semanal" /></label><label>Responsável<select name="ownerId" required value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{members.map((member) => <option value={member.id} key={member.id}>{member.name} — {member.jobTitle}</option>)}</select></label><div className="form-row two"><label>Início<input name="startAt" type="datetime-local" required defaultValue={start} /></label><label>Término<input name="endAt" type="datetime-local" required defaultValue={end} /></label></div><div className="form-row two"><label>Formato<select name="mode"><option value="VIDEO">Videoconferência</option><option value="IN_PERSON">Presencial</option></select></label><label>Local ou link<input name="location" maxLength={300} placeholder="Sala 2 ou link" /></label></div><div className="meeting-email-panel"><div className="meeting-email-head"><Mail /><div><strong>Quem receberá os avisos?</strong><span>O responsável e os colaboradores marcados receberão confirmação e lembretes por e-mail.</span></div></div><div className="meeting-invite-list">{members.map((member) => { const responsible = member.id === ownerId; const checked = responsible || invitedMemberIds.has(member.id); return <label className={checked ? "selected" : ""} key={member.id}><input type="checkbox" checked={checked} disabled={responsible} onChange={() => toggleMember(member.id)} /><span className="avatar avatar-fallback">{initials(member.name)}</span><span><strong>{member.name}</strong><small>{responsible ? "Responsável · aviso automático" : member.email}</small></span><Check /></label>; })}</div></div><label>Outros convidados por e-mail<input name="guests" type="text" inputMode="email" placeholder="ana@cliente.com, joao@parceiro.com" /><span className="field-help">Separe mais de um e-mail por vírgula.</span></label><label>Observações<textarea name="notes" rows={3} maxLength={2000} placeholder="Pauta e informações importantes" /></label><div className="modal-note"><ShieldCheck /> O sistema evita conflitos de horário e prepara lembretes de 24 horas e 1 hora.</div><footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy || !ownerId}>{busy && <Loader2 className="spin" />}Criar reunião</button></footer></form></section></div>;
}

function SimpleModal({ title, kicker, children, submitLabel = "Salvar", onClose, onSubmit, onError }: { title: string; kicker: string; children: ReactNode; submitLabel?: string; onClose: () => void; onSubmit: (form: FormData) => Promise<void>; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setLocalError(""); try { await onSubmit(new FormData(event.currentTarget)); } catch (reason) { const message = reason instanceof Error ? reason.message : "Não foi possível salvar"; setLocalError(message); onError(reason); } finally { setBusy(false); } }
  return <div className="modal-backdrop"><section className="modal modal-small"><header><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button onClick={onClose} aria-label="Fechar"><X /></button></header><form onSubmit={submit}>{localError && <div className="form-error modal-error"><AlertTriangle />{localError}</div>}{children}<footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy && <Loader2 className="spin" />}{busy ? "Enviando..." : submitLabel}</button></footer></form></section></div>;
}

function StatusModal({ onClose, onSave, onError }: { onClose: () => void; onSave: (caption: string, file?: File) => Promise<void>; onError: (reason: unknown) => void }) {
  const [kind, setKind] = useState<"TEXT" | "MEDIA">("TEXT");
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState("");
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

  function chooseFile(next?: File) {
    setFileError("");
    if (!next) { setFile(undefined); return; }
    const supported = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime", "video/webm"]);
    if (!supported.has(next.type.toLowerCase())) { setFile(undefined); setFileError("Use JPG, PNG, WebP, MP4, MOV ou WebM"); return; }
    if (next.type.startsWith("video/") && next.size > MAX_STATUS_UPLOAD_BYTES) { setFile(undefined); setFileError(`O vídeo tem ${fileSize(next.size)}. Escolha um vídeo de até 3 MB.`); return; }
    if (next.type.startsWith("image/") && next.size > MAX_STATUS_SOURCE_IMAGE_BYTES) { setFile(undefined); setFileError(`A foto tem ${fileSize(next.size)}. Escolha uma imagem de até 20 MB.`); return; }
    setFile(next);
  }

  return <SimpleModal title="Publicar status" kicker="VISÍVEL POR 24 HORAS" submitLabel="Publicar agora" onClose={onClose} onError={onError} onSubmit={async (form) => {
    const caption = String(form.get("caption") || "").trim();
    if (kind === "TEXT" && !caption) throw new Error("Escreva uma mensagem para publicar o status");
    if (kind === "MEDIA" && !file) throw new Error("Escolha uma foto ou um vídeo para publicar");
    await onSave(caption, file ? await prepareStatusFile(file) : undefined);
  }}>
    <div className="status-kind-tabs"><button type="button" className={kind === "TEXT" ? "active" : ""} onClick={() => { setKind("TEXT"); setFile(undefined); setFileError(""); }}><MessageCircle /> Somente texto</button><button type="button" className={kind === "MEDIA" ? "active" : ""} onClick={() => setKind("MEDIA")}><ImagePlus /> Foto ou vídeo</button></div>
    {kind === "MEDIA" && <><label className={`upload-zone${previewUrl ? " has-preview" : ""}`}>{previewUrl ? (file?.type.startsWith("video/") ? <video src={previewUrl} muted /> : <img src={previewUrl} alt="Prévia do status" />) : <ImagePlus />}<strong>{file ? file.name : "Escolher foto ou vídeo"}</strong><span>{file ? `${fileSize(file.size)} · toque para trocar` : "Fotos são otimizadas automaticamente · vídeos até 3 MB"}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(event) => chooseFile(event.target.files?.[0])} /></label>{fileError && <div className="form-error modal-error"><AlertTriangle />{fileError}</div>}</>}
    <label>{kind === "TEXT" ? "Mensagem" : "Legenda (opcional)"}<textarea name="caption" rows={4} maxLength={1000} placeholder={kind === "TEXT" ? "O que você quer compartilhar com a equipe?" : "Adicione uma legenda à publicação..."} /></label>
    <div className="status-publish-note"><CheckCircle2 /> O status fica disponível para sua empresa por 24 horas.</div>
  </SimpleModal>;
}

function MemberModal({ currentUserRole, onClose, onSave, onError }: { currentUserRole: UserRole; onClose: () => void; onSave: (input: { name: string; email: string; jobTitle: string; role: "ADMIN" | "MANAGER" | "MEMBER" }) => Promise<void>; onError: (reason: unknown) => void }) {
  return <SimpleModal title="Convidar colaborador" kicker="ACESSO SEGURO À EQUIPE" submitLabel="Enviar convite" onClose={onClose} onError={onError} onSubmit={async (form) => onSave({ name: String(form.get("name")), email: String(form.get("email")), jobTitle: String(form.get("jobTitle")), role: String(form.get("role")) as "ADMIN" | "MANAGER" | "MEMBER" })}><div className="form-row two"><label>Nome<input name="name" required maxLength={120} /></label><label>Cargo<input name="jobTitle" required maxLength={120} placeholder="Analista comercial" /></label></div><label>E-mail<input name="email" type="email" required inputMode="email" placeholder="colaborador@empresa.com" /></label><label>Nível de acesso<select name="role"><option value="MEMBER">Colaborador — uso diário</option><option value="MANAGER">Gestor — coordenação da equipe</option>{currentUserRole === "OWNER" && <option value="ADMIN">Administrador — gerencia acessos</option>}</select></label><div className="modal-note"><Mail /> A pessoa receberá um link individual para criar a própria senha. Você nunca precisará conhecer a senha dela.</div></SimpleModal>;
}

function DeleteModal({ onClose, onDelete, onError }: { onClose: () => void; onDelete: () => Promise<void>; onError: (reason: unknown) => void }) {
  const [value, setValue] = useState("");
  return <div className="modal-backdrop"><section className="modal modal-small"><header><div><span className="section-kicker">AÇÃO PERMANENTE</span><h2>Excluir conta</h2></div><button onClick={onClose}><X /></button></header><div className="delete-warning"><AlertTriangle /><p>Seu login será desativado. Reuniões e mensagens continuam no histórico da empresa.</p></div><label>Digite <strong>EXCLUIR</strong> para confirmar<input value={value} onChange={(event) => setValue(event.target.value)} /></label><footer><button className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-danger" disabled={value !== "EXCLUIR"} onClick={() => onDelete().catch(onError)}>Excluir definitivamente</button></footer></section></div>;
}

function StoryViewer({ status, api, onClose }: { status: TeamStatus; api: MeetFlowApi; onClose: () => void }) {
  return <section className="story-viewer"><div className="story-progress"><i /></div><header><div><span className="avatar avatar-fallback">{initials(status.authorName)}</span><span><strong>{status.authorName}</strong><small>{relativeTime(status.createdAt)}</small></span></div><button onClick={onClose}><X /></button></header><main>{status.mediaType === "IMAGE" && <img src={api.mediaUrl(status.mediaUrl)} alt="Status da equipe" />}{status.mediaType === "VIDEO" && <video src={api.mediaUrl(status.mediaUrl)} controls autoPlay />}{status.mediaType === "TEXT" && <div className="story-text"><span>“</span><h2>{status.caption}</h2></div>}</main>{status.mediaType !== "TEXT" && status.caption && <footer>{status.caption}</footer>}</section>;
}

function Empty({ icon: Icon, title, text, action, onAction }: { icon: typeof CalendarDays; title: string; text: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><span><Icon /></span><h3>{title}</h3><p>{text}</p>{action && onAction && <button className="button button-soft" onClick={onAction}>{action}</button>}</div>;
}
