import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
export type Difficulty = "easy" | "medium" | "expert";

export type AtlasCategory = {
  id: string;
  name: string;
  shortName: string;
  total: number;
  countries: number;
  icon: string | null;
  color: string | null;
};

export type AtlasClue = {
  id: string;
  categoryId: string;
  title: string;
  difficulty: Difficulty;
  coverage: "whole_country" | "selected_regions";
  characteristics: string[];
  notes: string | null;
  googleMapsUrl: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  licenseName: string | null;
  licenseUrl: string | null;
  attributionText: string | null;
  regionIds: string[];
  images: Array<{
    id: string;
    storagePath: string;
    altText: string | null;
    url: string;
  }>;
  imageUrls: string[];
  imageAlts: string[];
  regions: string[];
};

export type AtlasCountry = {
  code: string;
  name: string;
  coordinates: [number, number];
  difficulty: Difficulty;
  counts: Record<string, number>;
  regions: string[];
  clues: AtlasClue[];
};

export type AtlasData = {
  categories: AtlasCategory[];
  countries: AtlasCountry[];
};

type PublishedClueRow = {
  id: string;
  category_id: string;
  country_code: string;
  title: string;
  difficulty: Difficulty;
  coverage: "whole_country" | "selected_regions";
  characteristics: string[];
  notes: string | null;
  google_maps_url: string | null;
  source_name: string | null;
  source_url: string | null;
  license_name: string | null;
  license_url: string | null;
  attribution_text: string | null;
  categories: { name: string | null } | null;
  countries: { name: string } | null;
  clue_images: Array<{
    id: string;
    storage_path: string;
    alt_text: string | null;
    sort_order: number;
  }>;
  clue_regions: Array<{
    region_id: string;
    regions: { name: string } | null;
  }>;
};

function isMissingClueSourceMetadata(
  error: { message: string; code?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.message.includes("source_name") ||
    error.message.includes("source_url") ||
    error.message.includes("license_name") ||
    error.message.includes("license_url") ||
    error.message.includes("attribution_text")
  );
}

type Position = [number, number];
type Coordinates = number | Coordinates[];

export type WorldFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { iso2: string; name: string };
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: Coordinates;
    } | null;
  }>;
};

export type AtlasDataClient = {
  listPublishedClues(collectionId: string): Promise<PublishedClueRow[]>;
  createSignedImageUrls(paths: string[]): Promise<Record<string, string>>;
  loadWorld(): Promise<WorldFeatureCollection>;
};

const difficultyRank: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  expert: 2,
};

const OFFICIAL_PLATES_CATEGORY_ID = "f1000000-0000-0000-0000-000000000003";

function buildOfficialFlagFallbackUrl(countryCode: string) {
  return `https://flagcdn.com/w320/${countryCode.toLowerCase()}.png`;
}

function canUseOfficialFlagFallback(clue: PublishedClueRow) {
  return (
    clue.source_name?.includes("FlagCDN") === true ||
    clue.title.startsWith("Drapeau - ")
  );
}

