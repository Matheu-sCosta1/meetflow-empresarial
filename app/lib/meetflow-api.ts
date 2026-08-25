export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
  jobTitle: string;
  avatarUrl?: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

export type AuthResponse = { token: string; user: AuthUser };

export type Meeting = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  mode: string;
  location?: string;
  ownerId: string;
  ownerName: string;
  participants: Array<{ name: string; email: string }>;
};

export type Channel = {
  id: string;
  name: string;
  type: "GROUP" | "DIRECT";
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  createdAt: string;
};
export type ChatReply = { id: string; senderName: string; content: string; deleted: boolean };
export type ChatMessage = {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: string;
  attachmentUrl?: string;
  replyTo?: ChatReply;
  editedAt?: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  link?: string;
  readAt?: string;
  createdAt: string;
};
export type RealtimeConfig = { enabled: boolean };
export type TeamStatus = { id: string; authorId: string; authorName: string; mediaType: "IMAGE" | "VIDEO" | "TEXT"; mediaUrl?: string; caption?: string; createdAt: string; expiresAt: string };
export type TeamMember = { id: string; name: string; email: string; role: "ADMIN" | "MEMBER"; jobTitle: string; avatarUrl?: string; active: boolean };

function defaultApiUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (typeof window !== "undefined") {
    const localHost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    return localHost ? `${window.location.protocol}//${window.location.hostname}:8080/api` : "/api";
  }
  return "http://localhost:8080/api";
}

export class MeetFlowApi {
  constructor(
    private readonly baseUrl = defaultApiUrl(),
    private readonly token?: string,
  ) {}

  authenticated(token: string) { return new MeetFlowApi(this.baseUrl, token); }

  register(input: { name: string; jobTitle: string; email: string; password: string; organizationName: string; acceptTerms: boolean }) {
    return this.request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });
  }

  login(email: string, password: string, remember = false) {
    return this.request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password, remember }) });
  }

  requestPasswordReset(email: string) {
    return this.request<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
  }

  resetPassword(token: string, newPassword: string) {
    return this.request<{ message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, newPassword }) });
  }

  me() { return this.request<AuthUser>("/auth/me"); }

  meetings(from: string, to: string) {
    return this.request<Meeting[]>(`/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  createMeeting(input: Record<string, unknown>) {
    return this.request<Meeting>("/meetings", { method: "POST", body: JSON.stringify(input) });
  }

  cancelMeeting(id: string, reason: string) {
    return this.request<Meeting>(`/meetings/${id}/cancel`, { method: "PATCH", body: JSON.stringify({ reason }) });
  }

  channels() { return this.request<Channel[]>("/chat/channels"); }
  createChannel(name: string) {
    return this.request<Channel>("/chat/channels", { method: "POST", body: JSON.stringify({ name, type: "GROUP" }) });
  }
  messages(channelId: string) { return this.request<ChatMessage[]>(`/chat/channels/${channelId}/messages`); }
  sendMessage(channelId: string, content: string, replyToId?: string) {
    return this.request<ChatMessage>(`/chat/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, messageType: "TEXT", replyToId }),
    });
  }
  editMessage(channelId: string, messageId: string, content: string) {
    return this.request<ChatMessage>(`/chat/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    });
  }
  deleteMessage(channelId: string, messageId: string) {
    return this.request<ChatMessage>(`/chat/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });
  }
  markChannelRead(channelId: string) {
    return this.request<void>(`/chat/channels/${channelId}/read`, { method: "POST" });
  }

  notifications() { return this.request<AppNotification[]>("/notifications"); }
  markNotificationRead(id: string) {
    return this.request<AppNotification>(`/notifications/${id}/read`, { method: "POST" });
  }
  markAllNotificationsRead() {
    return this.request<void>("/notifications/read-all", { method: "POST" });
  }

  realtimeConfig() { return this.request<RealtimeConfig>("/realtime/config"); }
  realtimeAuthOptions() {
    return {
      authUrl: `${this.baseUrl}/realtime/token`,
      authHeaders: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
    };
  }
  chatRealtimeChannel(organizationId: string, channelId: string) {
    return `meetflow:${organizationId}:chat:${channelId}`;
  }
  notificationRealtimeChannel(organizationId: string, userId: string) {
    return `meetflow:${organizationId}:user:${userId}`;
  }

  statuses() { return this.request<TeamStatus[]>("/statuses"); }
  publishStatus(caption: string, file?: File) {
    const body = new FormData();
    body.append("caption", caption);
    if (file) body.append("file", file);
    return this.request<TeamStatus>("/statuses", { method: "POST", body }, false);
  }

  deleteStatus(id: string) { return this.request<void>(`/statuses/${id}`, { method: "DELETE" }); }

  team() { return this.request<TeamMember[]>("/team"); }
  addMember(input: { name: string; email: string; password: string; jobTitle: string; role: "ADMIN" | "MEMBER" }) {
    return this.request<TeamMember>("/team", { method: "POST", body: JSON.stringify(input) });
  }
  removeMember(id: string) { return this.request<void>(`/team/${id}`, { method: "DELETE" }); }

  updateProfile(input: { name: string; jobTitle: string; organizationName?: string }) {
    return this.request<AuthUser>("/account/profile", { method: "PATCH", body: JSON.stringify(input) });
  }

  uploadAvatar(file: File) {
    const body = new FormData();
    body.append("file", file);
    return this.request<AuthUser>("/account/avatar", { method: "POST", body }, false);
  }

  deleteAccount() {
    return this.request<void>("/account", { method: "DELETE", body: JSON.stringify({ confirmation: "EXCLUIR" }) });
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.request<void>("/account/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) });
  }

  mediaUrl(path?: string) {
    if (!path) return undefined;
    if (/^https?:\/\//.test(path)) return path;
    return `${this.baseUrl.replace(/\/api\/?$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  }

  private async request<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
    const headers = new Headers(init.headers);
    if (json && init.body) headers.set("Content-Type", "application/json");
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`);
    const url = `${this.baseUrl}${path}`;
    let response: Response;
    try {
      response = await fetch(url, { ...init, headers });
    } catch {
      throw new Error("Não foi possível conectar ao MeetFlow. Verifique sua internet e tente novamente.");
    }
    if (!response.ok) {
      const problem = await response.json().catch(() => null) as { detail?: string; error?: string } | null;
      const message = problem?.detail || problem?.error;
      if (message) throw new Error(message);
      if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
      if (response.status === 413) throw new Error("O arquivo é grande demais. Fotos são otimizadas automaticamente e vídeos devem ter até 3 MB.");
      if (response.status === 415) throw new Error("Este formato de arquivo não é compatível com o MeetFlow.");
      if (response.status === 404) throw new Error("O serviço do MeetFlow não foi encontrado. Atualize a página e tente novamente.");
      if (response.status >= 500) throw new Error("O MeetFlow está temporariamente indisponível. Tente novamente em instantes.");
      throw new Error(`Não foi possível concluir a operação (erro ${response.status}).`);
    }
    if (response.status === 204) return undefined as T;
    try {
      return await response.json() as T;
    } catch {
      throw new Error("O MeetFlow recebeu uma resposta inválida. Atualize a página e tente novamente.");
    }
  }
}

export const meetFlowApi = new MeetFlowApi();
