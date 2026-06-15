import type { PlatformRole } from "../admin/adminApi";
import { canAdministerCollection } from "../admin/platformRole";
import type { CollectionSummary } from "./collectionApi";

function describeCollection(
  collection: Pick<CollectionSummary, "name" | "role" | "visibility">,
  isCollectionAdmin: boolean,
) {
  const suffixes: string[] = [];

  if (collection.role === "owner") {
    suffixes.push("propriétaire");
  }
  if (collection.visibility === "public_readonly") {
    suffixes.push(
      isCollectionAdmin
        ? "publique · administration"
        : "publique · lecture seule",
    );
  }

  return suffixes.length > 0
    ? `${collection.name} (${suffixes.join(", ")})`
    : collection.name;
}

export function CollectionPicker({
  collections,
  value,
  onChange,
  disabled = false,
  platformRole,
}: {
  collections: Array<
    Pick<CollectionSummary, "id" | "name" | "role" | "visibility">
  >;
  value: string | null;
  onChange(id: string): void;
  disabled?: boolean;
  platformRole?: PlatformRole | null;
}) {
  return (
    <label className="collection-picker">
      <span>Collection active</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled || collections.length === 0}
      >
        {collections.length === 0 ? (
          <option value="">Aucune collection</option>
        ) : null}
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {describeCollection(
              collection,
              canAdministerCollection(collection, platformRole),
            )}
          </option>
        ))}
      </select>
    </label>
  );
}
