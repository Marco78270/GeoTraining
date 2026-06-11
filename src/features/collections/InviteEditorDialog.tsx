import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getCollectionApi, type CollectionApi } from "./collectionApi";
import { collectionKeys } from "./collectionKeys";

export function InviteEditorDialog({
  collectionId,
  isOwner,
  api: suppliedApi,
}: {
  collectionId: string;
  isOwner: boolean;
  api?: CollectionApi;
}) {
  const [api] = useState(() => suppliedApi ?? getCollectionApi());
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: collectionKeys.members(collectionId),
    queryFn: () => api.listMembers(collectionId),
    enabled: isOwner,
  });
  const invite = useMutation({
    mutationFn: (address: string) => api.inviteEditor(collectionId, address),
    onSuccess: () => {
      setEmail("");
      setMessage("Invitation envoyée.");
    },
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.removeEditor(collectionId, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: collectionKeys.members(collectionId),
      }),
  });

  if (!isOwner) {
    return null;
  }

  return (
    <section className="panel" aria-labelledby="members-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Partage privé</p>
          <h2 id="members-title">Collaborateurs</h2>
        </div>
      </div>
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          invite.mutate(email);
        }}
      >
        <label>
          <span>Email de l’éditeur</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <button className="primary-button" type="submit" disabled={invite.isPending}>
          {invite.isPending ? "Envoi…" : "Inviter"}
        </button>
      </form>
      {message ? (
        <p className="notice notice-success" role="status">
          {message}
        </p>
      ) : null}
      {invite.error ? (
        <p className="notice notice-error" role="alert">
          {invite.error.message}
        </p>
      ) : null}
      {query.isLoading ? <p role="status">Chargement des membres…</p> : null}
      {query.error ? (
        <p className="notice notice-error" role="alert">
          Impossible de charger les membres.
        </p>
      ) : null}
      <ul className="member-list">
        {query.data?.map((member) => (
          <li key={member.user_id}>
            <span>
              <strong>{member.profile.display_name || "Utilisateur"}</strong>
              <small>{member.role === "owner" ? "Propriétaire" : "Éditeur"}</small>
            </span>
            {member.role === "editor" ? (
              <button
                type="button"
                className="danger-button"
                onClick={() => remove.mutate(member.user_id)}
              >
                Retirer
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
