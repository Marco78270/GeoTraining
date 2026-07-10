/* global Deno */
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

const jsonHeaders = {
  "Content-Type": "application/json",
};

function allowedOrigins() {
  const configured = new Set(
    (Deno.env.get("ADMIN_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const appUrl = Deno.env.get("APP_URL")?.trim();
  if (appUrl) {
    try {
      configured.add(new URL(appUrl).origin);
    } catch {
      // A malformed APP_URL is ignored and will not become an allowed origin.
    }
  }

  configured.add("http://127.0.0.1:5173");
  configured.add("http://localhost:5173");
  return configured;
}

function corsHeaders(origin: string | null, originAllowed: boolean) {
  return {
    ...(origin && originAllowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function serviceRoleKey() {
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  let defaultSecretKey = "";
  if (secretKeys) {
    try {
      defaultSecretKey = JSON.parse(secretKeys).default ?? "";
    } catch {
      defaultSecretKey = "";
    }
  }

  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    defaultSecretKey ??
    ""
  );
}

type DeleteUserBody = {
  action: "delete-user";
  userId?: string;
};

type SetRoleBody = {
  action: "set-role";
  userId?: string;
  role?: "admin" | "super_admin";
};

type RemoveRoleBody = {
  action: "remove-role";
  userId?: string;
};

type AdminActionBody = DeleteUserBody | SetRoleBody | RemoveRoleBody;

function response(
  origin: string | null,
  originAllowed: boolean,
  status: number,
  payload: Record<string, unknown>,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...jsonHeaders,
      ...corsHeaders(origin, originAllowed),
    },
  });
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const adminKey = serviceRoleKey();
const rootSuperAdminEmail = "marc.roger@outlook.fr";

function clientForUser(authorization: string) {
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient() {
  return createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  const originAllowed = !origin || allowedOrigins().has(origin);

  if (!originAllowed) {
    return response(origin, false, 403, { error: "admin_origin_not_allowed" });
  }

  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin, true) });
  }

  if (request.method !== "POST") {
    return response(origin, true, 405, { error: "method_not_allowed" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return response(origin, true, 401, { error: "missing_authorization" });
  }

  if (!supabaseUrl || !anonKey || !adminKey) {
    return response(origin, true, 500, { error: "server_misconfigured" });
  }

  const body = (await request.json().catch(() => null)) as AdminActionBody | null;
  if (!body?.action || !("userId" in body) || !body.userId) {
    return response(origin, true, 400, { error: "invalid_request" });
  }

  const userClient = clientForUser(authorization);
  const { data: requesterData, error: requesterError } = await userClient.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (requesterError || !requesterData.user) {
    return response(origin, true, 401, { error: "invalid_session" });
  }

  const supabaseAdmin = adminClient();
  const { data: requesterRoleRow, error: requesterRoleError } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", requesterData.user.id)
    .maybeSingle();
  if (requesterRoleError || requesterRoleRow?.role !== "super_admin") {
    return response(origin, true, 403, { error: "super_admin_required" });
  }

  const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("id", body.userId)
    .maybeSingle();
  if (targetProfileError) {
    return response(origin, true, 500, { error: "profile_lookup_failed" });
  }
  if (!targetProfile) {
    return response(origin, true, 404, { error: "user_not_found" });
  }

  if ((targetProfile.email ?? "").toLowerCase() === rootSuperAdminEmail) {
    return response(origin, true, 403, { error: "root_user_protected" });
  }

  if (targetProfile.id === requesterData.user.id) {
    if (body.action === "delete-user") {
      return response(origin, true, 403, { error: "self_delete_forbidden" });
    }

    return response(origin, true, 403, {
      error: "self_role_change_forbidden",
      message: "Vous ne pouvez pas modifier votre propre role depuis cette page.",
    });
  }

  if (body.action === "set-role") {
    if (body.role !== "admin" && body.role !== "super_admin") {
      return response(origin, true, 400, { error: "invalid_role" });
    }

    const { data: roleRow, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: targetProfile.id,
          role: body.role,
        },
        { onConflict: "user_id" },
      )
      .select("user_id, role")
      .maybeSingle();

    if (roleError) {
      return response(origin, true, 500, {
        error: "role_set_failed",
        message: roleError.message,
      });
    }

    if (!roleRow) {
      return response(origin, true, 500, {
        error: "role_set_noop",
        message: "Le role administrateur n'a pas pu etre enregistre.",
      });
    }

    return response(origin, true, 200, {
      success: true,
      userId: targetProfile.id,
      role: roleRow.role,
    });
  }

  if (body.action === "remove-role") {
    const { data: deletedRoleRow, error: deleteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", targetProfile.id)
      .select("user_id")
      .maybeSingle();

    if (deleteRoleError) {
      return response(origin, true, 500, {
        error: "role_remove_failed",
        message: deleteRoleError.message,
      });
    }

    if (!deletedRoleRow) {
      return response(origin, true, 409, {
        error: "role_remove_noop",
        message: "Le role administrateur n'a pas pu etre retire.",
      });
    }

    return response(origin, true, 200, {
      success: true,
      userId: targetProfile.id,
    });
  }

  const [ownedCollections, authoredClues, sentInvitations] = await Promise.all([
    supabaseAdmin
      .from("collections")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", targetProfile.id),
    supabaseAdmin
      .from("clues")
      .select("id", { count: "exact", head: true })
      .eq("author_id", targetProfile.id),
    supabaseAdmin
      .from("collection_invitations")
      .select("id", { count: "exact", head: true })
      .eq("invited_by", targetProfile.id),
  ]);

  const blockerError =
    ownedCollections.error ?? authoredClues.error ?? sentInvitations.error;
  if (blockerError) {
    return response(origin, true, 500, { error: "dependency_lookup_failed" });
  }

  const blockers = {
    ownedCollections: ownedCollections.count ?? 0,
    authoredClues: authoredClues.count ?? 0,
    sentInvitations: sentInvitations.count ?? 0,
  };
  if (blockers.ownedCollections || blockers.authoredClues || blockers.sentInvitations) {
    return response(origin, true, 409, {
      error: "user_delete_blocked",
      message:
        "Ce compte possède encore des collections, des indices ou des invitations envoyées. Transférez ou supprimez ce contenu avant de supprimer l'utilisateur.",
      blockers,
    });
  }

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetProfile.id);
  if (deleteError) {
    return response(origin, true, 500, {
      error: "user_delete_failed",
      message: deleteError.message,
    });
  }

  return response(origin, true, 200, { success: true, userId: targetProfile.id });
});
