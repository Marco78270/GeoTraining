import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  Check,
  CreditCard,
  Globe2,
  GraduationCap,
  Map as MapIcon,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { usePlatformRole } from "../admin/platformRole";
import { useAuth } from "../auth/authContext";
import {
  BillingApiError,
  billingKeys,
  formatBillingPlan,
  formatBillingStatus,
  getBillingApi,
  premiumFeatureCatalog,
  type BillingApi,
} from "../billing/billingApi";

function formatRenewalDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

const premiumRoadmap = [
  "Coach enrichi avec explications plus fines",
  "Sessions chrono dédiées",
  "Révisions intelligentes et priorisation automatique",
];

export function PricingPage({
  billingApi = getBillingApi(),
}: {
  billingApi?: BillingApi;
}) {
  const { signOut, user } = useAuth();
  const platformRole = usePlatformRole();
  const billingQuery = useQuery({
    queryKey: billingKeys.current(),
    queryFn: () => billingApi.loadCurrent(),
  });
  const checkoutMutation = useMutation({
    mutationFn: (planKey: "premium_monthly" | "premium_yearly") =>
      billingApi.startCheckout(planKey),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
  const portalMutation = useMutation({
    mutationFn: () => billingApi.openPortal(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });

  const billing = billingQuery.data;
  const renewalDate = formatRenewalDate(billing?.currentPeriodEnd ?? null);
  const sessionError =
    checkoutMutation.error instanceof BillingApiError
      ? checkoutMutation.error.message
      : portalMutation.error instanceof BillingApiError
        ? portalMutation.error.message
        : "";
  const loadingSession = checkoutMutation.isPending || portalMutation.isPending;

  return (
    <main className="app-shell atlas-module-page pricing-page-shell">
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas"><MapIcon />Atlas</NavLink>
          <NavLink to="/collections"><Bookmark />Collections</NavLink>
          <NavLink to="/training"><GraduationCap />Entraînement</NavLink>
          <NavLink to="/statistics"><BarChart3 />Statistiques</NavLink>
          <NavLink to="/leaderboard"><Trophy />Classement</NavLink>
        </nav>
        <ProfileMenu
          email={user?.email}
          platformRole={platformRole}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="pricing-layout">
        <section className="panel pricing-hero">
          <div className="pricing-hero-copy">
            <p className="eyebrow">Offre actuelle</p>
            <h1>Offres GeoTrainer</h1>
            <p>
              Le premium actuel est volontairement simple: il sert surtout à
              débloquer le défi quotidien officiel et son classement dédié. Les
              fonctionnalités plus ambitieuses restent affichées séparément comme
              roadmap, et ne sont pas vendues comme déjà acquises.
            </p>
            <div className="profile-hero-badges">
              <span className="official-badge">
                <CreditCard aria-hidden="true" />
                {billing ? formatBillingPlan(billing.planKey) : "Chargement du plan"}
              </span>
              <span className="official-badge">
                <ShieldCheck aria-hidden="true" />
                {billing ? formatBillingStatus(billing.status) : "Vérification"}
              </span>
            </div>
            {renewalDate ? (
              <p className="pricing-renewal-note">
                {billing?.cancelAtPeriodEnd
                  ? `Accès conservé jusqu'au ${renewalDate}.`
                  : `Période actuelle jusqu'au ${renewalDate}.`}
              </p>
            ) : null}
          </div>
          <div className="pricing-hero-side">
            <span className="pricing-hero-icon" aria-hidden="true">
              <Sparkles />
            </span>
            <p>
              Le paiement et les droits premium sont déjà séparés proprement dans
              l'application. L'idée maintenant est de faire payer un usage clair,
              pas une promesse floue.
            </p>
          </div>
        </section>

        <section className="pricing-grid" aria-label="Plans disponibles">
          <article className="panel pricing-card">
            <div className="pricing-card-heading">
              <p className="statistics-kicker">Free</p>
              <h2>Gratuit</h2>
              <strong>0 EUR / mois</strong>
            </div>
            <ul className="pricing-feature-list">
              <li><Check aria-hidden="true" />Collections publiques officielles</li>
              <li><Check aria-hidden="true" />Quiz pays et régions</li>
              <li><Check aria-hidden="true" />Statistiques de base</li>
              <li><Check aria-hidden="true" />Classement global par catégorie</li>
              <li><Check aria-hidden="true" />Coach GeoTrainer gratuit basé sur des règles</li>
            </ul>
            <div className="pricing-card-footer">
              <span className="official-badge">Plan actuel par défaut</span>
            </div>
          </article>

          <article className="panel pricing-card pricing-card-premium">
            <div className="pricing-card-heading">
              <p className="statistics-kicker">Premium actuel</p>
              <h2>Premium</h2>
              <strong>1,99 EUR / mois</strong>
              <p>{"D\u00e9fi quotidien officiel + classement du jour"}</p>
            </div>
            <ul className="pricing-feature-list">
              {premiumFeatureCatalog.map((feature) => (
                <li key={feature.key}>
                  <Sparkles aria-hidden="true" />
                  <span>
                    <strong>{feature.title}</strong>
                    <small>{feature.description}</small>
                  </span>
                </li>
              ))}
            </ul>
            <p className="admin-sidebar-note">
              Le coach enrichi, les modes chrono et la révision intelligente ne
              sont pas inclus dans l'offre actuelle.
            </p>
            {sessionError ? (
              <p className="notice notice-error" role="alert">
                {sessionError}
              </p>
            ) : null}
            <div className="pricing-card-footer">
              <button
                type="button"
                className="primary-button"
                disabled={loadingSession}
                onClick={() => checkoutMutation.mutate("premium_monthly")}
              >
                Activer Premium 1,99 EUR / mois
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={loadingSession}
                onClick={() => checkoutMutation.mutate("premium_yearly")}
              >
                Voir l'offre annuelle
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={loadingSession || !billing?.premiumEnabled}
                onClick={() => portalMutation.mutate()}
              >
                Gérer mon abonnement
              </button>
            </div>
          </article>
        </section>

        <section className="panel pricing-hero">
          <div className="pricing-hero-copy">
            <p className="eyebrow">Roadmap</p>
            <h2>Ce qui arrive ensuite</h2>
            <p>
              Cette partie reste visible pour donner la direction du produit, mais
              elle n'entre pas dans la promesse commerciale actuelle.
            </p>
          </div>
          <div className="pricing-hero-side">
            <ul className="pricing-feature-list">
              {premiumRoadmap.map((item) => (
                <li key={item}>
                  <Sparkles aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
