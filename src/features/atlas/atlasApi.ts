import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";
import type { Category } from "../collections/collectionApi";

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
  characteristics: string[];
  notes: string | null;
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
  characteristics: string[];
  notes: string | null;
  countries: { name: string } | null;
  clue_images: Array<{
    storage_path: string;
    alt_text: string | null;
    sort_order: number;
  }>;
  clue_regions: Array<{ regions: { name: string } | null }>;
};

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
  listCategories(collectionId: string): Promise<Category[]>;
  listPublishedClues(collectionId: string): Promise<PublishedClueRow[]>;
  createSignedImageUrls(paths: string[]): Promise<Record<string, string>>;
  loadWorld(): Promise<WorldFeatureCollection>;
};

const difficultyRank: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  expert: 2,
};

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
      const [categories, clues, world] = await Promise.all([
        client.listCategories(collectionId),
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

        country.counts[clue.category_id] =
          (country.counts[clue.category_id] ?? 0) + 1;
        country.clues.push({
          id: clue.id,
          categoryId: clue.category_id,
          title: clue.title,
          difficulty: clue.difficulty,
          characteristics: clue.characteristics,
          notes: clue.notes,
          imageUrls: images
            .map((image) => signedUrls[image.storage_path])
            .filter((url): url is string => Boolean(url)),
          imageAlts: images.map(
            (image) => image.alt_text ?? `${clue.title} - image`,
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
        categories: categories.map((category) => {
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
            icon: category.icon,
            color: category.color,
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
    async listCategories(collectionId) {
      const { data, error } = await supabase
        .from("categories")
        .select()
        .eq("collection_id", collectionId)
        .order("name");
      if (error) throw error;
      return data;
    },

    async listPublishedClues(collectionId) {
      const { data, error } = await supabase
        .from("clues")
        .select(
          "id, category_id, country_code, title, difficulty, characteristics, notes, countries(name), clue_images(storage_path, alt_text, sort_order), clue_regions(regions(name))",
        )
        .eq("collection_id", collectionId)
        .eq("status", "published")
        .order("created_at", { ascending: false });
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