function canUseOfficialPlateFallback(clue: PublishedClueRow) {
  return (
    clue.category_id === OFFICIAL_PLATES_CATEGORY_ID ||
    clue.title.startsWith("Plaque - ")
  );
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildOfficialPlateFallbackUrl(clue: PublishedClueRow) {
  const countryName = clue.countries?.name ?? clue.country_code;
  const accent = clue.difficulty === "expert" ? "#ff6b6b" : clue.difficulty === "medium" ? "#f4c84f" : "#4fd38a";
  const plateText =
    clue.country_code === "FR"
      ? "AB-123-CD"
      : clue.country_code === "GB"
        ? "AB12 CDE"
        : clue.country_code === "NL"
          ? "12-AB-CD"
          : clue.country_code === "BE"
            ? "1-ABC-234"
            : clue.country_code === "US"
              ? "7ABC123"
              : `${clue.country_code}-123`;
  const subtitle =
    clue.coverage === "selected_regions"
      ? `${countryName} · region`
      : `${countryName} · national`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs>
        <linearGradient id="bg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#0f1f33"/>
          <stop offset="100%" stop-color="#10293d"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="675" fill="url(#bg)"/>
      <rect x="120" y="150" width="960" height="375" rx="32" fill="#f7f8fb"/>
      <rect x="146" y="176" width="76" height="323" rx="18" fill="#2457d6"/>
      <rect x="978" y="176" width="76" height="323" rx="18" fill="${accent}"/>
      <text x="600" y="250" fill="#6b7f94" font-size="34" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        subtitle.toUpperCase(),
      )}</text>
      <text x="600" y="382" fill="#111827" font-size="118" font-weight="700" letter-spacing="10" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        plateText,
      )}</text>
      <text x="600" y="460" fill="#51657b" font-size="40" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">${escapeSvgText(
        clue.title,
      )}</text>
      <text x="600" y="588" fill="#9cb1c5" font-size="28" font-family="Arial, Helvetica, sans-serif" text-anchor="middle">Visuel de reference GeoTrainer</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function countryCenter(
  feature: WorldFeatureCollection["features"][number] | undefined,
): Position | null {
  if (!feature?.geometry) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visit(value: Coordinates) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      minX = Math.min(minX, value[0]);
      maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]);
      maxY = Math.max(maxY, value[1]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  }

  visit(feature.geometry.coordinates);
  return Number.isFinite(minX)
    ? [(minX + maxX) / 2, (minY + maxY) / 2]
    : null;
}

export function createAtlasApi(client: AtlasDataClient) {
  return {
    async load(collectionId: string): Promise<AtlasData> {
      const [clues, world] = await Promise.all([
        client.listPublishedClues(collectionId),
        client.loadWorld(),
      ]);
      const paths = clues.flatMap((clue) =>
        clue.clue_images.map((image) => image.storage_path),
      );
      const signedUrls = await client.createSignedImageUrls(paths);
      const features = new Map(
        world.features.map((feature) => [feature.properties.iso2, feature]),
      );

      const countries = new Map<string, AtlasCountry>();
      for (const clue of clues) {
        const coordinates = countryCenter(features.get(clue.country_code));
        if (!coordinates) continue;
        const country = countries.get(clue.country_code) ?? {
          code: clue.country_code,
          name: clue.countries?.name ?? clue.country_code,
          coordinates,
          difficulty: clue.difficulty,
          counts: {},
          regions: [],
          clues: [],
        };
        const images = [...clue.clue_images].sort(
          (left, right) => left.sort_order - right.sort_order,
        );
        const regions = clue.clue_regions
          .map((item) => item.regions?.name)
          .filter((name): name is string => Boolean(name));
        const regionIds = clue.clue_regions.map((item) => item.region_id);
        const atlasImages = images
          .map((image) => {
            const url = signedUrls[image.storage_path];
            if (!url) return null;
            return {
              id: image.id,
              storagePath: image.storage_path,
              altText: image.alt_text,
              url,
            };
          })
          .filter(
            (
              image,
            ): image is {
              id: string;
              storagePath: string;
              altText: string | null;
              url: string;
            } => Boolean(image),
          );
        const resolvedImages =
          atlasImages.length > 0
            ? atlasImages
            : canUseOfficialFlagFallback(clue)
              ? [
                  {
                    id: `fallback-${clue.id}`,
                    storagePath: "",
                    altText: `Drapeau de ${clue.countries?.name ?? clue.country_code}`,
                    url: buildOfficialFlagFallbackUrl(clue.country_code),
                  },
                ]
              : canUseOfficialPlateFallback(clue)
                ? [
                    {
                      id: `fallback-${clue.id}`,
                      storagePath: "",
                      altText: `Plaque de ${clue.countries?.name ?? clue.country_code}`,
                      url: buildOfficialPlateFallbackUrl(clue),
                    },
                  ]
              : [];

        country.counts[clue.category_id] =
          (country.counts[clue.category_id] ?? 0) + 1;
        country.clues.push({
          id: clue.id,
          categoryId: clue.category_id,
          title: clue.title,
          difficulty: clue.difficulty,
          coverage: clue.coverage,
          characteristics: clue.characteristics,
          notes: clue.notes,
          googleMapsUrl: clue.google_maps_url,
          sourceName: clue.source_name,
          sourceUrl: clue.source_url,
          licenseName: clue.license_name,
          licenseUrl: clue.license_url,
          attributionText: clue.attribution_text,
          regionIds,
          images: resolvedImages,
          imageUrls: resolvedImages.map((image) => image.url),
          imageAlts: resolvedImages.map(
            (image) => image.altText ?? `${clue.title} - image`,
          ),
          regions,
        });
        country.regions = [...new Set([...country.regions, ...regions])];
        if (difficultyRank[clue.difficulty] > difficultyRank[country.difficulty]) {
          country.difficulty = clue.difficulty;
        }
        countries.set(country.code, country);
      }

      return {
        categories: [...new Map(
          clues.map((clue) => [
            clue.category_id,
            {
              id: clue.category_id,
              name: clue.categories?.name ?? clue.category_id,
            },
          ]),
        ).values()].map((category) => {
          const categoryClues = clues.filter(
            (clue) => clue.category_id === category.id,
          );
          return {
            id: category.id,
            name: category.name,
            shortName: category.name,
            total: categoryClues.length,
            countries: new Set(
              categoryClues.map((clue) => clue.country_code),
            ).size,
            icon: null,
            color: null,
          };
        }),
        countries: [...countries.values()].sort((left, right) =>
          left.name.localeCompare(right.name, "fr"),
        ),
      };
    },
  };
}

