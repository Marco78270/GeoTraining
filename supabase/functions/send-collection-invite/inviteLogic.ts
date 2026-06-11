export type InviteUser = {
  id: string;
  email: string | null;
};

export type OwnedCollection = {
  id: string;
  name: string;
};

export type InviteHandlerDependencies = {
  allowedOrigins: Set<string>;
  authenticate(authorization: string): Promise<InviteUser | null>;
  findOwnedCollection(
    collectionId: string,
    userId: string,
    authorization: string,
  ): Promise<OwnedCollection | null>;
  expireStaleInvitations(
    collectionId: string,
    email: string,
    authorization: string,
  ): Promise<void>;
  createInvitation(input: {
    collectionId: string;
    email: string;
    tokenHash: string;
    invitedBy: string;
    expiresAt: string;
  }, authorization: string): Promise<{ id: string } | null>;
  deleteInvitation(
    invitationId: string,
    authorization: string,
  ): Promise<boolean>;
  revokeInvitation(
    invitationId: string,
    authorization: string,
  ): Promise<boolean>;
  sendEmail(input: {
    email: string;
    collectionName: string;
    inviteUrl: string;
    expiresAt: string;
  }): Promise<boolean>;
  createToken(): string;
  hashToken(token: string): Promise<string>;
  now(): Date;
  appUrl: string;
  localMode: boolean;
  providerConfigured: boolean;
};

type InviteRequest = {
  collectionId?: string;
  email?: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function corsHeaders(origin: string | null, allowedOrigins: Set<string>) {
  const allowed = origin && allowedOrigins.has(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function response(
  status: number,
  body: Record<string, unknown>,
  origin: string | null,
  allowedOrigins: Set<string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(origin, allowedOrigins) },
  });
}

export function createInviteHandler(deps: InviteHandlerDependencies) {
  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("origin");
    if (origin && !deps.allowedOrigins.has(origin)) {
      return response(
        403,
        { error: "origin_not_allowed" },
        origin,
        deps.allowedOrigins,
      );
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin, deps.allowedOrigins),
      });
    }
    if (request.method !== "POST") {
      return response(
        405,
        { error: "method_not_allowed" },
        origin,
        deps.allowedOrigins,
      );
    }

    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return response(
        401,
        { error: "authentication_required" },
        origin,
        deps.allowedOrigins,
      );
    }

    let body: InviteRequest;
    try {
      body = await request.json();
    } catch {
      return response(
        400,
        { error: "invalid_json" },
        origin,
        deps.allowedOrigins,
      );
    }

    const collectionId = body.collectionId?.trim();
    const email = normalizeEmail(body.email ?? "");
    if (
      !collectionId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        collectionId,
      ) ||
      !email
    ) {
      return response(
        400,
        { error: "invalid_invitation" },
        origin,
        deps.allowedOrigins,
      );
    }

    const user = await deps.authenticate(authorization);
    if (!user) {
      return response(
        401,
        { error: "authentication_required" },
        origin,
        deps.allowedOrigins,
      );
    }

    const collection = await deps.findOwnedCollection(
      collectionId,
      user.id,
      authorization,
    );
    if (!collection) {
      return response(
        403,
        { error: "owner_required" },
        origin,
        deps.allowedOrigins,
      );
    }

    if (!deps.providerConfigured && !deps.localMode) {
      return response(
        503,
        { error: "email_provider_not_configured" },
        origin,
        deps.allowedOrigins,
      );
    }

    const token = deps.createToken();
    const tokenHash = await deps.hashToken(token);
    const expiresAt = new Date(
      deps.now().getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await deps.expireStaleInvitations(collectionId, email, authorization);
    const invitation = await deps.createInvitation({
      collectionId,
      email,
      tokenHash,
      invitedBy: user.id,
      expiresAt,
    }, authorization);
    if (!invitation) {
      return response(
        409,
        { error: "invitation_creation_failed" },
        origin,
        deps.allowedOrigins,
      );
    }

    const inviteUrl = `${deps.appUrl.replace(/\/$/, "")}/invitations/${encodeURIComponent(token)}`;
    if (deps.providerConfigured) {
      const sent = await deps
        .sendEmail({
          email,
          collectionName: collection.name,
          inviteUrl,
          expiresAt,
        })
        .catch(() => false);
      if (!sent) {
        const deleted = await deps.deleteInvitation(
          invitation.id,
          authorization,
        );
        if (!deleted) {
          const revoked = await deps.revokeInvitation(
            invitation.id,
            authorization,
          );
          return response(
            502,
            {
              error: revoked
                ? "email_delivery_cleanup_failed"
                : "email_delivery_cleanup_unresolved",
              invitationId: invitation.id,
            },
            origin,
            deps.allowedOrigins,
          );
        }
        return response(
          502,
          {
            error: "email_delivery_failed",
            invitationId: invitation.id,
          },
          origin,
          deps.allowedOrigins,
        );
      }
      return response(200, { sent: true }, origin, deps.allowedOrigins);
    }

    return response(
      200,
      { sent: false, inviteUrl },
      origin,
      deps.allowedOrigins,
    );
  };
}
