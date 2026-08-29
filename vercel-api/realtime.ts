import { Rest } from "ably";
import type { AuthenticatedUser } from "./auth.js";

let client: Rest | undefined;

function apiKey() {
  return process.env.ABLY_API_KEY?.trim() || "";
}

function restClient() {
  const key = apiKey();
  if (!key) return null;
  client ??= new Rest({ key });
  return client;
}

export function realtimeConfigured() {
  return Boolean(apiKey());
}

export function chatChannel(organizationId: string, channelId: string) {
  return `meetflow:${organizationId}:chat:${channelId}`;
}

export function notificationChannel(organizationId: string, userId: string) {
  return `meetflow:${organizationId}:user:${userId}`;
}

export async function realtimeToken(user: AuthenticatedUser, channelIds: string[]) {
  const rest = restClient();
  if (!rest) return null;
  const capability: Record<string, string[]> = {
    [notificationChannel(user.organizationId, user.id)]: ["subscribe"],
  };
  for (const channelId of channelIds) {
    capability[chatChannel(user.organizationId, channelId)] = ["subscribe"];
  }
  return await rest.auth.requestToken({
    clientId: user.id,
    ttl: 60 * 60 * 1000,
    capability: JSON.stringify(capability),
  });
}

export async function publishRealtime(channelName: string, event: string, data: Record<string, unknown>) {
  const rest = restClient();
  if (!rest) return;
  try {
    await rest.channels.get(channelName).publish(event, data);
  } catch (error) {
    console.error("MeetFlow realtime publish error", error);
  }
}
