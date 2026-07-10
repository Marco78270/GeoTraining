import { describe, expect, it, vi } from "vitest";
import {
  BillingApiError,
  createBillingApi,
  defaultBillingStatus,
  formatBillingPlan,
  formatBillingStatus,
  hasPremiumFeatureAccess,
  toBillingStatus,
} from "./billingApi";

describe("billingApi", () => {
  it("retombe sur un statut gratuit quand Supabase ne renvoie rien", () => {
    expect(toBillingStatus(undefined)).toEqual(defaultBillingStatus);
  });

  it("mappe la ligne SQL vers le modèle front", () => {
    expect(
      toBillingStatus({
        plan_key: "premium_monthly",
        status: "active",
        cancel_at_period_end: true,
        current_period_end: "2026-08-01T00:00:00.000Z",
        premium_enabled: true,
      }),
    ).toEqual({
      planKey: "premium_monthly",
      status: "active",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: "2026-08-01T00:00:00.000Z",
      premiumEnabled: true,
    });
  });

  it("accorde les fonctionnalités premium quand l'accès premium est actif", () => {
    expect(
      hasPremiumFeatureAccess(
        {
          planKey: "premium_yearly",
          status: "active",
          cancelAtPeriodEnd: false,
          currentPeriodEnd: null,
          premiumEnabled: true,
        },
        "ai_coach",
      ),
    ).toBe(true);
  });

  it("charge l'état courant depuis le data client", async () => {
    const dataClient = {
      getBillingStatus: vi.fn(async () => ({
        planKey: "free" as const,
        status: "inactive" as const,
        cancelAtPeriodEnd: false,
        currentPeriodEnd: null,
        premiumEnabled: false,
      })),
      createBillingSession: vi.fn(async () => ({
        url: "https://billing.example.test/checkout",
      })),
    };

    await expect(createBillingApi(dataClient).loadCurrent()).resolves.toEqual({
      planKey: "free",
      status: "inactive",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      premiumEnabled: false,
    });
  });

  it("délègue la création d'une session Checkout", async () => {
    const dataClient = {
      getBillingStatus: vi.fn(async () => defaultBillingStatus),
      createBillingSession: vi.fn(async () => ({
        url: "https://billing.example.test/checkout",
      })),
    };

    await expect(
      createBillingApi(dataClient).startCheckout("premium_monthly"),
    ).resolves.toEqual({
      url: "https://billing.example.test/checkout",
    });

    expect(dataClient.createBillingSession).toHaveBeenCalledWith({
      action: "checkout",
      planKey: "premium_monthly",
    });
  });

  it("remonte une erreur de configuration Stripe lisible", async () => {
    const dataClient = {
      getBillingStatus: vi.fn(async () => defaultBillingStatus),
      createBillingSession: vi.fn(async () => {
        throw Object.assign(new Error("stripe_not_configured"), {
          code: "billing_session_create_failed",
        });
      }),
    };

    const error = await createBillingApi(dataClient)
      .startCheckout("premium_yearly")
      .catch((cause) => cause);

    expect(error).toBeInstanceOf(BillingApiError);
    expect(error).toMatchObject({
      code: "billing_configuration_missing",
    });
  });

  it("formate le plan et le statut pour l'interface", () => {
    expect(formatBillingPlan("premium_monthly")).toBe("Premium mensuel");
    expect(formatBillingStatus("past_due")).toBe("Paiement en attente");
  });
});
