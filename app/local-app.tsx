"use client";
/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, ChevronRight, Clock3, Hash,
  Home, ImagePlus, Loader2, LogOut, Menu, MessageCircle, Plus, Send, Settings,
  ShieldCheck, Sparkles, Trash2, UserPlus, Users, Video, X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthUser, Channel, ChatMessage, MeetFlowApi, Meeting, TeamMember, TeamStatus, meetFlowApi,
} from "./lib/meetflow-api";

const SESSION_KEY = "meetflow.local.session";
type Session = { token: string; user: AuthUser };
type View = "inicio" | "agenda" | "chat" | "status" | "equipe" | "configuracoes";
type Modal = "meeting" | "channel" | "status" | "member" | "delete" | null;

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.floor(hours / 24)} d`;
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
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) { queueMicrotask(() => setSession(null)); return; }
    try {
      const saved = JSON.parse(raw) as Session;
      meetFlowApi.authenticated(saved.token).me().then((user) => setSession({ token: saved.token, user }))
        .catch(() => { window.localStorage.removeItem(SESSION_KEY); setSession(null); });
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
      queueMicrotask(() => setSession(null));
    }
  }, []);

  const saveSession = (next: Session | null) => {
    if (next) window.localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(SESSION_KEY);
    setSession(next);
  };

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = mode === "login"
        ? await meetFlowApi.login(String(form.get("email")), String(form.get("password")))
        : await meetFlowApi.register({
            name: String(form.get("name")), email: String(form.get("email")),
            password: String(form.get("password")), organizationName: String(form.get("organizationName")),
          });
      onAuthenticated(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível continuar"); }
    finally { setBusy(false); }
  }

  return (
    <main className="local-auth-shell">
      <aside className="local-auth-aside">
        <a className="brand" href="#"><span className="brand-mark"><Sparkles /></span>MeetFlow</a>
        <div><span className="hero-pill"><span /> AMBIENTE EMPRESARIAL</span><h1>Sua empresa conectada, organizada e em movimento.</h1><p>Reuniões, conversas, colaboradores e atualizações em um workspace privado com dados persistentes.</p></div>
        <footer><ShieldCheck /> Seus dados ficam isolados por empresa</footer>
      </aside>
      <section className="local-auth-card">
        <div className="auth-tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Entrar</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Criar empresa</button></div>
        <span className="section-kicker">{mode === "login" ? "BEM-VINDO DE VOLTA" : "COMECE SEU WORKSPACE"}</span>
        <h2>{mode === "login" ? "Acesse sua conta" : "Cadastre sua empresa"}</h2>
        <p>{mode === "login" ? "Entre com o e-mail e a senha cadastrados." : "Você será o primeiro administrador da empresa."}</p>
        {error && <div className="form-error">{error}</div>}
        <form onSubmit={submit}>
          {mode === "register" && <><label>Seu nome<input name="name" required maxLength={120} placeholder="Matheus Costa" /></label><label>Nome da empresa<input name="organizationName" required maxLength={120} placeholder="Minha Empresa" /></label></>}
          <label>E-mail profissional<input name="email" required type="email" autoComplete="email" placeholder="voce@empresa.com" /></label>
          <label>Senha<input name="password" required type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="Mínimo de 8 caracteres" /></label>
          <button className="button button-primary button-wide" disabled={busy}>{busy ? <Loader2 className="spin" /> : mode === "login" ? "Entrar no MeetFlow" : "Criar workspace"}</button>
        </form>
        <small><CheckCircle2 /> Conta real conectada ao PostgreSQL</small>
      </section>
    </main>
  );
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
  const [activeChannel, setActiveChannel] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [story, setStory] = useState<TeamStatus | null>(null);

  const showError = (reason: unknown) => setError(reason instanceof Error ? reason.message : "Algo deu errado");
  const refresh = useCallback(async () => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString();
    const to = new Date(Date.now() + 365 * 86400000).toISOString();
    try {
      const [meetingData, channelData, memberData, statusData] = await Promise.all([
        api.meetings(from, to), api.channels(), api.team(), api.statuses(),
      ]);
      setMeetings(meetingData); setChannels(channelData); setMembers(memberData); setStatuses(statusData);
      setActiveChannel((current) => current || channelData[0]?.id || "");
    } catch (reason) { showError(reason); }
    finally { setLoading(false); }
  }, [api]);

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => {
    if (!activeChannel) return;
    let alive = true;
    const load = () => api.messages(activeChannel).then((data) => alive && setMessages(data)).catch(showError);
    void load();
    const timer = window.setInterval(load, 4000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activeChannel, api]);

  function switchView(next: View) { setView(next); setSidebar(false); }
  function replaceUser(next: AuthUser) {
    setUser(next);
    onSession({ token: session.token, user: next });
  }
  function logout() { onSession(null); }

  const activeMeetings = meetings.filter((item) => item.status !== "CANCELLED" && new Date(item.endAt) >= new Date());
  const title = nav.find((item) => item.id === view)?.label ?? (view === "configuracoes" ? "Configurações" : "MeetFlow");

  if (loading) return <Loading label="Carregando dados reais" />;
  return (
    <main className="app-shell">
      {sidebar && <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setSidebar(false)} />}
      <aside className={`sidebar${sidebar ? " sidebar-open" : ""}`}>
        <div className="sidebar-brand"><span className="brand-mark"><Sparkles /></span>MeetFlow<button onClick={() => setSidebar(false)} aria-label="Fechar menu"><X /></button></div>
        <div className="workspace-card"><span className="avatar avatar-fallback">{initials(user.organizationName)}</span><div><strong>{user.organizationName}</strong><span>Workspace empresarial</span></div></div>
        <nav className="main-nav"><span>MENU PRINCIPAL</span>{nav.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => switchView(item.id)}><item.icon />{item.label}{item.id === "chat" && messages.length > 0 && <em>{messages.length}</em>}</button>)}</nav>
        <div className="sidebar-footer"><button className={view === "configuracoes" ? "active" : ""} onClick={() => switchView("configuracoes")}><Settings />Configurações</button><button onClick={logout}><LogOut />Sair</button></div>
        <div className="sidebar-profile"><Avatar name={user.name} url={user.avatarUrl} api={api} /><div><strong>{user.name}</strong><span>{user.jobTitle}</span></div></div>
      </aside>
      <section className="main-area">
        <header className="topbar"><div className="topbar-title"><button className="menu-button" onClick={() => setSidebar(true)}><Menu /></button><div><span>{user.organizationName}</span><h1>{title}</h1></div></div><div className="topbar-actions"><span className="local-live"><i /> PostgreSQL conectado</span><button className="button button-primary" onClick={() => setModal("meeting")}><Plus /> Nova reunião</button></div></header>
        {error && <div className="error-banner"><AlertTriangle /><span>{error}</span><button onClick={() => setError("")}><X /></button></div>}
        <div className="content page-enter">
          {view === "inicio" && <Overview user={user} meetings={activeMeetings} channels={channels} statuses={statuses} members={members} onNavigate={switchView} onMeeting={() => setModal("meeting")} onStatus={() => setModal("status")} onStory={setStory} />}
          {view === "agenda" && <Agenda meetings={meetings} onCreate={() => setModal("meeting")} onCancel={async (meeting) => { const reason = window.prompt("Motivo do cancelamento:", "Reunião cancelada pela equipe"); if (!reason) return; try { await api.cancelMeeting(meeting.id, reason); await refresh(); } catch (cause) { showError(cause); } }} />}
          {view === "chat" && <Chat channels={channels} activeChannel={activeChannel} onChannel={setActiveChannel} messages={messages} user={user} api={api} onNewChannel={() => setModal("channel")} onSent={async () => setMessages(await api.messages(activeChannel))} onError={showError} />}
          {view === "status" && <Statuses statuses={statuses} api={api} user={user} onCreate={() => setModal("status")} onStory={setStory} onDelete={async (id) => { try { await api.deleteStatus(id); await refresh(); } catch (cause) { showError(cause); } }} />}
          {view === "equipe" && <Team members={members} api={api} currentUserId={user.id} canAdd={user.role === "ADMIN"} onAdd={() => setModal("member")} onRemove={async (id) => { if (!window.confirm("Desativar o acesso deste colaborador?")) return; try { await api.removeMember(id); await refresh(); } catch (cause) { showError(cause); } }} />}
          {view === "configuracoes" && <ProfileSettings user={user} api={api} onUser={replaceUser} onLogout={logout} onDelete={() => setModal("delete")} onError={showError} />}
        </div>
      </section>
      <nav className="mobile-nav">{nav.slice(0, 4).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => switchView(item.id)}><item.icon />{item.label}</button>)}<button className={view === "configuracoes" ? "active" : ""} onClick={() => switchView("configuracoes")}><Settings />Ajustes</button></nav>
      {modal === "meeting" && <MeetingModal members={members.filter((member) => member.active)} onClose={() => setModal(null)} onSave={async (input) => { await api.createMeeting(input); setModal(null); await refresh(); }} onError={showError} />}
      {modal === "channel" && <SimpleModal title="Novo canal" kicker="CHAT DA EQUIPE" onClose={() => setModal(null)} onSubmit={async (form) => { const channel = await api.createChannel(String(form.get("name"))); setModal(null); await refresh(); setActiveChannel(channel.id); }} onError={showError}><label>Nome do canal<input name="name" required maxLength={100} placeholder="Ex.: Comercial" /></label></SimpleModal>}
      {modal === "status" && <StatusModal onClose={() => setModal(null)} onSave={async (caption, file) => { await api.publishStatus(caption, file); setModal(null); await refresh(); }} onError={showError} />}
      {modal === "member" && <MemberModal onClose={() => setModal(null)} onSave={async (input) => { await api.addMember(input); setModal(null); await refresh(); }} onError={showError} />}
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

function Chat({ channels, activeChannel, onChannel, messages, user, api, onNewChannel, onSent, onError }: { channels: Channel[]; activeChannel: string; onChannel: (id: string) => void; messages: ChatMessage[]; user: AuthUser; api: MeetFlowApi; onNewChannel: () => void; onSent: () => Promise<void>; onError: (reason: unknown) => void }) {
  const [content, setContent] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const current = channels.find((channel) => channel.id === activeChannel);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages]);
  async function send(event: FormEvent) { event.preventDefault(); if (!content.trim() || !activeChannel) return; const value = content; setContent(""); try { await api.sendMessage(activeChannel, value); await onSent(); } catch (reason) { setContent(value); onError(reason); } }
  return <section className="chat-shell"><aside className="conversation-list"><header><div><span className="section-kicker">CONVERSAS</span><h2>Canais</h2></div><button className="icon-button" onClick={onNewChannel} title="Novo canal"><Plus /></button></header><span className="conversation-label">CANAIS DA EMPRESA</span>{channels.map((channel) => <button key={channel.id} className={`conversation${activeChannel === channel.id ? " active" : ""}`} onClick={() => onChannel(channel.id)}><span className="channel-avatar"><Hash /></span><div><strong>{channel.name}</strong><small>Canal compartilhado</small></div></button>)}</aside><article className="chat-room"><header><div><span className="channel-avatar"><Hash /></span><div><strong>{current?.name ?? "Selecione um canal"}</strong><small><i /> equipe online</small></div></div></header><div className="messages"><div className="day-divider"><span>Mensagens</span></div>{messages.length ? messages.map((message) => <div key={message.id} className={`message-row${message.senderId === user.id ? " own" : ""}`}><Avatar name={message.senderName} api={api} small /><div><span><strong>{message.senderName}</strong><time>{formatTime(message.createdAt)}</time></span><p>{message.content}</p></div></div>) : <Empty icon={MessageCircle} title="Comece a conversa" text="As mensagens aparecerão para todos neste canal." />}<div ref={endRef} /></div><form className="composer" onSubmit={send}><input value={content} onChange={(event) => setContent(event.target.value)} maxLength={4000} placeholder={`Mensagem em #${current?.name ?? "canal"}`} disabled={!current} /><button className="send-button" aria-label="Enviar mensagem" disabled={!content.trim()}><Send /></button></form></article></section>;
}

