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

export type Channel = { id: string; name: string; type: "GROUP" | "DIRECT"; createdAt: string };
export type ChatMessage = { id: string; channelId: string; senderId: string; senderName: string; content: string; messageType: string; attachmentUrl?: string; createdAt: string };
export type TeamStatus = { id: string; authorId: string; authorName: string; mediaType: "IMAGE" | "VIDEO" | "TEXT"; mediaUrl?: string; caption?: string; createdAt: string; expiresAt: string };
export type TeamMember = { id: string; name: string; email: string; role: "ADMIN" | "MEMBER"; jobTitle: string; avatarUrl?: string; active: boolean };

function defaultApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:8080/api`;
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
  sendMessage(channelId: string, content: string) {
    return this.request<ChatMessage>(`/chat/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, messageType: "TEXT" }),
    });
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
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const problem = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(problem?.detail ?? `Erro ${response.status} ao acessar a API`);
    }
    return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
  }
}

export const meetFlowApi = new MeetFlowApi();
