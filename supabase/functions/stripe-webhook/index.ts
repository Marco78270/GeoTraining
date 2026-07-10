/* global Deno */
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.108.1";

function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    apiVersion: "2026-02-25.clover",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function adminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("stripe_webhook_not_configured");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unixToIso(value: number | null | undefined) {
  if (!value) {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function mapPlanKey(
  priceId: string | null | undefined,
  interval: string | null | undefined,
): "free" | "premium_monthly" | "premium_yearly" {
  const monthlyPriceId = Deno.env.get("STRIPE_PREMIUM_MONTHLY_PRICE_ID")?.trim();
  const yearlyPriceId = Deno.env.get("STRIPE_PREMIUM_YEARLY_PRICE_ID")?.trim();

  if (priceId && monthlyPriceId && priceId === monthlyPriceId) {
    return "premium_monthly";
  }

  if (priceId && yearlyPriceId && priceId === yearlyPriceId) {
    return "premium_yearly";
  }

  if (interval === "year") {
    return "premium_yearly";
  }

  if (interval === "month") {
    return "premium_monthly";
  }

  return "free";
}

async function resolveUserIdForCustomer(customerId: string) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.user_id ?? null;
}

async function upsertCustomerMapping(params: {
  userId: string;
  customerId: string;
  email: string | null;
}) {
  const supabase = adminClient();
  const { error } = await supabase.from("billing_customers").upsert(
    {
      user_id: params.userId,
      stripe_customer_id: params.customerId,
      checkout_email: params.email,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw error;
  }
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  if (!customerId) {
    return;
  }

  const metadataUserId = subscription.metadata?.supabase_user_id?.trim() || null;
  const userId = metadataUserId || (await resolveUserIdForCustomer(customerId));
  if (!userId) {
    return;
  }

  const primaryItem = subscription.items.data[0];
  const priceId = primaryItem?.price?.id ?? null;
  const interval = primaryItem?.price?.recurring?.interval ?? null;
  const planKey = mapPlanKey(priceId, interval);

  const supabase = adminClient();
  const { error } = await supabase.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      plan_key: planKey,
      status: subscription.status as
        | "inactive"
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "unpaid",
      cancel_at_period_end: subscription.cancel_at_period_end,
      current_period_start: unixToIso(subscription.current_period_start),
      current_period_end: unixToIso(subscription.current_period_end),
      trial_end: unixToIso(subscription.trial_end),
      metadata: subscription.metadata ?? {},
    },
    { onConflict: "stripe_subscription_id" },
  );

  if (error) {
    throw error;
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const userId = session.metadata?.supabase_user_id?.trim() || null;
  if (!customerId || !userId) {
    return;
  }

  await upsertCustomerMapping({
    userId,
    customerId,
    email: typeof session.customer_details?.email === "string"
      ? session.customer_details.email
      : null,
  });

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!subscriptionId) {
    return;
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
  if (!stripeSecretKey) {
    throw new Error("stripe_webhook_not_configured");
  }
  const stripe = createStripeClient(stripeSecretKey);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncSubscription(subscription);
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription?.id ?? null;
      if (!subscriptionId) {
        return;
      }

      const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
      if (!stripeSecretKey) {
        throw new Error("stripe_webhook_not_configured");
      }
      const stripe = createStripeClient(stripeSecretKey);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(subscription);
      return;
    }
    default:
      return;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY")?.trim();
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")?.trim();
    if (!stripeSecretKey || !webhookSecret) {
      throw new Error("stripe_webhook_not_configured");
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return new Response("missing_signature", { status: 400 });
    }

    const payload = await request.text();
    const stripe = createStripeClient(stripeSecretKey);
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
    );

    await processEvent(event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "stripe_webhook_failed";
    return new Response(message, { status: 400 });
  }
});