function Statuses({ statuses, api, user, onCreate, onStory, onDelete }: { statuses: TeamStatus[]; api: MeetFlowApi; user: AuthUser; onCreate: () => void; onStory: (status: TeamStatus) => void; onDelete: (id: string) => void }) {
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">ATUALIZAÇÕES EM 24 HORAS</span><h2>Status da equipe</h2><p>Compartilhe novidades rápidas em texto, foto ou vídeo.</p></div><button className="button button-primary" onClick={onCreate}><ImagePlus /> Publicar status</button></div><div className="status-grid"><button className="status-card create-card" onClick={onCreate}><span><Plus /></span><strong>Novo status</strong><small>Imagem, vídeo ou texto</small></button>{statuses.map((status) => <article className="status-card" key={status.id} onClick={() => onStory(status)} role="button" tabIndex={0}>{status.mediaType === "IMAGE" && status.mediaUrl && <img src={api.mediaUrl(status.mediaUrl)} alt="Status" />}{status.mediaType === "VIDEO" && status.mediaUrl && <video src={api.mediaUrl(status.mediaUrl)} muted />}{status.mediaType === "TEXT" && <span className="status-quote">“</span>}<div className="status-card-overlay"><span className="avatar avatar-fallback">{initials(status.authorName)}</span><span><strong>{status.authorName}</strong><small>{relativeTime(status.createdAt)}</small></span>{status.authorId === user.id && <button className="status-delete" onClick={(event) => { event.stopPropagation(); onDelete(status.id); }}><Trash2 /></button>}</div><p>{status.caption}</p></article>)}</div></section>;
}

