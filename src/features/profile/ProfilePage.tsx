import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  CheckCircle2,
  CreditCard,
  Globe2,
  GraduationCap,
  ImagePlus,
  Mail,
  Map,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
} from "lucide-react";
import { useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ProfileMenu } from "../admin/ProfileMenu";
import { usePlatformRole } from "../admin/platformRole";
import { useAuth } from "../auth/authContext";
import { prepareAvatar } from "./avatarImage";
import {
  formatBillingPlan,
  formatBillingStatus,
  isPremiumPlan,
} from "../billing/billingApi";
import {
  getProfileApi,
  profileKeys,
  ProfileApiError,
  type ProfileApi,
} from "./profileApi";
import { RankProgressCard } from "../ranking/RankProgressCard";

function profileCauseMessage(error: ProfileApiError) {
  const cause = error.cause as
    | { message?: string; details?: string | null; hint?: string | null }
    | undefined;

  return [cause?.message, cause?.details, cause?.hint].filter(Boolean).join(" ");
}

function profileErrorMessage(error: unknown) {
  if (!(error instanceof ProfileApiError)) {
    return "Impossible de mettre a jour le profil.";
  }

  if (error.code === "username_taken") {
    return "Ce nom d'utilisateur est deja utilise.";
  }

  if (error.code === "username_cooldown") {
    return "Une modification est possible tous les 30 jours.";
  }

  if (error.code === "email_update_failed") {
    return "Impossible de lancer le changement d'email.";
  }

  if (error.code === "avatar_upload_failed") {
    const causeMessage = profileCauseMessage(error);

    if (/bucket/i.test(causeMessage) && /avatars/i.test(causeMessage)) {
      return "Le bucket Supabase 'avatars' n'est pas disponible sur ce projet.";
    }

    if (/row-level security|permission denied|not allowed/i.test(causeMessage)) {
      return "Les politiques Supabase des avatars ne sont pas appliquees sur ce projet.";
    }

    if (/mime type/i.test(causeMessage) && /webp/i.test(causeMessage)) {
      return "Le bucket avatars n'autorise pas encore le format WebP sur ce projet.";
    }

    return "Impossible d'envoyer l'avatar.";
  }

  return "Impossible de mettre a jour le profil.";
}

