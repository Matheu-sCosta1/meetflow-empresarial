import { and, asc, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { channels, meetings, memberships, messages, organizations, profiles, statuses } from "../../../db/schema";
import { getRuntimeBindings } from "../../../runtime/env";
import {
  ApiError,
  cleanText,
  getWorkspaceContext,
  jsonError,
  mediaUrl,
  requireAdmin,
  requireIdentity,
  requireWorkspace,
  slugify,
} from "../../lib/server/workspace";

export async function GET() {
  try {
    const context = await getWorkspaceContext();
    if (!context.profile || !context.membership || !context.organization) {
      return Response.json({
        identity: context.identity,
        profile: context.profile,
        needsOnboarding: true,
      });
    }

    const db = getDb();
    const organizationId = context.organization.id;
    const [memberRows, meetingRows, channelRows, messageRows, statusRows] = await Promise.all([
      db
        .select({
          membershipId: memberships.id,
          profileId: memberships.profileId,
          email: memberships.inviteEmail,
          membershipRole: memberships.role,
          membershipStatus: memberships.status,
          name: profiles.name,
          jobTitle: profiles.jobTitle,
          avatarKey: profiles.avatarKey,
        })
        .from(memberships)
        .leftJoin(profiles, eq(memberships.profileId, profiles.id))
        .where(eq(memberships.organizationId, organizationId))
        .orderBy(asc(memberships.createdAt)),
      db.select().from(meetings).where(eq(meetings.organizationId, organizationId)).orderBy(asc(meetings.startsAt)).limit(60),
      db.select().from(channels).where(eq(channels.organizationId, organizationId)).orderBy(asc(channels.createdAt)),
      db
        .select({
          id: messages.id,
          channelId: messages.channelId,
          content: messages.content,
          createdAt: messages.createdAt,
          senderProfileId: messages.senderProfileId,
          senderName: profiles.name,
          senderAvatarKey: profiles.avatarKey,
        })
        .from(messages)
        .leftJoin(profiles, eq(messages.senderProfileId, profiles.id))
        .where(eq(messages.organizationId, organizationId))
        .orderBy(desc(messages.createdAt))
        .limit(160),
      db
        .select({
          id: statuses.id,
          caption: statuses.caption,
          mediaKey: statuses.mediaKey,
          mediaType: statuses.mediaType,
          createdAt: statuses.createdAt,
          expiresAt: statuses.expiresAt,
          authorProfileId: statuses.authorProfileId,
          authorName: profiles.name,
          authorAvatarKey: profiles.avatarKey,
        })
        .from(statuses)
        .leftJoin(profiles, eq(statuses.authorProfileId, profiles.id))
        .where(and(eq(statuses.organizationId, organizationId), gt(statuses.expiresAt, new Date().toISOString())))
        .orderBy(desc(statuses.createdAt))
        .limit(40),
    ]);

    return Response.json({
      identity: context.identity,
      needsOnboarding: false,
      profile: { ...context.profile, avatarUrl: mediaUrl(context.profile.avatarKey) },
      membership: context.membership,
      organization: context.organization,
      members: memberRows.map((member) => ({
        ...member,
        name: member.name ?? member.email,
        jobTitle: member.jobTitle ?? "Convite pendente",
        avatarUrl: mediaUrl(member.avatarKey),
      })),
      meetings: meetingRows,
      channels: channelRows,
      messages: messageRows.reverse().map((message) => ({
        ...message,
        senderName: message.senderName ?? "Conta removida",
        senderAvatarUrl: mediaUrl(message.senderAvatarKey),
      })),
      statuses: statusRows.map((status) => ({
        ...status,
        authorName: status.authorName ?? "Conta removida",
        authorAvatarUrl: mediaUrl(status.authorAvatarKey),
        mediaUrl: mediaUrl(status.mediaKey),
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireIdentity();
    const payload = (await request.json()) as { name?: string; jobTitle?: string; company?: string };
    const name = cleanText(payload.name, 90);
    const jobTitle = cleanText(payload.jobTitle, 90) || "Administrador";
    const company = cleanText(payload.company, 100);
    if (name.length < 2 || company.length < 2) throw new ApiError(400, "Informe seu nome e o nome da empresa.");

    const db = getDb();
    const existing = await getWorkspaceContext();
    if (existing.organization) throw new ApiError(409, "Seu cadastro já foi concluído.");

    const profileId = existing.profile?.id ?? crypto.randomUUID();
    if (!existing.profile) {
      await db.insert(profiles).values({ id: profileId, email: identity.email, name, jobTitle });
    } else {
      await db.update(profiles).set({ name, jobTitle, updatedAt: new Date().toISOString() }).where(eq(profiles.id, profileId));
    }

    const [pendingInvite] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.inviteEmail, identity.email), eq(memberships.status, "PENDING")))
      .limit(1);

    if (pendingInvite) {
      await db
        .update(memberships)
        .set({ profileId, status: "ACTIVE" })
        .where(eq(memberships.id, pendingInvite.id));
      return Response.json({ joinedExistingWorkspace: true }, { status: 201 });
    }

    const organizationId = crypto.randomUUID();
    await db.insert(organizations).values({
      id: organizationId,
      name: company,
      slug: slugify(company),
      ownerProfileId: profileId,
    });
    await db.insert(memberships).values({
      id: crypto.randomUUID(),
      organizationId,
      profileId,
      inviteEmail: identity.email,
      role: "OWNER",
      status: "ACTIVE",
    });
    const channelId = crypto.randomUUID();
    await db.insert(channels).values({
      id: channelId,
      organizationId,
      name: "Geral",
      kind: "GROUP",
      createdByProfileId: profileId,
    });
    await db.insert(messages).values({
      id: crypto.randomUUID(),
      organizationId,
      channelId,
      senderProfileId: profileId,
      content: `Bem-vindos à ${company}! Este é o canal geral da equipe.`,
    });
    return Response.json({ created: true }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as { name?: string; jobTitle?: string; company?: string };
    const name = cleanText(payload.name, 90);
    const jobTitle = cleanText(payload.jobTitle, 90);
    const company = cleanText(payload.company, 100);
    if (name.length < 2 || jobTitle.length < 2) throw new ApiError(400, "Nome e cargo são obrigatórios.");
    const db = getDb();
    await db.update(profiles).set({ name, jobTitle, updatedAt: new Date().toISOString() }).where(eq(profiles.id, context.profile.id));
    if (company && company !== context.organization.name) {
      requireAdmin(context.membership.role);
      await db.update(organizations).set({ name: company }).where(eq(organizations.id, context.organization.id));
    }
    return Response.json({ updated: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireWorkspace();
    const payload = (await request.json()) as { confirmation?: string };
    if (payload.confirmation !== "EXCLUIR") throw new ApiError(400, "Digite EXCLUIR para confirmar.");
    const db = getDb();
    const organizationId = context.organization.id;
    if (context.membership.role === "OWNER") {
      await db.delete(messages).where(eq(messages.organizationId, organizationId));
      await db.delete(statuses).where(eq(statuses.organizationId, organizationId));
      await db.delete(meetings).where(eq(meetings.organizationId, organizationId));
      await db.delete(channels).where(eq(channels.organizationId, organizationId));
      await db.delete(memberships).where(eq(memberships.organizationId, organizationId));
      await db.delete(organizations).where(eq(organizations.id, organizationId));
      const bucket = getRuntimeBindings().BUCKET;
      const objects = await bucket.list({ prefix: `org/${organizationId}/` });
      if (objects.objects.length) await bucket.delete(objects.objects.map((object) => object.key));
    } else {
      await db.delete(memberships).where(eq(memberships.id, context.membership.id));
    }
    await db.delete(profiles).where(eq(profiles.id, context.profile.id));
    return Response.json({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