function Team({ members, api, currentUserId, canAdd, onAdd, onRemove }: { members: TeamMember[]; api: MeetFlowApi; currentUserId: string; canAdd: boolean; onAdd: () => void; onRemove: (id: string) => void }) {
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">PESSOAS DA EMPRESA</span><h2>Colaboradores</h2><p>Cada pessoa possui sua própria conta e acesso ao workspace.</p></div>{canAdd && <button className="button button-primary" onClick={onAdd}><UserPlus /> Adicionar colaborador</button>}</div><div className="team-grid">{members.map((member) => <article className="member-card" key={member.id}><div className="member-top"><Avatar name={member.name} url={member.avatarUrl} api={api} /><span className={`member-status${member.active ? "" : " pending"}`}>{member.active ? "Ativo" : "Removido"}</span></div><h3>{member.name}</h3><p>{member.jobTitle}</p><small>{member.email}</small><footer><span>{member.role === "ADMIN" ? "Administrador" : "Colaborador"}</span>{canAdd && member.active && member.id !== currentUserId ? <button onClick={() => onRemove(member.id)}><Trash2 /> Desativar</button> : <ShieldCheck />}</footer></article>)}</div></section>;
}

function ProfileSettings({ user, api, onUser, onLogout, onDelete, onError }: { user: AuthUser; api: MeetFlowApi; onUser: (user: AuthUser) => void; onLogout: () => void; onDelete: () => void; onError: (reason: unknown) => void }) {
  const [saved, setSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  async function update(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaved(false); const form = new FormData(event.currentTarget); try { onUser(await api.updateProfile({ name: String(form.get("name")), jobTitle: String(form.get("jobTitle")), organizationName: String(form.get("organizationName")) })); setSaved(true); } catch (reason) { onError(reason); } }
  async function avatar(file?: File) { if (!file) return; try { onUser(await api.uploadAvatar(file)); } catch (reason) { onError(reason); } }
  async function password(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPasswordSaved(false); const form = new FormData(event.currentTarget); try { await api.changePassword(String(form.get("currentPassword")), String(form.get("newPassword"))); event.currentTarget.reset(); setPasswordSaved(true); } catch (reason) { onError(reason); } }
  return <section className="subpage"><div className="page-head"><div><span className="section-kicker">SUA CONTA</span><h2>Configurações</h2><p>Atualize seus dados, foto e preferências de acesso.</p></div></div><div className="settings-layout"><nav><button className="active"><Users /> Perfil</button><button onClick={onLogout}><LogOut /> Sair da conta</button></nav><div className="settings-stack"><section className="panel settings-panel"><div className="panel-head"><div><span className="section-kicker">IDENTIDADE</span><h3>Perfil profissional</h3></div>{saved && <span className="save-success"><CheckCircle2 /> Salvo</span>}</div><div className="avatar-editor"><Avatar name={user.name} url={user.avatarUrl} api={api} /><label><ImagePlus /> Alterar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void avatar(event.target.files?.[0])} /></label><span>JPG, PNG ou WebP, com até 5 MB.</span></div><form className="settings-form" onSubmit={update}><label>Nome completo<input name="name" required defaultValue={user.name} maxLength={120} /></label><label>Cargo<input name="jobTitle" required defaultValue={user.jobTitle} maxLength={120} /></label><label>E-mail<div className="readonly-input">{user.email}</div></label><label>Empresa<input name="organizationName" required defaultValue={user.organizationName} maxLength={120} readOnly={user.role !== "ADMIN"} /></label><div className="settings-actions"><button className="button button-primary">Salvar alterações</button><button type="button" className="button button-soft" onClick={onLogout}>Sair</button></div></form></section><section className="panel password-panel"><div className="panel-head"><div><span className="section-kicker">SEGURANÇA</span><h3>Alterar senha</h3></div>{passwordSaved && <span className="save-success"><CheckCircle2 /> Senha alterada</span>}</div><form onSubmit={password}><label>Senha atual<input name="currentPassword" type="password" required /></label><label>Nova senha<input name="newPassword" type="password" required minLength={8} /></label><button className="button button-dark">Atualizar senha</button></form></section><div className="danger-zone"><AlertTriangle /><div><strong>Excluir minha conta</strong><p>Desativa seu acesso permanentemente sem apagar o histórico empresarial.</p></div><button onClick={onDelete}>Excluir conta</button></div></div></div></section>;
}

