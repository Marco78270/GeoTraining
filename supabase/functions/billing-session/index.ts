/* global Deno */
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

type BillingSessionRequest =
  | {
      action: "checkout";
      planKey: "premium_monthly" | "premium_yearly";
    }
  | {
      action: "portal";
      planKey?: never;
    };

const jsonHeaders = { "Content-Type": "application/json" };

function corsHeaders(origin: string | null) {
  return {
    ...jsonHeaders,
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function allowedOrigins() {
  const configured = new Set(
    (Deno.env.get("BILLING_ALLOWED_ORIGINS") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const appUrl = Deno.env.get("APP_URL")?.trim();
  if (appUrl) {
    try {
      configured.add(new URL(appUrl).origin);
    } catch {
      // Ignore malformed APP_URL here. Runtime validation happens later.
    }
  }

  configured.add("http://127.0.0.1:5173");
  configured.add("http://localhost:5173");
  configured.add("https://127.0.0.1:5173");
  configured.add("https://localhost:5173");

  return configured;
}

function response(body: Record<string, unknown>, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(origin),
  });
}

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function resolveAppUrl() {
  const fallbackUrl = "http://127.0.0.1:5173";
  const value = Deno.env.get("APP_URL")?.trim() || fallbackUrl;

  try {
    return new URL(value);
  } catch {
    throw new Error("billing_not_configured: invalid APP_URL");
  }
}

function requireAuthorization(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("billing_unauthorized");
  }
  return authorization;
}

async function getAuthenticatedUser(authorization: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const token = authorization.slice("Bearer ".length);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    throw new Error("billing_unauthorized");
  }

  return data.user;
}

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("billing_not_configured: missing Supabase service role");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function planPriceId(planKey: "premium_monthly" | "premium_yearly") {
  if (planKey === "premium_monthly") {
    const value = Deno.env.get("STRIPE_PREMIUM_MONTHLY_PRICE_ID")?.trim();
    if (!value) {
      throw new Error("price_not_configured: premium_monthly");
    }
    return value;
  }

  const value = Deno.env.get("STRIPE_PREMIUM_YEARLY_PRICE_ID")?.trim();
  if (!value) {
    throw new Error("price_not_configured: premium_yearly");
  }
  return value;
}

async function ensureCustomer(params: {
  stripe: Stripe;
  user: { id: string; email?: string | null };
}) {
  const supabase = adminClient();

  const { data: existing, error: existingError } = await supabase
    .from("billing_customers")
    .select("user_id, stripe_customer_id, checkout_email")
    .eq("user_id", params.user.id)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id;
  }

  const customer = await params.stripe.customers.create({
    email: params.user.email ?? undefined,
    metadata: {
      supabase_user_id: params.user.id,
    },
  });

  const { error: upsertError } = await supabase.from("billing_customers").upsert(
    {
      user_id: params.user.id,
      stripe_customer_id: customer.id,
      checkout_email: params.user.email ?? null,
    },
    { onConflict: "user_id" },
  );

  if (upsertError) {
    throw upsertError;
  }

  return customer.id;
}

async function createCheckoutSession(params: {
  stripe: Stripe;
  user: { id: string; email?: string | null };
  planKey: "premium_monthly" | "premium_yearly";
}) {
  const customerId = await ensureCustomer(params);
  const appUrl = resolveAppUrl();
  const priceId = planPriceId(params.planKey);

  return params.stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: new URL("/pricing?billing=success", appUrl).toString(),
    cancel_url: new URL("/pricing?billing=cancelled", appUrl).toString(),
    metadata: {
      supabase_user_id: params.user.id,
      requested_plan_key: params.planKey,
    },
    subscription_data: {
      metadata: {
        supabase_user_id: params.user.id,
        requested_plan_key: params.planKey,
      },
    },
  });
}

async function createPortalSession(params: {
  stripe: Stripe;
  user: { id: string; email?: string | null };
}) {
  const customerId = await ensureCustomer(params);
  const appUrl = resolveAppUrl();
  const configuration = Deno.env.get("STRIPE_BILLING_PORTAL_CONFIGURATION_ID")?.trim();

  return params.stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: new URL("/profile", appUrl).toString(),
    configuration: configuration || undefined,
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (origin && !allowedOrigins().has(origin)) {
    return response({ error: "billing_origin_not_allowed" }, 403, origin);
  }

  if (request.method !== "POST") {
    return response({ error: "billing_method_not_allowed" }, 405, origin);
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    if (!stripeSecretKey) {
      throw new Error("stripe_not_configured");
    }

    const authorization = requireAuthorization(request);
    const user = await getAuthenticatedUser(authorization);
    const body = (await request.json()) as BillingSessionRequest;
    const stripe = createStripeClient(stripeSecretKey);

    if (body.action === "checkout") {
      const session = await createCheckoutSession({
        stripe,
        user,
        planKey: body.planKey,
      });
      return response({ url: session.url }, 200, origin);
    }

    if (body.action === "portal") {
      const session = await createPortalSession({
        stripe,
        user,
      });
      return response({ url: session.url }, 200, origin);
    }

    return response({ error: "billing_action_invalid" }, 400, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "billing_session_failed";
    const status =
      message === "billing_unauthorized"
        ? 401
        : /not_configured|price_not_configured/.test(message)
          ? 503
          : 400;

    return response({ error: message }, status, origin);
  }
});
