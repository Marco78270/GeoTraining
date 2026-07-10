export type ClueZoneGeoJson = {
  type: "Polygon";
  coordinates: number[][][];
};

export function isClueZoneGeoJson(value: unknown): value is ClueZoneGeoJson {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    type?: unknown;
    coordinates?: unknown;
  };

  return (
    candidate.type === "Polygon" &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.every(
      (ring) =>
        Array.isArray(ring) &&
        ring.every(
          (point) =>
            Array.isArray(point) &&
            point.length >= 2 &&
            typeof point[0] === "number" &&
            typeof point[1] === "number",
        ),
    )
  );
}
