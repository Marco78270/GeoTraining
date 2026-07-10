import {
  ChevronDown,
  CircleUserRound,
  CreditCard,
  LogOut,
  Settings,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlatformRole } from "./adminApi";
import { isPlatformAdmin, usePlatformRole } from "./platformRole";
import { getProfileApi, profileKeys, type ProfileApi } from "../profile/profileApi";
import { useQuery } from "@tanstack/react-query";
import { formatBillingPlan } from "../billing/billingApi";
import { getRankForXp } from "../ranking/rankProgression";
import { RankBadge } from "../ranking/RankBadge";

export function ProfileMenu({
  email,
  onSignOut,
  platformRole,
  profileApi = getProfileApi(),
}: {
  email: string | null | undefined;
  onSignOut(): void;
  platformRole?: PlatformRole | null;
  profileApi?: ProfileApi;
}) {
  const [open, setOpen] = useState(false);
  const resolvedRole = usePlatformRole(platformRole);
  const isAdmin = isPlatformAdmin(resolvedRole);
  const profileQuery = useQuery({
    queryKey: profileKeys.current(),
    queryFn: () => profileApi.load(),
    enabled: Boolean(email),
    staleTime: 60_000,
  });
  const profile = profileQuery.data;
  const username = profile?.username ?? email ?? "Utilisateur";
  const avatarUrl = profile?.avatarUrl ?? null;
  const xpTotal = profile?.xpTotal ?? 0;
  const rank = getRankForXp(xpTotal);
  const billingLabel = profile
    ? formatBillingPlan(profile.billing.planKey)
    : profileQuery.isLoading
      ? "Chargement..."
      : "Profil indisponible";

  return (
    <div className="atlas-account profile-menu">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="profile-menu-avatar" />
      ) : (
        <CircleUserRound aria-hidden="true" />
      )}
      <button
        type="button"
        className="profile-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{username}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <div className="profile-menu-popover" role="menu">
          <p className="profile-menu-email">{email ?? "Utilisateur"}</p>
          <span className="profile-menu-plan">{billingLabel}</span>
          {profile ? <div className="profile-menu-rank-preview">
            <RankBadge rankKey={rank.key} label={rank.label} size="compact" />
            <div>
              <strong>{rank.label}</strong>
              <span>{xpTotal} XP</span>
            </div>
          </div> : null}
          <Link
            to="/profile"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            <Settings aria-hidden="true" />
            Mon profil
          </Link>
          <Link
            to="/leaderboard"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            <Trophy aria-hidden="true" />
            Classement
          </Link>
          <Link
            to="/pricing"
            role="menuitem"
            className="profile-menu-item"
            onClick={() => setOpen(false)}
          >
            <CreditCard aria-hidden="true" />
            Premium 1,99 EUR / mois
          </Link>
          {isAdmin ? (
            <Link
              to="/admin"
              role="menuitem"
              className="profile-menu-item"
              onClick={() => setOpen(false)}
            >
              <ShieldCheck aria-hidden="true" />
              Gestion utilisateurs
            </Link>
          ) : null}
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      ) : null}
    </div>
  );
}
