import type { CollectionSummary } from "./collectionApi";

export function CollectionPicker({
  collections,
  value,
  onChange,
  disabled = false,
}: {
  collections: Array<Pick<CollectionSummary, "id" | "name" | "role">>;
  value: string | null;
  onChange(id: string): void;
  disabled?: boolean;
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
            {collection.name}
            {collection.role === "owner" ? " (propriétaire)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
