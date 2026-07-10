import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

export type BillingPlanKey = Database["public"]["Enums"]["billing_plan_key"];
export type BillingSubscriptionStatus =
  Database["public"]["Enums"]["billing_subscription_status"];
export type PremiumBillingPlanKey = Extract<
  BillingPlanKey,
  "premium_monthly" | "premium_yearly"
>;

export type BillingStatus = {
  planKey: BillingPlanKey;
  status: BillingSubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  premiumEnabled: boolean;
};

export type PremiumFeatureKey =
  | "ai_coach"
  | "daily_quiz"
  | "advanced_statistics"
  | "speedrun"
  | "smart_review";

export const defaultBillingStatus: BillingStatus = {
  planKey: "free",
  status: "inactive",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: null,
  premiumEnabled: false,
};

export const premiumFeatureCatalog: ReadonlyArray<{
  key: PremiumFeatureKey;
  title: string;
  description: string;
}> = [
  {
    key: "daily_quiz",
    title: "Défi quotidien officiel",
    description:
      "Un quiz quotidien prêt à jouer sur la collection officielle, avec meilleure tentative et meilleur chrono.",
  },
  {
    key: "advanced_statistics",
    title: "Classement quotidien dédié",
    description:
      "Un classement séparé pour comparer le défi du jour entre joueurs sur la meilleure tentative.",
  },
];

export const billingKeys = {
  all: ["billing"] as const,
  current: () => [...billingKeys.all, "current"] as const,
};

type BillingStatusRow =
  Database["public"]["Functions"]["get_my_billing_status"]["Returns"][number];

export type BillingDataClient = {
  getBillingStatus(): Promise<BillingStatus>;
  createBillingSession(input: {
    action: "checkout" | "portal";
    planKey?: PremiumBillingPlanKey;
  }): Promise<{ url: string }>;
};

export class BillingApiError extends Error {
  constructor(
    public readonly code:
      | "billing_status_load_failed"
      | "billing_session_create_failed"
      | "billing_configuration_missing",
    cause: unknown,
    message = "Impossible de lancer la gestion de l'abonnement.",
  ) {
    super(message, { cause });
    this.name = "BillingApiError";
  }
}

export function toBillingStatus(
  row: BillingStatusRow | null | undefined,
): BillingStatus {
  if (!row) {
    return defaultBillingStatus;
  }

  return {
    planKey: row.plan_key,
    status: row.status,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    currentPeriodEnd: row.current_period_end,
    premiumEnabled: row.premium_enabled,
  };
}

type SupabaseErrorLike = {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
};

function throwIfError(error: SupabaseErrorLike | null, fallbackCode: string) {
  if (!error) {
    return;
  }

  throw Object.assign(new Error(error.message), {
    code: error.code ?? fallbackCode,
    details: error.details,
    hint: error.hint,
  });
}

export async function readCurrentBillingStatus(
  supabase: SupabaseClient<Database>,
): Promise<BillingStatus> {
  const { data, error } = await supabase.rpc("get_my_billing_status");
  throwIfError(error, "billing_status_load_failed");

  return toBillingStatus(data?.[0]);
}

export function createBillingApi(client: BillingDataClient) {
  return {
    async loadCurrent(): Promise<BillingStatus> {
      return client.getBillingStatus();
    },

    async startCheckout(planKey: PremiumBillingPlanKey) {
      try {
        return await client.createBillingSession({
          action: "checkout",
          planKey,
        });
      } catch (cause) {
        throw mapBillingSessionError(cause);
      }
    },

    async openPortal() {
      try {
        return await client.createBillingSession({
          action: "portal",
        });
      } catch (cause) {
        throw mapBillingSessionError(cause);
      }
    },
  };
}

export function createSupabaseBillingDataClient(
  supabase: SupabaseClient<Database>,
): BillingDataClient {
  return {
    async getBillingStatus() {
      return readCurrentBillingStatus(supabase);
    },

    async createBillingSession(input) {
      const { data, error } = await supabase.functions.invoke("billing-session", {
        body: input,
      });
      throwIfError(error, "billing_session_create_failed");

      if (!data?.url) {
        throw new BillingApiError(
          "billing_session_create_failed",
          new Error("missing_billing_url"),
        );
      }

      return { url: data.url as string };
    },
  };
}

function mapBillingSessionError(cause: unknown) {
  const error = cause as { message?: string; code?: string } | undefined;
  const message = error?.message ?? "";

  if (
    /stripe_not_configured|billing_not_configured|price_not_configured|portal_not_configured/i.test(
      message,
    )
  ) {
    return new BillingApiError(
      "billing_configuration_missing",
      cause,
      "La configuration Stripe n'est pas encore active sur ce projet.",
    );
  }

  return new BillingApiError("billing_session_create_failed", cause);
}

export function isPremiumPlan(planKey: BillingPlanKey) {
  return planKey === "premium_monthly" || planKey === "premium_yearly";
}

export function hasPremiumFeatureAccess(
  billing: BillingStatus,
  featureKey: PremiumFeatureKey,
) {
  switch (featureKey) {
    case "ai_coach":
    case "daily_quiz":
    case "advanced_statistics":
    case "speedrun":
    case "smart_review":
      break;
  }

  if (billing.premiumEnabled) {
    return true;
  }

  return false;
}

export function formatBillingPlan(planKey: BillingPlanKey) {
  switch (planKey) {
    case "premium_monthly":
      return "Premium mensuel";
    case "premium_yearly":
      return "Premium annuel";
    default:
      return "Gratuit";
  }
}

export function formatBillingStatus(status: BillingSubscriptionStatus) {
  switch (status) {
    case "trialing":
      return "Essai";
    case "active":
      return "Actif";
    case "past_due":
      return "Paiement en attente";
    case "canceled":
      return "Résilié";
    case "unpaid":
      return "Impayé";
    default:
      return "Inactif";
  }
}

let defaultBillingApi: ReturnType<typeof createBillingApi> | undefined;

export function getBillingApi() {
  defaultBillingApi ??= createBillingApi(
    createSupabaseBillingDataClient(getSupabaseClient()),
  );
  return defaultBillingApi;
}

export type BillingApi = ReturnType<typeof createBillingApi>;
