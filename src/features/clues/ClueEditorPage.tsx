import { ArrowLeft, Globe2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { CollectionApi } from "../collections/collectionApi";
import { ClueEditor } from "./ClueEditor";
import type { ClueApi } from "./clueApi";

export function ClueEditorPage({
  clueApi,
  collectionApi,
}: {
  clueApi?: ClueApi;
  collectionApi?: CollectionApi;
}) {
  const navigate = useNavigate();

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
      <ClueEditor
        clueApi={clueApi}
        collectionApi={collectionApi}
        onCreated={() => navigate("/atlas")}
        onCancel={() => navigate("/atlas")}
      />
    </main>
  );
}
