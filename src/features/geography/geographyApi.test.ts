import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  GEOGRAPHY_STALE_TIME,
  geographyQueries,
  listCountries,
  listRegions,
  loadRegionGeoJson,
  loadWorldGeoJson,
  type GeographyDataClient,
} from "./geographyApi";

const countries = [
  {
    code: "US",
    name: "États-Unis",
    geojson_path: "/geography/countries/US.geojson",
    created_at: "2026-06-11T00:00:00Z",
    updated_at: "2026-06-11T00:00:00Z",
  },
  {
    code: "FR",
    name: "France",
    geojson_path: "/geography/countries/FR.geojson",
    created_at: "2026-06-11T00:00:00Z",
    updated_at: "2026-06-11T00:00:00Z",
  },
];

const regions = [
  {
    id: "FR-OCC",
    country_code: "FR",
    name: "Occitanie",
    geojson_path: "/geography/regions/FR.geojson",
    created_at: "2026-06-11T00:00:00Z",
    updated_at: "2026-06-11T00:00:00Z",
  },
  {
    id: "FR-IDF",
    country_code: "FR",
    name: "Île-de-France",
    geojson_path: "/geography/regions/FR.geojson",
    created_at: "2026-06-11T00:00:00Z",
    updated_at: "2026-06-11T00:00:00Z",
  },
];

function createClient(): GeographyDataClient {
  return {
    listCountries: vi.fn().mockResolvedValue(countries),
    listRegions: vi.fn().mockResolvedValue(regions),
  };
}

describe("geographyApi", () => {
  it("liste les pays triés par nom", async () => {
    const client = createClient();

    await expect(listCountries(client)).resolves.toEqual([
      expect.objectContaining({ code: "US", name: "États-Unis" }),
      expect.objectContaining({ code: "FR", name: "France" }),
    ]);
  });

  it("normalise le code pays et trie ses régions", async () => {
    const client = createClient();

    await expect(listRegions(" fr ", client)).resolves.toEqual([
      expect.objectContaining({ id: "FR-IDF", country_code: "FR" }),
      expect.objectContaining({ id: "FR-OCC", country_code: "FR" }),
    ]);
    expect(client.listRegions).toHaveBeenCalledWith("FR");
  });

  it("refuse un code pays invalide avant la requête", async () => {
    const client = createClient();

    await expect(listRegions("France", client)).rejects.toThrow(
      "Le code pays doit respecter le format ISO 3166-1 alpha-2.",
    );
    expect(client.listRegions).not.toHaveBeenCalled();
  });

  it("charge uniquement une FeatureCollection GeoJSON", async () => {
    const geoJson = {
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: { iso2: "FR" }, geometry: null }],
    };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(geoJson),
    });

    await expect(loadWorldGeoJson(fetcher)).resolves.toEqual(geoJson);
    await expect(loadRegionGeoJson("fr", fetcher)).resolves.toEqual(geoJson);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/geography/world.geojson");
    expect(fetcher).toHaveBeenNthCalledWith(2, "/geography/regions/FR.geojson");
  });

  it("signale les réponses HTTP et GeoJSON invalides", async () => {
    const failedFetcher = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    const invalidFetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ type: "Feature" }),
    });

    await expect(loadWorldGeoJson(failedFetcher)).rejects.toThrow(
      "Impossible de charger /geography/world.geojson (HTTP 404).",
    );
    await expect(loadWorldGeoJson(invalidFetcher)).rejects.toThrow(
      "Le fichier /geography/world.geojson n'est pas une FeatureCollection GeoJSON valide.",
    );
  });

  it("configure un cache immuable de 24 heures", async () => {
    const client = createClient();
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ type: "FeatureCollection", features: [] }),
    });
    const queryClient = new QueryClient();
    const worldQuery = geographyQueries.world(fetcher);

    expect(GEOGRAPHY_STALE_TIME).toBe(24 * 60 * 60 * 1000);
    expect(worldQuery.staleTime).toBe(GEOGRAPHY_STALE_TIME);
    expect(geographyQueries.countries(client).staleTime).toBe(GEOGRAPHY_STALE_TIME);

    await queryClient.fetchQuery(worldQuery);
    await queryClient.fetchQuery(worldQuery);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
