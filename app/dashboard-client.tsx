"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle, Bell, CalendarDays, Camera, Check, ChevronLeft, ChevronRight,
  Clock3, Film, Home, ImagePlus, LogOut, Menu, MessageCircleMore, MoreHorizontal,
  Paperclip, Plus, Search, Send, Settings, ShieldCheck, Sparkles, Trash2, Upload,
  UserPlus, Users, Video, X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { ChatGPTUser } from "./chatgpt-auth";

type NavId = "overview" | "agenda" | "chat" | "status" | "team" | "settings";
type Profile = { id: string; email: string; name: string; jobTitle: string; avatarUrl: string | null };
type Organization = { id: string; name: string; slug: string };
type Membership = { id: string; role: "OWNER" | "ADMIN" | "MEMBER"; status: string };
type Member = { membershipId: string; profileId: string | null; email: string; membershipRole: string; membershipStatus: string; name: string; jobTitle: string; avatarUrl: string | null };
type Meeting = { id: string; title: string; category: string; startsAt: string; endsAt: string; mode: string; guestEmail: string | null; status: "CONFIRMED" | "CANCELLED" };
type Channel = { id: string; name: string; kind: string };
type Message = { id: string; channelId: string; content: string; createdAt: string; senderProfileId: string; senderName: string; senderAvatarUrl: string | null };
type TeamStatus = { id: string; caption: string; mediaType: "IMAGE" | "VIDEO" | "TEXT"; createdAt: string; expiresAt: string; authorProfileId: string; authorName: string; authorAvatarUrl: string | null; mediaUrl: string | null };
type WorkspaceData = { needsOnboarding: boolean; identity: ChatGPTUser; profile?: Profile; organization?: Organization; membership?: Membership; members?: Member[]; meetings?: Meeting[]; channels?: Channel[]; messages?: Message[]; statuses?: TeamStatus[] };

const navItems: { id: NavId; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Visão geral", icon: Home },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "chat", label: "Mensagens", icon: MessageCircleMore },
  { id: "status", label: "Status", icon: Film },
  { id: "team", label: "Equipe", icon: Users },
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MF";
}

function Avatar({ name, src, small = false }: { name: string; src?: string | null; small?: boolean }) {
  return src ? <img className={`avatar ${small ? "avatar-small" : ""}`} src={src} alt={`Foto de ${name}`} /> : <span className={`avatar avatar-fallback ${small ? "avatar-small" : ""}`}>{initials(name)}</span>;
}

function formatTime(value: string) { return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).format(new Date(value)); }
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `há ${hours}h` : `há ${Math.floor(hours / 24)}d`;
}