function MeetingModal({ members, onClose, onSave, onError }: { members: TeamMember[]; onClose: () => void; onSave: (input: Record<string, unknown>) => Promise<void>; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  const start = localDateTime(1), end = localDateTime(2);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); const form = new FormData(event.currentTarget); const emails = String(form.get("guests") || "").split(",").map((email) => email.trim()).filter(Boolean); try { await onSave({ title: String(form.get("title")), ownerId: String(form.get("ownerId")), startAt: new Date(String(form.get("startAt"))).toISOString(), endAt: new Date(String(form.get("endAt"))).toISOString(), mode: String(form.get("mode")), location: String(form.get("location")), notes: String(form.get("notes")), guests: emails.map((email) => ({ name: email.split("@")[0], email })) }); } catch (reason) { onError(reason); } finally { setBusy(false); } }
  return <div className="modal-backdrop"><section className="modal"><header><div><span className="section-kicker">AGENDA EMPRESARIAL</span><h2>Nova reunião</h2></div><button onClick={onClose}><X /></button></header><form onSubmit={submit}><label>Título<input name="title" required maxLength={160} placeholder="Alinhamento semanal" /></label><label>Responsável<select name="ownerId" required>{members.map((member) => <option value={member.id} key={member.id}>{member.name} — {member.jobTitle}</option>)}</select></label><div className="form-row two"><label>Início<input name="startAt" type="datetime-local" required defaultValue={start} /></label><label>Término<input name="endAt" type="datetime-local" required defaultValue={end} /></label></div><div className="form-row two"><label>Formato<select name="mode"><option value="VIDEO">Videoconferência</option><option value="IN_PERSON">Presencial</option></select></label><label>Local ou link<input name="location" maxLength={300} placeholder="Sala 2 ou link" /></label></div><label>Convidados por e-mail<input name="guests" placeholder="ana@empresa.com, joao@cliente.com" /></label><label>Observações<textarea name="notes" rows={3} maxLength={2000} placeholder="Pauta e informações importantes" /></label><div className="modal-note"><ShieldCheck /> O sistema impede dois compromissos no mesmo horário para o responsável.</div><footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy && <Loader2 className="spin" />}Criar reunião</button></footer></form></section></div>;
}

