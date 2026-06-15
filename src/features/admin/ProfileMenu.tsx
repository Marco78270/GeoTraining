import {
  ChevronDown,
  CircleUserRound,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { PlatformRole } from "./adminApi";
import { isPlatformAdmin, usePlatformRole } from "./platformRole";

export function ProfileMenu({
  email,
  onSignOut,
  platformRole,
}: {
  email: string | null | undefined;
  onSignOut(): void;
  platformRole?: PlatformRole | null;
}) {
  const [open, setOpen] = useState(false);
  const resolvedRole = usePlatformRole(platformRole);
  const isAdmin = isPlatformAdmin(resolvedRole);

  return (
    <div className="atlas-account profile-menu">
      <CircleUserRound aria-hidden="true" />
      <button
        type="button"
        className="profile-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{email ?? "Utilisateur"}</span>
        <ChevronDown aria-hidden="true" />
      </button>

      {open ? (
        <div className="profile-menu-popover" role="menu">
          <p className="profile-menu-email">{email ?? "Utilisateur"}</p>
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