function pastedImageFile(items: DataTransferItemList) {
  return Array.from(items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .find((file): file is File => file instanceof File);
}

function profileRoleLabel(platformRole: ReturnType<typeof usePlatformRole>) {
  if (platformRole === "super_admin") {
    return "Super admin";
  }

  if (platformRole === "admin") {
    return "Admin";
  }

  return "Membre";
}

function formatProfileDate(value: string | null) {
  if (!value) {
    return "Date indisponible";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date indisponible";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function ProfilePage({ api = getProfileApi() }: { api?: ProfileApi }) {
  const { signOut, user } = useAuth();
  const platformRole = usePlatformRole();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [usernameDraft, setUsernameDraft] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [usernameNotice, setUsernameNotice] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [emailNotice, setEmailNotice] = useState("");
  const [emailError, setEmailError] = useState("");
  const [avatarError, setAvatarError] = useState("");

  const profileQuery = useQuery({
    queryKey: profileKeys.current(),
    queryFn: () => api.load(),
  });
  const profile = profileQuery.data;
  const username = usernameDraft ?? profile?.username ?? "";
  const email = emailDraft ?? profile?.email ?? "";
  const profileRole = profileRoleLabel(platformRole);
  const currentXp = profile?.xpTotal ?? 0;
  const premiumEnabled = Boolean(profile?.billing.premiumEnabled);

  function updateCachedProfile(nextProfile: Awaited<ReturnType<ProfileApi["load"]>>) {
    queryClient.setQueryData(profileKeys.current(), nextProfile);
  }

  const usernameMutation = useMutation({
    mutationFn: (nextUsername: string) => api.updateUsername(nextUsername),
    onSuccess: (nextProfile) => {
      updateCachedProfile(nextProfile);
      setUsernameDraft(nextProfile.username);
      setUsernameError("");
      setUsernameNotice("Nom d'utilisateur mis a jour.");
    },
    onError: (error) => {
      setUsernameNotice("");
      setUsernameError(profileErrorMessage(error));
    },
  });

  const emailMutation = useMutation({
    mutationFn: (nextEmail: string) => api.requestEmailChange(nextEmail),
    onSuccess: () => {
      setEmailError("");
      setEmailNotice(
        "Supabase va envoyer un email de confirmation pour valider cette nouvelle adresse.",
      );
    },
    onError: (error) => {
      setEmailNotice("");
      setEmailError(profileErrorMessage(error));
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: (visible: boolean) => api.updateLeaderboardVisibility(visible),
    onSuccess: (nextProfile) => {
      updateCachedProfile(nextProfile);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      const blob = await prepareAvatar(file);
      return api.replaceAvatar(blob, "webp");
    },
    onSuccess: (nextProfile) => {
      updateCachedProfile(nextProfile);
      setAvatarError("");
    },
    onError: (error) => {
      setAvatarError(profileErrorMessage(error));
    },
  });

  const removeAvatarMutation = useMutation({
    mutationFn: () => api.removeAvatar(),
    onSuccess: (nextProfile) => {
      updateCachedProfile(nextProfile);
      setAvatarError("");
    },
    onError: (error) => {
      setAvatarError(profileErrorMessage(error));
    },
  });

  async function handleAvatarFile(file: File | null | undefined) {
    if (!file) {
      return;
    }

    setAvatarError("");
    await avatarMutation.mutateAsync(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  return (
    <main className="app-shell atlas-module-page profile-page-shell">
      <header className="topbar atlas-topbar">
        <Link className="brand brand-link" to="/atlas" aria-label="GeoTrainer Atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <nav className="atlas-nav" aria-label="Navigation principale">
          <NavLink to="/atlas"><Map />Atlas</NavLink>
          <NavLink to="/collections"><Bookmark />Collections</NavLink>
          <NavLink to="/training"><GraduationCap />Entrainement</NavLink>
          <NavLink to="/statistics"><BarChart3 />Statistiques</NavLink>
          <NavLink to="/leaderboard"><Trophy />Classement</NavLink>
          {platformRole === "admin" || platformRole === "super_admin" ? (
            <NavLink to="/admin"><ShieldCheck />Administration</NavLink>
          ) : null}
        </nav>
        <ProfileMenu
          email={user?.email}
          platformRole={platformRole}
          profileApi={api}
          onSignOut={() => {
            void signOut();
          }}
        />
      </header>

      <div className="profile-page">
        <section className="panel profile-identity-card">
          <div className="profile-hero">
            <div className="profile-avatar-preview" aria-hidden="true">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : <UserRound />}
            </div>

            <div className="profile-hero-copy">
              <p className="eyebrow">Compte</p>
              <h1>Mon profil</h1>
              <strong className="profile-hero-username">
                {profile?.username ?? "Chargement..."}
              </strong>
              <span className="profile-hero-email">{profile?.email ?? user?.email ?? ""}</span>

              <div className="profile-hero-badges">
                <span className="official-badge">
                  <ShieldCheck aria-hidden="true" />
                  {profileRole}
                </span>
                <span
                  className={`profile-premium-badge ${premiumEnabled ? "is-active" : ""}`}
                >
                  <CreditCard aria-hidden="true" />
                  Premium
                </span>
                <span className="official-badge">
                  <Sparkles aria-hidden="true" />
                  {profile?.leaderboardVisible ? "Visible au classement" : "Masque au classement"}
                </span>
              </div>

              <p className="profile-intro">
                Gere ton identite publique, ton avatar et ta presence dans les classements sans quitter l'univers GeoTrainer.
              </p>
            </div>
          </div>

          <div className="profile-summary-grid" aria-label="Resume du profil">
            <article className="profile-summary-card">
              <span>Avatar</span>
              <strong>{profile?.avatarUrl ? "Configure" : "A ajouter"}</strong>
              <small>
                {profile?.avatarUrl
                  ? "Pret pour le profil et le classement."
                  : "Ajoute une image pour personnaliser ton compte."}
              </small>
            </article>
            <article className="profile-summary-card">
              <span>Pseudo</span>
              <strong>{profile?.username ? "Actif" : "A definir"}</strong>
              <small>
                Derniere mise a jour: {formatProfileDate(profile?.usernameChangedAt ?? null)}
              </small>
            </article>
            <article className="profile-summary-card">
              <span>Classements</span>
              <strong>{profile?.leaderboardVisible ? "Inclus" : "Prive"}</strong>
              <small>
                {profile?.leaderboardVisible
                  ? "Tes futurs resultats pourront apparaitre publiquement."
                  : "Tes performances restent visibles seulement pour toi."}
              </small>
            </article>
            <article className="profile-summary-card">
              <span>Abonnement</span>
              <strong>{formatBillingPlan(profile?.billing.planKey ?? "free")}</strong>
              <small>
                {profile
                  ? formatBillingStatus(profile.billing.status)
                  : "Chargement du statut d'abonnement."}
              </small>
            </article>
          </div>
        </section>

        <section className="profile-settings-grid">
          <RankProgressCard
            className="panel profile-rank-card"
            heading="Progression globale"
            xp={currentXp}
          />

          <section className="panel profile-settings-card profile-settings-card-accent">
            <div className="profile-card-heading">
              <h2>Avatar</h2>
              <p>
                Le plus rapide: glisse une image, colle-la depuis le presse-papiers, ou choisis-la depuis ton appareil.
              </p>
            </div>

            <div className="profile-avatar-block">
              <label
                className="profile-avatar-dropzone"
                onPaste={(event) => {
                  const file = pastedImageFile(event.clipboardData.items);
                  if (file) {
                    void handleAvatarFile(file);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void handleAvatarFile(event.dataTransfer.files[0]);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Choisir un avatar"
                  onChange={(event) => {
                    void handleAvatarFile(event.target.files?.[0]);
                  }}
                />
                <ImagePlus aria-hidden="true" />
                <strong>Choisir un avatar</strong>
                <span>Glisse une image ici ou colle-la directement.</span>
                <small>JPEG, PNG ou WebP, 5 Mo maximum.</small>
              </label>

              <button
                type="button"
                className="secondary-button profile-inline-button"
                disabled={!profile?.avatarUrl || removeAvatarMutation.isPending}
                onClick={() => removeAvatarMutation.mutate()}
              >
                <Trash2 aria-hidden="true" />
                Retirer l'avatar
              </button>
              {avatarError ? (
                <p className="field-error" role="alert">
                  {avatarError}
                </p>
              ) : null}
            </div>
          </section>

          <form
            className="panel profile-settings-card"
            aria-labelledby="username-heading"
            onSubmit={(event) => {
              event.preventDefault();
              setUsernameNotice("");
              usernameMutation.mutate(username);
            }}
          >
            <div className="profile-card-heading">
              <h2 id="username-heading">Nom d'utilisateur</h2>
              <p>Visible par les autres utilisateurs. Modification possible tous les 30 jours.</p>
            </div>
            <label>
              <span>Nom d'utilisateur</span>
              <input
                value={username}
                onChange={(event) => setUsernameDraft(event.target.value)}
                aria-label="Nom d'utilisateur"
              />
            </label>
            {usernameNotice ? <p className="notice notice-success">{usernameNotice}</p> : null}
            {usernameError ? (
              <p className="field-error" role="alert">
                {usernameError}
              </p>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={usernameMutation.isPending}
            >
              Enregistrer le nom
            </button>
          </form>

          <form
            className="panel profile-settings-card"
            aria-labelledby="email-heading"
            onSubmit={(event) => {
              event.preventDefault();
              setEmailNotice("");
              emailMutation.mutate(email);
            }}
          >
            <div className="profile-card-heading">
              <h2 id="email-heading">Adresse email</h2>
              <p>Cette information reste privee. Une confirmation Supabase sera demandee avant validation.</p>
            </div>
            <label>
              <span>Adresse email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmailDraft(event.target.value)}
                aria-label="Adresse email"
              />
            </label>
            {emailNotice ? <p className="notice notice-success">{emailNotice}</p> : null}
            {emailError ? (
              <p className="field-error" role="alert">
                {emailError}
              </p>
            ) : null}
            <button
              type="submit"
              className="primary-button"
              disabled={emailMutation.isPending}
            >
              <Mail aria-hidden="true" />
              Mettre a jour l'email
            </button>
          </form>

          <section
            className="panel profile-settings-card"
            aria-labelledby="leaderboard-privacy-heading"
          >
            <div className="profile-card-heading">
              <h2 id="leaderboard-privacy-heading">Classements</h2>
              <p>Choisis si ton pseudo peut apparaitre dans les futurs classements publics.</p>
            </div>
            <label className="profile-toggle-row">
              <input
                type="checkbox"
                checked={Boolean(profile?.leaderboardVisible)}
                aria-label="Apparaitre dans les classements"
                onChange={(event) => visibilityMutation.mutate(event.target.checked)}
              />
              <span>Apparaitre dans les classements</span>
            </label>

            <div className="profile-trust-note">
              <CheckCircle2 aria-hidden="true" />
              <span>
                Cette option n'efface pas ton historique. Elle controle seulement la visibilite publique des futurs classements.
              </span>
            </div>
          </section>

          <section
            className="panel profile-settings-card profile-billing-card"
            aria-labelledby="subscription-heading"
          >
            <div className="profile-card-heading">
              <h2 id="subscription-heading">Abonnement</h2>
              <p>
                La base Free / Premium est maintenant intégrée au produit. Le paiement
                sera branché ensuite sur cette fondation.
              </p>
            </div>

            <div className="profile-billing-summary" aria-label="Résumé abonnement">
              <div>
                <span>Plan actuel</span>
                <strong>{formatBillingPlan(profile?.billing.planKey ?? "free")}</strong>
              </div>
              <div>
                <span>Statut</span>
                <strong>{formatBillingStatus(profile?.billing.status ?? "inactive")}</strong>
              </div>
              <div>
                <span>Accès Premium</span>
                <strong>
                  {profile?.billing.premiumEnabled ? "Actif" : "Non activé"}
                </strong>
              </div>
            </div>

            <div className="profile-trust-note">
              <Sparkles aria-hidden="true" />
              <span>
                {profile?.billing.premiumEnabled
                  ? "Le premium actif aujourd'hui débloque surtout le défi quotidien officiel et son classement dédié."
                  : "Le plan gratuit reste pleinement utilisable. Le premium actuel ajoute surtout le d\u00e9fi quotidien officiel et le classement du jour pour 1,99 EUR par mois."}
              </span>
            </div>

            <div className="profile-billing-actions">
              <Link className="primary-link" to="/pricing">
                <CreditCard aria-hidden="true" />
                {"Voir l'offre \u00e0 1,99 EUR / mois"}
              </Link>
              {isPremiumPlan(profile?.billing.planKey ?? "free") ? (
                <span className="official-badge">Compte premium détecté</span>
              ) : (
                <span className="official-badge">Premium 1,99 EUR / mois</span>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
