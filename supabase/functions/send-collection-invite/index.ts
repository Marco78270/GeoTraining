/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

type InviteRequest = {
  collectionId?: string;
  email?: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

function allowedOrigins() {
  return new Set(
    (Deno.env.get("INVITE_ALLOWED_ORIGINS") ?? "http://localhost:5173")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function corsHeaders(origin: string | null) {
  const allowed = origin && allowedOrigins().has(origin);
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
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...jsonHeaders, ...corsHeaders(origin) },
  });
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
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

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins().has(origin)) {
    return response(403, { error: "origin_not_allowed" }, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return response(405, { error: "method_not_allowed" }, origin);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(401, { error: "authentication_required" }, origin);
  }

  let body: InviteRequest;
  try {
    body = await request.json();
  } catch {
    return response(400, { error: "invalid_json" }, origin);
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
    return response(400, { error: "invalid_invitation" }, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return response(500, { error: "server_not_configured" }, origin);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(authorization.slice("Bearer ".length));
  if (userError || !user) {
    return response(401, { error: "authentication_required" }, origin);
  }

  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id, name, owner_id")
    .eq("id", collectionId)
    .single();
  if (collectionError || collection?.owner_id !== user.id) {
    return response(403, { error: "owner_required" }, origin);
  }

  const webhookUrl = Deno.env.get("INVITE_EMAIL_WEBHOOK_URL");
  const localMode =
    Deno.env.get("SUPABASE_ENV") === "local" &&
    Deno.env.get("ALLOW_LOCAL_INVITE_LINK") === "true";
  if (!webhookUrl && !localMode) {
    return response(503, { error: "email_provider_not_configured" }, origin);
  }

  const token = createToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("collection_invitations")
    .update({ status: "expired" })
    .eq("collection_id", collectionId)
    .eq("email", email)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());
  const { data: invitation, error: invitationError } = await supabase
    .from("collection_invitations")
    .insert({
      collection_id: collectionId,
      email,
      token_hash: tokenHash,
      invited_by: user.id,
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (invitationError || !invitation) {
    return response(409, { error: "invitation_creation_failed" }, origin);
  }

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:5173";
  const inviteUrl = `${appUrl.replace(/\/$/, "")}/invitations/${encodeURIComponent(token)}`;

  if (webhookUrl) {
    const providerResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        ...jsonHeaders,
        Authorization: `Bearer ${Deno.env.get("INVITE_EMAIL_WEBHOOK_TOKEN") ?? ""}`,
      },
      body: JSON.stringify({
        to: email,
        template: "collection-invitation",
        variables: {
          collectionName: collection.name,
          inviteUrl,
          expiresAt,
        },
      }),
    });
    if (!providerResponse.ok) {
      await supabase
        .from("collection_invitations")
        .delete()
        .eq("id", invitation.id);
      return response(502, { error: "email_delivery_failed" }, origin);
    }
    return response(200, { sent: true }, origin);
  }

  return response(200, { sent: false, inviteUrl }, origin);
});
