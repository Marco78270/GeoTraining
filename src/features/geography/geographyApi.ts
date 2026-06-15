import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeatureCollection } from "geojson";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type Tables = Database["public"]["Tables"];
export type Country = Tables["countries"]["Row"];
export type Region = Tables["regions"]["Row"];

export type GeographyDataClient = {
  listCountries(): Promise<Country[]>;
  listRegions(countryCode: string): Promise<Region[]>;
};

export type GeoJsonFetcher = (
  input: RequestInfo | URL,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

export const GEOGRAPHY_STALE_TIME = 24 * 60 * 60 * 1000;

const frenchCollator = new Intl.Collator("fr", { sensitivity: "base" });

function normalizeCountryCode(countryCode: string) {
  const normalized = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new Error("Le code pays doit respecter le format ISO 3166-1 alpha-2.");
  }
  return normalized;
}

function createSupabaseGeographyDataClient(
  supabase: SupabaseClient<Database>,
): GeographyDataClient {
  return {
    async listCountries() {
      const { data, error } = await supabase.from("countries").select("*");
      if (error) {
        throw error;
      }
      return data;
    },
    async listRegions(countryCode) {
      const { data, error } = await supabase
        .from("regions")
        .select("*")
        .eq("country_code", countryCode);
      if (error) {
        throw error;
      }
      return data;
    },
  };
}

function getDefaultClient() {
  return createSupabaseGeographyDataClient(getSupabaseClient());
}

export async function listCountries(
  client: GeographyDataClient = getDefaultClient(),
): Promise<Country[]> {
  const countries = await client.listCountries();
  return [...countries].sort((left, right) =>
    frenchCollator.compare(left.name, right.name),
  );
}

export async function listRegions(
  countryCode: string,
  client: GeographyDataClient = getDefaultClient(),
): Promise<Region[]> {
  const normalizedCode = normalizeCountryCode(countryCode);
  const regions = await client.listRegions(normalizedCode);
  return [...regions].sort((left, right) =>
    frenchCollator.compare(left.name, right.name),
  );
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

async function loadGeoJson(
  path: string,
  fetcher: GeoJsonFetcher = fetch,
): Promise<FeatureCollection> {
  const response = await fetcher(path);
  if (!response.ok) {
    throw new Error(`Impossible de charger ${path} (HTTP ${response.status}).`);
  }
  const payload: unknown = await response.json();
  if (!isFeatureCollection(payload)) {
    throw new Error(
      `Le fichier ${path} n'est pas une FeatureCollection GeoJSON valide.`,
    );
  }
  return payload;
}

export function loadWorldGeoJson(
  fetcher: GeoJsonFetcher = fetch,
): Promise<FeatureCollection> {
  return loadGeoJson("/geography/world.geojson", fetcher);
}

export function loadRegionGeoJson(
  countryCode: string,
  fetcher: GeoJsonFetcher = fetch,
): Promise<FeatureCollection> {
  const normalizedCode = normalizeCountryCode(countryCode);
  return loadGeoJson(`/geography/regions/${normalizedCode}.geojson`, fetcher);
}

export const geographyQueries = {
  countries: (client?: GeographyDataClient) =>
    queryOptions({
      queryKey: ["geography", "countries"] as const,
      queryFn: () => listCountries(client),
      staleTime: GEOGRAPHY_STALE_TIME,
    }),
  regions: (countryCode: string, client?: GeographyDataClient) => {
    const normalizedCode = normalizeCountryCode(countryCode);
    return queryOptions({
      queryKey: ["geography", "regions", normalizedCode] as const,
      queryFn: () => listRegions(normalizedCode, client),
      staleTime: GEOGRAPHY_STALE_TIME,
    });
  },
  world: (fetcher?: GeoJsonFetcher) =>
    queryOptions({
      queryKey: ["geography", "world"] as const,
      queryFn: () => loadWorldGeoJson(fetcher),
      staleTime: GEOGRAPHY_STALE_TIME,
    }),
  regionGeometry: (countryCode: string, fetcher?: GeoJsonFetcher) => {
    const normalizedCode = normalizeCountryCode(countryCode);
    return queryOptions({
      queryKey: ["geography", "region-geometry", normalizedCode] as const,
      queryFn: () => loadRegionGeoJson(normalizedCode, fetcher),
      staleTime: GEOGRAPHY_STALE_TIME,
    });
  },
};