function SimpleModal({ title, kicker, children, onClose, onSubmit, onError }: { title: string; kicker: string; children: ReactNode; onClose: () => void; onSubmit: (form: FormData) => Promise<void>; onError: (reason: unknown) => void }) {
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); try { await onSubmit(new FormData(event.currentTarget)); } catch (reason) { onError(reason); } finally { setBusy(false); } }
  return <div className="modal-backdrop"><section className="modal modal-small"><header><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button onClick={onClose}><X /></button></header><form onSubmit={submit}>{children}<footer><button type="button" className="button button-soft" onClick={onClose}>Cancelar</button><button className="button button-primary" disabled={busy}>{busy && <Loader2 className="spin" />}Salvar</button></footer></form></section></div>;
}

function StatusModal({ onClose, onSave, onError }: { onClose: () => void; onSave: (caption: string, file?: File) => Promise<void>; onError: (reason: unknown) => void }) {
  const [file, setFile] = useState<File>();
  return <SimpleModal title="Publicar status" kicker="VISÍVEL POR 24 HORAS" onClose={onClose} onError={onError} onSubmit={async (form) => onSave(String(form.get("caption")), file)}><label className="upload-zone"><ImagePlus /><strong>{file ? file.name : "Escolher foto ou vídeo"}</strong><span>JPG, PNG, WebP, MP4, MOV ou WebM</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" onChange={(event) => setFile(event.target.files?.[0])} /></label><label>Legenda<textarea name="caption" rows={4} maxLength={1000} placeholder="Conte uma novidade para sua equipe..." /></label></SimpleModal>;
}

function MemberModal({ onClose, onSave, onError }: { onClose: () => void; onSave: (input: { name: string; email: string; password: string; jobTitle: string; role: "ADMIN" | "MEMBER" }) => Promise<void>; onError: (reason: unknown) => void }) {
  return <SimpleModal title="Novo colaborador" kicker="CONTA DA EQUIPE" onClose={onClose} onError={onError} onSubmit={async (form) => onSave({ name: String(form.get("name")), email: String(form.get("email")), password: String(form.get("password")), jobTitle: String(form.get("jobTitle")), role: String(form.get("role")) as "ADMIN" | "MEMBER" })}><div className="form-row two"><label>Nome<input name="name" required maxLength={120} /></label><label>Cargo<input name="jobTitle" required maxLength={120} placeholder="Analista comercial" /></label></div><label>E-mail<input name="email" type="email" required /></label><label>Senha inicial<input name="password" type="password" required minLength={8} placeholder="Mínimo de 8 caracteres" /></label><label>Permissão<select name="role"><option value="MEMBER">Colaborador</option><option value="ADMIN">Administrador</option></select></label><div className="modal-note"><ShieldCheck /> A pessoa poderá entrar imediatamente usando este e-mail e senha.</div></SimpleModal>;
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