export default function DashboardClient({ identity }: { identity: ChatGPTUser }) {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [error, setError] = useState("");
  const [active, setActive] = useState<NavId>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [meetingModal, setMeetingModal] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [inviteModal, setInviteModal] = useState(false);
  const [statusViewer, setStatusViewer] = useState<TeamStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    try {
      const next = await api<WorkspaceData>("/api/session", { cache: "no-store" });
      setData(next);
      if (!silent) setError("");
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar.");
    }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const shouldPoll = active === "chat" && Boolean(data && !data.needsOnboarding);
  useEffect(() => {
    if (!shouldPoll) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [shouldPoll, load]);

  async function mutate(path: string, init: RequestInit) {
    setBusy(true); setError("");
    try { await api(path, init); await load(); return true; }
    catch (mutationError) { setError(mutationError instanceof Error ? mutationError.message : "Falha na operação."); return false; }
    finally { setBusy(false); }
  }

  if (!data) return <LoadingScreen error={error} onRetry={() => void load()} />;
  if (data.needsOnboarding) return <Onboarding identity={identity} profile={data.profile} busy={busy} error={error} onSubmit={async (payload) => { await mutate("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); }} />;

  const workspace = data as Required<Pick<WorkspaceData, "profile" | "organization" | "membership" | "members" | "meetings" | "channels" | "messages" | "statuses">> & WorkspaceData;
  const pageTitle = [...navItems, { id: "settings" as NavId, label: "Configurações", icon: Settings }].find((item) => item.id === active)?.label;
  const go = (id: NavId) => { setActive(id); setSidebarOpen(false); };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Sparkles size={18} /></span><strong>MeetFlow</strong><button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"><X size={19} /></button></div>
        <div className="workspace-card"><Avatar name={workspace.organization.name} /><div><strong>{workspace.organization.name}</strong><span>Espaço empresarial</span></div></div>
        <nav className="main-nav"><span>MENU</span>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => go(id)}><Icon size={19} />{label}{id === "chat" && <em>{workspace.messages.length}</em>}</button>)}</nav>
        <div className="sidebar-footer"><button className={active === "settings" ? "active" : ""} onClick={() => go("settings")}><Settings size={19} />Configurações</button><div className="sidebar-profile"><Avatar name={workspace.profile.name} src={workspace.profile.avatarUrl} small /><div><strong>{workspace.profile.name}</strong><span>{workspace.profile.jobTitle}</span></div><a href="/signout-with-chatgpt?return_to=%2F" title="Sair" aria-label="Sair"><LogOut size={18} /></a></div></div>
      </aside>
      {sidebarOpen && <button className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" />}
      <main className="main-area">
        <header className="topbar"><div className="topbar-title"><button className="menu-button" onClick={() => setSidebarOpen(true)}><Menu size={21} /></button><div><span>Workspace</span><h1>{pageTitle}</h1></div></div><div className="topbar-actions"><label className="search-box"><Search size={17} /><input placeholder="Pesquisar" aria-label="Pesquisar" /></label><button className="icon-button notification"><Bell size={19} /><i /></button><button className="button button-primary" onClick={() => setMeetingModal(true)}><Plus size={17} />Nova reunião</button></div></header>
        {error && <div className="error-banner"><AlertTriangle size={17} /><span>{error}</span><button onClick={() => setError("")}><X size={16} /></button></div>}
        <div className="content">
          {active === "overview" && <Overview data={workspace} onNavigate={go} onNewMeeting={() => setMeetingModal(true)} onNewStatus={() => setStatusModal(true)} onViewStatus={setStatusViewer} />}
          {active === "agenda" && <Agenda meetings={workspace.meetings} onNew={() => setMeetingModal(true)} onCancel={(id) => void mutate("/api/meetings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: "CANCELLED" }) })} />}
          {active === "chat" && <Chat data={workspace} busy={busy} onRefresh={() => void load(true)} onSend={(channelId, content) => mutate("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channelId, content }) })} onNewChannel={(name) => mutate("/api/channels", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })} />}
          {active === "status" && <StatusBoard statuses={workspace.statuses} onNew={() => setStatusModal(true)} onView={setStatusViewer} />}
          {active === "team" && <Team data={workspace} onInvite={() => setInviteModal(true)} onMessage={() => go("chat")} />}
          {active === "settings" && <SettingsPage data={workspace} busy={busy} onSaved={() => void load()} onError={setError} onInvite={() => setInviteModal(true)} />}
        </div>
      </main>
      <nav className="mobile-nav">{navItems.slice(0, 5).map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? "active" : ""} onClick={() => go(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>
      {meetingModal && <MeetingModal busy={busy} onClose={() => setMeetingModal(false)} onSubmit={async (payload) => { if (await mutate("/api/meetings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })) setMeetingModal(false); }} />}
      {statusModal && <StatusModal busy={busy} onClose={() => setStatusModal(false)} onSubmit={async (form) => { if (await mutate("/api/statuses", { method: "POST", body: form })) setStatusModal(false); }} />}
      {inviteModal && <InviteModal busy={busy} onClose={() => setInviteModal(false)} onSubmit={async (payload) => { if (await mutate("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })) setInviteModal(false); }} />}
      {statusViewer && <StatusViewer status={statusViewer} onClose={() => setStatusViewer(null)} />}
    </div>
  );
}

function LoadingScreen({ error, onRetry }: { error: string; onRetry: () => void }) {
  return <main className="loading-screen"><span className="brand-mark pulse"><Sparkles /></span><h1>Preparando seu workspace</h1><p>{error || "Carregando agenda, equipe e conversas..."}</p>{error && <button className="button button-dark" onClick={onRetry}>Tentar novamente</button>}</main>;
}

function Onboarding({ identity, profile, busy, error, onSubmit }: { identity: ChatGPTUser; profile?: Profile; busy: boolean; error: string; onSubmit: (payload: { name: string; jobTitle: string; company: string }) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({ name: String(form.get("name")), jobTitle: String(form.get("jobTitle")), company: String(form.get("company")) }); }
  return <main className="onboarding-shell"><section className="onboarding-aside"><Link className="brand" href="/"><span className="brand-mark"><Sparkles size={18} /></span>MeetFlow</Link><div><span className="hero-pill"><span /> CONFIGURAÇÃO INICIAL</span><h1>Seu novo espaço de trabalho começa aqui.</h1><p>Em poucos segundos você terá agenda, chat, equipe e status conectados aos dados reais da sua empresa.</p></div><div className="onboarding-points"><span><Check />Perfil profissional</span><span><Check />Workspace privado</span><span><Check />Convites para colaboradores</span></div></section><section className="onboarding-form"><div><span className="step-pill">1 de 1</span><h2>Crie seu perfil</h2><p>Você entrou como <strong>{identity.email}</strong></p>{error && <div className="form-error">{error}</div>}<form onSubmit={submit}><label>Seu nome completo<input name="name" required minLength={2} defaultValue={profile?.name || identity.fullName || ""} placeholder="Ex.: Marcos Silva" /></label><label>Cargo ou função<input name="jobTitle" required minLength={2} defaultValue={profile?.jobTitle || ""} placeholder="Ex.: Gerente de Produto" /></label><label>Nome da empresa<input name="company" required minLength={2} placeholder="Ex.: Flow Studio" /></label><button className="button button-primary button-wide" disabled={busy}>{busy ? "Criando workspace..." : "Criar meu workspace"}<ChevronRight size={18} /></button></form><small><ShieldCheck size={15} /> Seus dados ficam separados por organização.</small></div></section></main>;
}

function Overview({ data, onNavigate, onNewMeeting, onNewStatus, onViewStatus }: { data: WorkspaceData & { profile: Profile; meetings: Meeting[]; members: Member[]; messages: Message[]; statuses: TeamStatus[] }; onNavigate: (id: NavId) => void; onNewMeeting: () => void; onNewStatus: () => void; onViewStatus: (status: TeamStatus) => void }) {
  const future = data.meetings.filter((meeting) => meeting.status === "CONFIRMED" && new Date(meeting.endsAt) > new Date()).slice(0, 4);
  const firstName = data.profile.name.split(" ")[0];
  return <div className="overview page-enter"><section className="welcome-row"><div><span className="date-label">{new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date())}</span><h2>Olá, {firstName} <span>👋</span></h2><p>Organize o dia e mantenha sua equipe em movimento.</p></div><button className="button button-soft" onClick={onNewMeeting}><CalendarDays size={17} />Agendar agora</button></section><section className="stats-grid"><Stat dark icon={<CalendarDays />} label="Próximas reuniões" value={future.length} note="agenda compartilhada" /><Stat icon={<Clock3 />} label="Horas agendadas" value={`${Math.round(future.reduce((sum, item) => sum + (new Date(item.endsAt).getTime() - new Date(item.startsAt).getTime()) / 3600000, 0) * 10) / 10}h`} note="nos próximos eventos" /><Stat icon={<Users />} label="Colaboradores" value={data.members.filter((m) => m.membershipStatus === "ACTIVE").length} note={`${data.members.filter((m) => m.membershipStatus === "PENDING").length} convites pendentes`} /><Stat icon={<MessageCircleMore />} label="Mensagens" value={data.messages.length} note="histórico do workspace" /></section><StatusCarousel statuses={data.statuses} profile={data.profile} onNew={onNewStatus} onView={onViewStatus} /><div className="overview-columns"><section className="panel"><PanelHead kicker="Sua rotina" title="Próximas reuniões" action="Ver agenda" onAction={() => onNavigate("agenda")} />{future.length ? <div className="meeting-list">{future.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} />)}</div> : <EmptyState icon={<CalendarDays />} title="Agenda livre" text="Crie a primeira reunião do seu workspace." action="Agendar reunião" onAction={onNewMeeting} />}</section><aside><section className="panel quick-panel"><PanelHead kicker="Atalhos" title="Ações rápidas" /><Quick icon={<MessageCircleMore />} title="Abrir mensagens" text="Converse com os colaboradores" onClick={() => onNavigate("chat")} /><Quick icon={<Film />} title="Publicar status" text="Foto, vídeo ou recado por 24h" onClick={onNewStatus} /><Quick icon={<Users />} title="Ver equipe" text="Gerencie pessoas e acessos" onClick={() => onNavigate("team")} /></section><section className="focus-card"><Sparkles /><span>WORKSPACE ATIVO</span><strong>{data.members.length} pessoas conectadas</strong><p>Todos os dados desta área pertencem somente à sua empresa.</p></section></aside></div></div>;
}

function Stat({ dark, icon, label, value, note }: { dark?: boolean; icon: React.ReactNode; label: string; value: string | number; note: string }) { return <article className={`stat-card ${dark ? "dark" : ""}`}><span className="stat-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{note}</em></div></article>; }
function PanelHead({ kicker, title, action, onAction }: { kicker: string; title: string; action?: string; onAction?: () => void }) { return <header className="panel-head"><div><span className="section-kicker">{kicker}</span><h3>{title}</h3></div>{action && <button onClick={onAction}>{action}<ChevronRight size={15} /></button>}</header>; }
function Quick({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) { return <button className="quick-row" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div><ChevronRight size={17} /></button>; }

function StatusCarousel({ statuses, profile, onNew, onView }: { statuses: TeamStatus[]; profile: Profile; onNew: () => void; onView: (status: TeamStatus) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (direction: number) => ref.current?.scrollBy({ left: direction * 330, behavior: "smooth" });
  return <section className="panel status-carousel"><PanelHead kicker="Atualizações da equipe" title="Status por 24 horas" /><div className="carousel-controls"><button onClick={() => move(-1)} aria-label="Voltar"><ChevronLeft /></button><button onClick={() => move(1)} aria-label="Avançar"><ChevronRight /></button></div><div className="status-track" ref={ref}><button className="status-tile create" onClick={onNew}><Avatar name={profile.name} src={profile.avatarUrl} /><i><Plus /></i><strong>Seu status</strong><span>Compartilhar</span></button>{statuses.map((status) => <button className="status-tile" key={status.id} onClick={() => onView(status)}><span className="status-ring"><Avatar name={status.authorName} src={status.authorAvatarUrl} /></span><strong>{status.authorName.split(" ")[0]}</strong><span>{relativeTime(status.createdAt)}</span></button>)}</div></section>;
}
function MeetingCard({ meeting, onCancel }: { meeting: Meeting; onCancel?: (id: string) => void }) {
  return <article className={`meeting-card ${meeting.status === "CANCELLED" ? "cancelled" : ""}`}><div className="meeting-time"><strong>{formatTime(meeting.startsAt)}</strong><span>{formatTime(meeting.endsAt)}</span></div><i className="meeting-accent" /><div className="meeting-info"><small>{meeting.category}</small><h3>{meeting.title}</h3><p><Video size={14} />{meeting.mode}</p></div><div className="meeting-date">{formatDate(meeting.startsAt)}</div>{onCancel && meeting.status !== "CANCELLED" && <button className="icon-button" onClick={() => onCancel(meeting.id)} title="Cancelar reunião"><X size={17} /></button>}</article>;
}

function Agenda({ meetings, onNew, onCancel }: { meetings: Meeting[]; onNew: () => void; onCancel: (id: string) => void }) {
  const [referenceTime] = useState(() => Date.now());
  const activeMeetings = meetings.filter((item) => new Date(item.endsAt).getTime() > referenceTime - 86400000);
  return <div className="subpage page-enter"><PageHead kicker="Planejamento" title="Agenda empresarial" text="Compromissos compartilhados e verificação automática de conflitos." action="Nova reunião" onAction={onNew} /><section className="calendar-summary"><div><CalendarDays /><span><strong>{activeMeetings.filter((m) => m.status === "CONFIRMED").length}</strong> confirmadas</span></div><div><Clock3 /><span><strong>{activeMeetings.filter((m) => m.status === "CANCELLED").length}</strong> canceladas</span></div><p>Os horários ficam salvos no workspace e disponíveis em qualquer dispositivo.</p></section><section className="panel agenda-panel"><PanelHead kicker="Próximos compromissos" title={`${activeMeetings.length} eventos`} />{activeMeetings.length ? <div className="meeting-list">{activeMeetings.map((meeting) => <MeetingCard key={meeting.id} meeting={meeting} onCancel={onCancel} />)}</div> : <EmptyState icon={<CalendarDays />} title="Nenhuma reunião" text="Você ainda não tem compromissos futuros." action="Agendar agora" onAction={onNew} />}</section></div>;
}

function Chat({ data, busy, onRefresh, onSend, onNewChannel }: { data: WorkspaceData & { profile: Profile; channels: Channel[]; messages: Message[] }; busy: boolean; onRefresh: () => void; onSend: (channelId: string, content: string) => Promise<boolean>; onNewChannel: (name: string) => Promise<boolean> }) {
  const [channelId, setChannelId] = useState(data.channels[0]?.id || "");
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const effectiveChannelId = data.channels.some((channel) => channel.id === channelId) ? channelId : (data.channels[0]?.id || "");
  const roomMessages = data.messages.filter((message) => message.channelId === effectiveChannelId);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [roomMessages.length, effectiveChannelId]);
  async function submit(event: FormEvent) { event.preventDefault(); if (!text.trim() || !effectiveChannelId) return; if (await onSend(effectiveChannelId, text.trim())) { setText(""); onRefresh(); } }
  async function createChannel(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); if (await onNewChannel(String(form.get("name")))) setCreating(false); }
  const current = data.channels.find((channel) => channel.id === effectiveChannelId);
  return <div className="chat-shell page-enter"><aside className="conversation-list"><header><div><span className="section-kicker">Comunicação</span><h2>Mensagens</h2></div><button className="icon-button" onClick={() => setCreating(true)}><Plus /></button></header><label className="chat-search"><Search /><input placeholder="Buscar canal" /></label><span className="conversation-label">Canais da empresa</span>{data.channels.map((channel) => { const last = [...data.messages].reverse().find((message) => message.channelId === channel.id); return <button key={channel.id} className={`conversation ${channel.id === effectiveChannelId ? "active" : ""}`} onClick={() => setChannelId(channel.id)}><span className="channel-avatar">#</span><div><strong>{channel.name}</strong><small>{last?.content || "Canal sem mensagens"}</small></div></button>; })}</aside><section className="chat-room"><header><div><span className="channel-avatar">#</span><div><strong>{current?.name || "Selecione um canal"}</strong><small><i />Chat compartilhado da empresa</small></div></div><button className="icon-button" onClick={onRefresh}><MoreHorizontal /></button></header><div className="messages"><div className="day-divider"><span>Histórico do canal</span></div>{roomMessages.map((message) => <div key={message.id} className={`message-row ${message.senderProfileId === data.profile.id ? "own" : ""}`}><Avatar name={message.senderName} src={message.senderAvatarUrl} small /><div><span><strong>{message.senderName}</strong><time>{formatTime(message.createdAt)}</time></span><p>{message.content}</p></div></div>)}{!roomMessages.length && <EmptyState icon={<MessageCircleMore />} title="Comece a conversa" text="A primeira mensagem aparece para todos deste workspace." />}<div ref={bottom} /></div><form className="composer" onSubmit={submit}><button type="button" title="Anexos em breve"><Paperclip /></button><input value={text} onChange={(event) => setText(event.target.value)} placeholder={current ? `Mensagem em #${current.name}` : "Crie um canal para começar"} disabled={!current || busy} /><button className="send-button" disabled={!text.trim() || busy}><Send /></button></form></section>{creating && <div className="inline-modal"><form onSubmit={createChannel}><header><h3>Novo canal</h3><button type="button" onClick={() => setCreating(false)}><X /></button></header><label>Nome do canal<input autoFocus name="name" required placeholder="Ex.: Marketing" /></label><button className="button button-primary" disabled={busy}>Criar canal</button></form></div>}</div>;
}

function StatusBoard({ statuses, onNew, onView }: { statuses: TeamStatus[]; onNew: () => void; onView: (status: TeamStatus) => void }) {
  return <div className="subpage page-enter"><PageHead kicker="Bastidores da equipe" title="Status" text="Atualizações rápidas em foto, vídeo ou texto, visíveis durante 24 horas." action="Novo status" onAction={onNew} /><div className="status-grid"><button className="status-card create-card" onClick={onNew}><span><ImagePlus /></span><strong>Compartilhar atualização</strong><small>Foto, vídeo ou recado</small></button>{statuses.map((status) => <button className={`status-card media-${status.mediaType.toLowerCase()}`} key={status.id} onClick={() => onView(status)}>{status.mediaType === "IMAGE" && status.mediaUrl ? <img src={status.mediaUrl} alt="" /> : status.mediaType === "VIDEO" && status.mediaUrl ? <video src={status.mediaUrl} muted playsInline /> : <div className="status-quote">“</div>}<div className="status-card-overlay"><Avatar name={status.authorName} src={status.authorAvatarUrl} small /><span><strong>{status.authorName}</strong><small>{relativeTime(status.createdAt)}</small></span></div><p>{status.caption || "Atualização em vídeo"}</p></button>)}</div>{!statuses.length && <section className="panel"><EmptyState icon={<Film />} title="Nenhum status ativo" text="Compartilhe o primeiro momento da equipe." action="Publicar status" onAction={onNew} /></section>}</div>;
}

function Team({ data, onInvite, onMessage }: { data: WorkspaceData & { organization: Organization; members: Member[]; membership: Membership }; onInvite: () => void; onMessage: () => void }) {
  const canInvite = data.membership.role === "OWNER" || data.membership.role === "ADMIN";
  return <div className="subpage page-enter"><PageHead kicker={data.organization.name} title="Equipe" text={`${data.members.filter((member) => member.membershipStatus === "ACTIVE").length} pessoas ativas neste workspace.`} action={canInvite ? "Convidar pessoa" : undefined} onAction={onInvite} /><section className="team-grid">{data.members.map((member) => <article className="member-card" key={member.membershipId}><div className="member-top"><Avatar name={member.name} src={member.avatarUrl} /><span className={`member-status ${member.membershipStatus.toLowerCase()}`}>{member.membershipStatus === "ACTIVE" ? "Ativo" : "Convite pendente"}</span></div><h3>{member.name}</h3><p>{member.jobTitle}</p><small>{member.email}</small><footer><span>{member.membershipRole === "OWNER" ? "Proprietário" : member.membershipRole === "ADMIN" ? "Administrador" : "Colaborador"}</span>{member.membershipStatus === "ACTIVE" && <button onClick={onMessage}><MessageCircleMore />Mensagem</button>}</footer></article>)}</section></div>;
}

function SettingsPage({ data, busy, onSaved, onError, onInvite }: { data: WorkspaceData & { profile: Profile; organization: Organization; membership: Membership }; busy: boolean; onSaved: () => void; onError: (value: string) => void; onInvite: () => void }) {
  const [tab, setTab] = useState<"profile" | "workspace" | "account">("profile");
  const [deleteOpen, setDeleteOpen] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await api("/api/session", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: form.get("name"), jobTitle: form.get("jobTitle"), company: form.get("company") }) }); onSaved(); } catch (error) { onError(error instanceof Error ? error.message : "Falha ao salvar."); } }
  async function avatar(event: React.ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.set("avatar", file); try { await api("/api/avatar", { method: "POST", body: form }); onSaved(); } catch (error) { onError(error instanceof Error ? error.message : "Falha no envio."); } }
  return <div className="subpage page-enter settings-page"><PageHead kicker="Conta e workspace" title="Configurações" text="Gerencie seu perfil, empresa e segurança." /><div className="settings-layout"><nav><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}><Camera />Perfil</button><button className={tab === "workspace" ? "active" : ""} onClick={() => setTab("workspace")}><Users />Workspace</button><button className={tab === "account" ? "active" : ""} onClick={() => setTab("account")}><ShieldCheck />Conta e acesso</button></nav><section className="panel settings-panel">{tab === "profile" && <><PanelHead kicker="Identidade" title="Perfil profissional" /><div className="avatar-editor"><Avatar name={data.profile.name} src={data.profile.avatarUrl} /><label><Upload />Alterar foto<input type="file" accept="image/*" onChange={avatar} /></label><span>JPG, PNG ou WEBP • até 5 MB</span></div><form className="settings-form" onSubmit={save}><label>Nome completo<input name="name" defaultValue={data.profile.name} required /></label><label>Cargo ou função<input name="jobTitle" defaultValue={data.profile.jobTitle} required /></label><input type="hidden" name="company" value={data.organization.name} /><button className="button button-primary" disabled={busy}>Salvar alterações</button></form></>}{tab === "workspace" && <><PanelHead kicker="Organização" title="Dados da empresa" /><form className="settings-form" onSubmit={save}><input type="hidden" name="name" value={data.profile.name} /><input type="hidden" name="jobTitle" value={data.profile.jobTitle} /><label>Nome do workspace<input name="company" defaultValue={data.organization.name} disabled={data.membership.role === "MEMBER"} /></label><label>Endereço do workspace<div className="readonly-input">meetflow.app/{data.organization.slug}</div></label><div className="settings-actions"><button type="button" className="button button-soft" onClick={onInvite}><UserPlus />Adicionar conta</button>{data.membership.role !== "MEMBER" && <button className="button button-primary">Salvar workspace</button>}</div></form></>}{tab === "account" && <><PanelHead kicker="Segurança" title="Conta e acesso" /><div className="account-row"><div><strong>E-mail de acesso</strong><span>{data.profile.email}</span></div><ShieldCheck /></div><div className="account-row"><div><strong>Sessão atual</strong><span>Protegida pelo login da plataforma</span></div><a className="button button-soft" href="/signout-with-chatgpt?return_to=%2F"><LogOut />Sair</a></div><div className="danger-zone"><Trash2 /><div><strong>Excluir conta</strong><p>{data.membership.role === "OWNER" ? "Exclui sua conta e todos os dados deste workspace." : "Remove sua conta deste workspace."}</p></div><button onClick={() => setDeleteOpen(true)}>Excluir conta</button></div></>}</section></div>{deleteOpen && <DeleteAccountModal onClose={() => setDeleteOpen(false)} onError={onError} />}</div>;
}

function PageHead({ kicker, title, text, action, onAction }: { kicker: string; title: string; text: string; action?: string; onAction?: () => void }) { return <section className="page-head"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{text}</p></div>{action && <button className="button button-primary" onClick={onAction}><Plus />{action}</button>}</section>; }
function EmptyState({ icon, title, text, action, onAction }: { icon: React.ReactNode; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{text}</p>{action && <button className="button button-soft" onClick={onAction}>{action}</button>}</div>; }

function Modal({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button onClick={onClose}><X /></button></header>{children}</section></div>; }

function MeetingModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (payload: Record<string, string>) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const date = String(form.get("date")); const start = String(form.get("start")); const end = String(form.get("end")); void onSubmit({ title: String(form.get("title")), category: String(form.get("category")), mode: String(form.get("mode")), guestEmail: String(form.get("guestEmail")), startsAt: new Date(`${date}T${start}`).toISOString(), endsAt: new Date(`${date}T${end}`).toISOString() }); }
  const [tomorrow] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  return <Modal title="Nova reunião" kicker="Agendamento inteligente" onClose={onClose}><form onSubmit={submit}><label>Título<input name="title" required placeholder="Ex.: Alinhamento semanal" /></label><div className="form-row"><label>Data<input name="date" type="date" required defaultValue={tomorrow} /></label><label>Início<input name="start" type="time" required defaultValue="10:00" /></label><label>Término<input name="end" type="time" required defaultValue="10:45" /></label></div><div className="form-row"><label>Categoria<select name="category"><option>Reunião interna</option><option>Reunião comercial</option><option>Entrevista</option><option>Atendimento</option></select></label><label>Local<select name="mode"><option>Videoconferência</option><option>Sala de reunião</option><option>Presencial</option></select></label></div><label>Convidado externo (opcional)<input name="guestEmail" type="email" placeholder="nome@empresa.com" /></label><div className="modal-note"><ShieldCheck />O sistema bloqueia horários conflitantes.</div><footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? "Verificando..." : "Criar reunião"}</button></footer></form></Modal>;
}

function StatusModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (form: FormData) => Promise<void> }) {
  const [fileName, setFileName] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void onSubmit(new FormData(event.currentTarget)); }
  return <Modal title="Novo status" kicker="Visível por 24 horas" onClose={onClose}><form onSubmit={submit}><label className="upload-zone"><ImagePlus /><strong>{fileName || "Adicionar foto ou vídeo"}</strong><span>JPG, PNG, WEBP ou MP4 • até 25 MB</span><input name="media" type="file" accept="image/*,video/*" onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} /></label><label>Legenda<textarea name="caption" rows={4} placeholder="Conte o que está acontecendo..." /></label><footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? "Publicando..." : "Publicar status"}</button></footer></form></Modal>;
}

function InviteModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (payload: { email: string; role: string }) => Promise<void> }) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); void onSubmit({ email: String(form.get("email")), role: String(form.get("role")) }); }
  return <Modal title="Adicionar colaborador" kicker="Equipe" onClose={onClose}><form onSubmit={submit}><label>E-mail profissional<input name="email" type="email" required placeholder="pessoa@empresa.com" /></label><label>Nível de acesso<select name="role"><option value="MEMBER">Colaborador</option><option value="ADMIN">Administrador</option></select></label><div className="modal-note"><UserPlus />A pessoa entrará no workspace ao acessar com este e-mail.</div><footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy ? "Adicionando..." : "Adicionar conta"}</button></footer></form></Modal>;
}

function DeleteAccountModal({ onClose, onError }: { onClose: () => void; onError: (value: string) => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  async function remove() { setBusy(true); try { await api("/api/session", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmation }) }); window.location.href = "/signout-with-chatgpt?return_to=%2F"; } catch (error) { onError(error instanceof Error ? error.message : "Falha ao excluir."); setBusy(false); onClose(); } }
  return <Modal title="Excluir conta" kicker="Ação irreversível" onClose={onClose}><div className="delete-warning"><AlertTriangle /><p>Esta ação não pode ser desfeita. Digite <strong>EXCLUIR</strong> para confirmar.</p></div><label>Confirmação<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="EXCLUIR" /></label><footer><button className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-danger" disabled={confirmation !== "EXCLUIR" || busy} onClick={remove}>{busy ? "Excluindo..." : "Excluir definitivamente"}</button></footer></Modal>;
}

function StatusViewer({ status, onClose }: { status: TeamStatus; onClose: () => void }) {
  return <div className="story-viewer" role="dialog" aria-modal="true"><div className="story-progress"><i /></div><header><div><Avatar name={status.authorName} src={status.authorAvatarUrl} small /><span><strong>{status.authorName}</strong><small>{relativeTime(status.createdAt)}</small></span></div><button onClick={onClose}><X /></button></header><main>{status.mediaType === "IMAGE" && status.mediaUrl ? <img src={status.mediaUrl} alt={status.caption} /> : status.mediaType === "VIDEO" && status.mediaUrl ? <video src={status.mediaUrl} controls autoPlay /> : <div className="story-text"><span>“</span><h2>{status.caption}</h2></div>}</main>{status.mediaType !== "TEXT" && <footer>{status.caption}</footer>}</div>;
}
