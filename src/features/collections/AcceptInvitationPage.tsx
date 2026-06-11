import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CollectionError,
  getCollectionApi,
  type CollectionApi,
  type InvitationResult,
} from "./collectionApi";
import { collectionKeys } from "./collectionKeys";

function invitationMessage(error: unknown) {
  if (error instanceof CollectionError) {
    if (error.code === "invitation_expired") {
      return "Cette invitation a expiré.";
    }
    if (error.code === "invitation_email_mismatch") {
      return "Cette invitation est destinée à une autre adresse email.";
    }
    if (
      error.code === "invitation_invalid" ||
      error.code === "invitation_not_pending"
    ) {
      return "Cette invitation n’est plus valide.";
    }
  }
  return error instanceof Error
    ? error.message
    : "Impossible d’accepter cette invitation.";
}

export function AcceptInvitationPage({
  api: suppliedApi,
}: {
  api?: CollectionApi;
}) {
  const { token = "" } = useParams();
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const [result, setResult] = useState<InvitationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let active = true;
    void api
      .acceptInvitation(token)
      .then(async (accepted) => {
        if (!active) return;
        setResult(accepted);
        await queryClient.invalidateQueries({ queryKey: collectionKeys.all });
      })
      .catch((reason: unknown) => {
        if (active) setError(invitationMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [api, queryClient, token]);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Invitation privée</p>
        <h1>Rejoindre une collection</h1>
        {!result && !error ? (
          <p role="status">Vérification de l’invitation…</p>
        ) : null}
        {result ? (
          <>
            <p className="notice notice-success" role="status">
              Vous avez rejoint la collection {result.collection_name}.
            </p>
            <Link className="primary-link" to="/collections">
              Ouvrir les collections
            </Link>
          </>
        ) : null}
        {error ? (
          <>
            <p className="notice notice-error" role="alert">
              {error}
            </p>
            <Link to="/collections">Retour aux collections</Link>
          </>
        ) : null}
      </section>
    </main>
  );
}
