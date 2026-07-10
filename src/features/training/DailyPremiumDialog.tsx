import { useEffect } from "react";
import { Link } from "react-router-dom";

export function DailyPremiumDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="daily-premium-dialog__backdrop">
      <section
        aria-labelledby="daily-premium-dialog-title"
        aria-modal="true"
        className="panel daily-premium-dialog"
        role="dialog"
      >
        <span className="daily-premium-dialog__eyebrow">Défi terminé</span>
        <h2 id="daily-premium-dialog-title">
          Passez Premium pour débloquer la progression
        </h2>
        <p>
          Votre défi du jour est terminé. En Premium, ce même résultat devient utile
          pour votre progression et votre classement.
        </p>

        <ul className="daily-premium-dialog__benefits">
          <li>Résultat sauvegardé</li>
          <li>Classement quotidien</li>
          <li>XP et rangs</li>
          <li>Statistiques et historique</li>
          <li>Coach IA bientôt disponible</li>
        </ul>

        <div className="daily-premium-dialog__actions">
          <Link className="primary-button" to="/pricing">
            Passer Premium - 1,99 EUR / mois
          </Link>
          <button className="secondary-button" type="button" onClick={onClose}>
            Continuer gratuitement
          </button>
        </div>
      </section>
    </div>
  );
}
