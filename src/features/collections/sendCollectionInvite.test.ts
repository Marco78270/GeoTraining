import { describe, expect, it, vi } from "vitest";
import {
  createInviteHandler,
  type InviteHandlerDependencies,
} from "../../../supabase/functions/send-collection-invite/inviteLogic";

const requestBody = {
  collectionId: "30000000-0000-4000-8000-000000000001",
  email: "editor@example.com",
};

function dependencies(
  overrides: Partial<InviteHandlerDependencies> = {},
): InviteHandlerDependencies {
  return {
    allowedOrigins: new Set(["https://atlas.example.com"]),
    authenticate: vi.fn().mockResolvedValue({
      id: "owner-1",
      email: "owner@example.com",
    }),
    findOwnedCollection: vi.fn().mockResolvedValue({
      id: requestBody.collectionId,
      name: "STOP",
    }),
    expireStaleInvitations: vi.fn().mockResolvedValue(undefined),
    createInvitation: vi.fn().mockResolvedValue({ id: "invitation-1" }),
    deleteInvitation: vi.fn().mockResolvedValue(true),
    revokeInvitation: vi.fn().mockResolvedValue(true),
    sendEmail: vi.fn().mockResolvedValue(true),
    createToken: () => "raw-token-with-at-least-thirty-two-characters",
    hashToken: vi.fn().mockResolvedValue("hashed-token"),
    now: () => new Date("2026-06-10T12:00:00Z"),
    appUrl: "https://atlas.example.com",
    localMode: false,
    providerConfigured: true,
    ...overrides,
  };
}

function post(origin = "https://atlas.example.com") {
  return new Request("https://functions.example.com/send-collection-invite", {
    method: "POST",
    headers: {
      origin,
      authorization: "Bearer valid-token",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });
}

describe("send collection invite handler", () => {
  it("rejects an untrusted origin before authentication", async () => {
    const deps = dependencies();
    const response = await createInviteHandler(deps)(
      post("https://evil.example.com"),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it("requires collection ownership", async () => {
    const deps = dependencies({
      findOwnedCollection: vi.fn().mockResolvedValue(null),
    });
    const response = await createInviteHandler(deps)(post());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "owner_required" });
    expect(deps.createInvitation).not.toHaveBeenCalled();
  });

  it("removes the invitation when provider delivery fails", async () => {
    const deps = dependencies({
      sendEmail: vi.fn().mockResolvedValue(false),
    });
    const response = await createInviteHandler(deps)(post());

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "email_delivery_failed",
      invitationId: "invitation-1",
    });
    expect(deps.deleteInvitation).toHaveBeenCalledWith(
      "invitation-1",
      "Bearer valid-token",
    );
    expect(deps.revokeInvitation).not.toHaveBeenCalled();
  });

  it("also cleans up when the provider request throws", async () => {
    const deps = dependencies({
      sendEmail: vi.fn().mockRejectedValue(new Error("provider offline")),
    });
    const response = await createInviteHandler(deps)(post());

    expect(response.status).toBe(502);
    expect(deps.deleteInvitation).toHaveBeenCalled();
  });

  it("revokes the invitation and reports cleanup failure without exposing the token", async () => {
    const deps = dependencies({
      sendEmail: vi.fn().mockResolvedValue(false),
      deleteInvitation: vi.fn().mockResolvedValue(false),
    });
    const response = await createInviteHandler(deps)(post());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: "email_delivery_cleanup_failed",
      invitationId: "invitation-1",
    });
    expect(JSON.stringify(body)).not.toContain("raw-token");
    expect(deps.revokeInvitation).toHaveBeenCalledWith(
      "invitation-1",
      "Bearer valid-token",
    );
  });
});
