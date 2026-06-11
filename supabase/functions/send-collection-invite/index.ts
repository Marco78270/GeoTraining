/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2.108.1";
import {
  createInviteHandler,
  type InviteHandlerDependencies,
} from "./inviteLogic.ts";

function allowedOrigins() {
  return new Set(
    (Deno.env.get("INVITE_ALLOWED_ORIGINS") ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const webhookUrl = Deno.env.get("INVITE_EMAIL_WEBHOOK_URL");
const jsonHeaders = { "Content-Type": "application/json" };

function clientFor(authorization: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const dependencies: InviteHandlerDependencies = {
  allowedOrigins: allowedOrigins(),
  async authenticate(authorization) {
    if (!supabaseUrl || !anonKey) return null;
    const { data, error } = await clientFor(authorization).auth.getUser(
      authorization.slice("Bearer ".length),
    );
    return error || !data.user
      ? null
      : { id: data.user.id, email: data.user.email ?? null };
  },
  async findOwnedCollection(collectionId, userId, authorization) {
    const { data, error } = await clientFor(authorization)
      .from("collections")
      .select("id, name, owner_id")
      .eq("id", collectionId)
      .single();
    return error || data?.owner_id !== userId
      ? null
      : { id: data.id, name: data.name };
  },
  async expireStaleInvitations(collectionId, email, authorization) {
    await clientFor(authorization)
      .from("collection_invitations")
      .update({ status: "expired" })
      .eq("collection_id", collectionId)
      .eq("email", email)
      .eq("status", "pending")
      .lt("expires_at", new Date().toISOString());
  },
  async createInvitation(input, authorization) {
    const { data, error } = await clientFor(authorization)
      .from("collection_invitations")
      .insert({
        collection_id: input.collectionId,
        email: input.email,
        token_hash: input.tokenHash,
        invited_by: input.invitedBy,
        expires_at: input.expiresAt,
      })
      .select("id")
      .single();
    return error || !data ? null : data;
  },
  async deleteInvitation(invitationId, authorization) {
    const { data, error } = await clientFor(authorization)
      .from("collection_invitations")
      .delete()
      .eq("id", invitationId)
      .select("id");
    return !error && data?.length === 1;
  },
  async revokeInvitation(invitationId, authorization) {
    const { data, error } = await clientFor(authorization)
      .from("collection_invitations")
      .update({ status: "revoked" })
      .eq("id", invitationId)
      .eq("status", "pending")
      .select("id");
    return !error && data?.length === 1;
  },
  async sendEmail(input) {
    if (!webhookUrl) return false;
    const providerResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        ...jsonHeaders,
        Authorization: `Bearer ${Deno.env.get("INVITE_EMAIL_WEBHOOK_TOKEN") ?? ""}`,
      },
      body: JSON.stringify({
        to: input.email,
        template: "collection-invitation",
        variables: {
          collectionName: input.collectionName,
          inviteUrl: input.inviteUrl,
          expiresAt: input.expiresAt,
        },
      }),
    });
    return providerResponse.ok;
  },
  createToken,
  hashToken: sha256,
  now: () => new Date(),
  appUrl: Deno.env.get("APP_URL") ?? "http://localhost:5173",
  localMode:
    Deno.env.get("SUPABASE_ENV") === "local" &&
    Deno.env.get("ALLOW_LOCAL_INVITE_LINK") === "true",
  providerConfigured: Boolean(webhookUrl),
};

Deno.serve(createInviteHandler(dependencies));