export type AtlasApi = ReturnType<typeof createAtlasApi>;

export function createSupabaseAtlasDataClient(
  supabase: SupabaseClient<Database>,
): AtlasDataClient {
  return {
    async listPublishedClues(collectionId) {
      const query = supabase
        .from("clues")
        .select(
          "id, category_id, country_code, title, difficulty, coverage, characteristics, notes, google_maps_url, source_name, source_url, license_name, license_url, attribution_text, categories(name), countries(name), clue_images(id, storage_path, alt_text, sort_order), clue_regions(region_id, regions(name))",
        )
        .eq("collection_id", collectionId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
      const { data, error } = await query;
      if (isMissingClueSourceMetadata(error)) {
        const legacyResult = await supabase
          .from("clues")
          .select(
            "id, category_id, country_code, title, difficulty, coverage, characteristics, notes, google_maps_url, categories(name), countries(name), clue_images(id, storage_path, alt_text, sort_order), clue_regions(region_id, regions(name))",
          )
          .eq("collection_id", collectionId)
          .eq("status", "published")
          .order("created_at", { ascending: false });
        if (legacyResult.error) throw legacyResult.error;
        return (legacyResult.data ?? []).map((row) => ({
          ...row,
          source_name: null,
          source_url: null,
          license_name: null,
          license_url: null,
          attribution_text: null,
        })) as unknown as PublishedClueRow[];
      }
      if (error) throw error;
      return data as unknown as PublishedClueRow[];
    },

    async createSignedImageUrls(paths) {
      if (paths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from("clue-images")
        .createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      return Object.fromEntries(
        data
          .map((item, index) => [paths[index], item.signedUrl] as const)
          .filter((entry): entry is readonly [string, string] =>
            Boolean(entry[1]),
          ),
      );
    },

    async loadWorld() {
      const response = await fetch("/geography/world.geojson");
      if (!response.ok) {
        throw new Error("Impossible de charger la géographie mondiale.");
      }
      return response.json() as Promise<WorldFeatureCollection>;
    },
  };
}

let defaultApi: AtlasApi | undefined;

export function getAtlasApi() {
  defaultApi ??= createAtlasApi(
    createSupabaseAtlasDataClient(getSupabaseClient()),
  );
  return defaultApi;
}
