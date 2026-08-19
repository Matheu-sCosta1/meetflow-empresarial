export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "MEMBER";
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

export class MeetFlowApi {
  constructor(
    private readonly baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api",
    private readonly token?: string,
  ) {}

  authenticated(token: string) { return new MeetFlowApi(this.baseUrl, token); }

  register(input: { name: string; email: string; password: string; organizationName: string }) {
    return this.request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(input) });
  }

  login(email: string, password: string) {
    return this.request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  }

  me() { return this.request<AuthUser>("/auth/me"); }

  meetings(from: string, to: string) {
    return this.request<Meeting[]>(`/meetings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  createMeeting(input: Record<string, unknown>) {
    return this.request<Meeting>("/meetings", { method: "POST", body: JSON.stringify(input) });
  }

  channels() { return this.request<Channel[]>("/chat/channels"); }
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
