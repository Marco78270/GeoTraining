import { ArrowLeft, Globe2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import type { CollectionApi } from "../collections/collectionApi";
import { ClueEditor } from "./ClueEditor";
import type { ClueApi } from "./clueApi";

type EditLocationState = {
  initialClue?: Parameters<typeof ClueEditor>[0]["initialClue"];
};

export function ClueEditorPage({
  clueApi,
  collectionApi,
}: {
  clueApi?: ClueApi;
  collectionApi?: CollectionApi;
}) {
  const navigate = useNavigate();
  const { clueId } = useParams();
  const location = useLocation();
  const initialClue = (location.state as EditLocationState | null)?.initialClue ?? null;
  const isEditMode = Boolean(clueId);

  return (
    <main className="clue-editor-page">
      <nav className="clue-editor-topbar" aria-label="Navigation de l’éditeur">
        <Link className="brand brand-link" to="/atlas">
          <Globe2 className="brand-globe" aria-hidden="true" />
          <strong>GeoTrainer</strong>
          <span>Atlas</span>
        </Link>
        <Link to="/atlas" className="clue-back-link">
          <ArrowLeft aria-hidden="true" />
          Retour à l’Atlas
        </Link>
      </nav>
      {isEditMode && !initialClue ? (
        <p role="alert">Impossible de charger cet indice pour modification.</p>
      ) : (
        <ClueEditor
          clueApi={clueApi}
          collectionApi={collectionApi}
          mode={isEditMode ? "edit" : "create"}
          initialClue={initialClue ?? undefined}
          onCreated={() => navigate("/atlas")}
          onCancel={() => navigate("/atlas")}
        />
      )}
    </main>
  );
}
