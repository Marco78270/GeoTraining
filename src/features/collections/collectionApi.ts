import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type Tables = Database["public"]["Tables"];
export type Collection = Tables["collections"]["Row"];
export type Membership = Tables["collection_members"]["Row"];
export type Category = Tables["categories"]["Row"];

export type CategoryStats = {
  categoryId: string;
  clueCount: number;
  publishedCount: number;
  countryCount: number;
  completeCount: number;
  completeness: number;
};

type ClueStatus = Tables["clues"]["Row"]["status"];

export type ClueLibraryFilterRow = {
  category_id: string;
  country_code: string;
  status: ClueStatus;
  categories: { name: string } | null;
  countries: { name: string } | null;
};

export type ClueLibraryFilters = {
  categories: Array<{ id: string; name: string }>;
  countries: Array<{ code: string; name: string }>;
  statuses: ClueStatus[];
};

export type ClueLibraryRow = {
  id: string;
  title: string;
  status: ClueStatus;
  difficulty: Tables["clues"]["Row"]["difficulty"];
  category_id: string;
  country_code: string;
  characteristics: string[];
  notes: string | null;
  google_maps_url: string | null;
  created_at: string;
  categories: { name: string } | null;
  countries: { name: string } | null;
  clue_images: Array<{
    id: string;
    storage_path: string;
    alt_text: string | null;
    sort_order: number;
  }>;
};

export type ClueLibraryQuery = {
  collectionId: string;
  categoryIds?: string[];
  countryCodes?: string[];
  statuses?: ClueStatus[];
  search?: string;
  page: number;
  pageSize: number;
};

type ClueLibraryDataQuery = Omit<ClueLibraryQuery, "page" | "pageSize"> & {
  from: number;
  to: number;
};

export type ClueLibraryItem = Omit<
  ClueLibraryRow,
  "categories" | "countries" | "clue_images"
> & {
  categoryName: string;
  countryName: string;
  images: Array<{
    id: string;
    altText: string | null;
    url: string;
  }>;
};

export type CollectionSummary = Pick<
  Collection,
  | "id"
  | "name"
  | "description"
  | "owner_id"
  | "visibility"
  | "created_at"
  | "updated_at"
> & {
  role: Membership["role"] | null;
};

export type CollectionMember = Membership & {
  profile: Pick<Tables["profiles"]["Row"], "display_name" | "avatar_url">;
};

export type CreateCollectionInput = {
  name: string;
  description?: string | null;
};

export type CreateCategoryInput = {
  collectionId: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

export type CreateCategoriesInput = Omit<CreateCategoryInput, "name"> & {
  names: string[];
};

export type InvitationResult = {
  collection_id: string;
  collection_name: string;
};

type CurrentUser = { id: string; email: string | null };

export class CollectionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "CollectionError";
  }
}

export type CollectionDataClient = {
  getCurrentUser(): Promise<CurrentUser>;
  listCollections(userId: string): Promise<
    Array<Collection & { current_user_role: Membership["role"] | null }>
  >;
  insertCollection(input: Tables["collections"]["Insert"]): Promise<Collection>;
  getMembership(
    collectionId: string,
    userId: string,
  ): Promise<Membership>;
  updateCollection(
    collectionId: string,
    input: Tables["collections"]["Update"],
  ): Promise<Collection>;
  deleteCollection(collectionId: string): Promise<void>;
  listCategories(collectionId: string): Promise<Category[]>;
  listCategoryStats(collectionId: string): Promise<CategoryStats[]>;
  listClueFilterRows(collectionId: string): Promise<ClueLibraryFilterRow[]>;
  listClueRows(
    input: ClueLibraryDataQuery,
  ): Promise<{ rows: ClueLibraryRow[]; count: number }>;
  createSignedImageUrls(paths: string[]): Promise<Record<string, string>>;
  insertCategory(input: Tables["categories"]["Insert"]): Promise<Category>;
  updateCategory(
    categoryId: string,
    input: Tables["categories"]["Update"],
  ): Promise<Category>;
  deleteCategory(categoryId: string): Promise<void>;
  listMembers(collectionId: string): Promise<CollectionMember[]>;
  sendInvitation(collectionId: string, email: string): Promise<void>;
  acceptInvitation(token: string): Promise<InvitationResult>;
  removeEditor(collectionId: string, userId: string): Promise<void>;
};

function requireText(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new CollectionError("validation_error", `${label} est obligatoire.`);
  }
  return normalized;
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CollectionError(
      "invalid_email",
      "Saisissez une adresse email valide.",
    );
  }
  return normalized;
}

export type CollectionApi = ReturnType<typeof createCollectionApi>;

export function createCollectionApi(client: CollectionDataClient) {
  return {
    async listCollections(): Promise<CollectionSummary[]> {
      const user = await client.getCurrentUser();
      const rows = await client.listCollections(user.id);
      return rows.map(({ current_user_role, ...row }) => ({
        ...row,
        role: current_user_role,
      }));
    },

    async createCollection(input: CreateCollectionInput) {
      const user = await client.getCurrentUser();
      const collection = await client.insertCollection({
        owner_id: user.id,
        name: requireText(input.name, "Le nom"),
        description: input.description?.trim() || null,
        visibility: "private",
      });
      const membership = await client.getMembership(collection.id, user.id);
      return { collection, membership };
    },

    async updateCollection(
      collectionId: string,
      input: CreateCollectionInput,
    ) {
      return client.updateCollection(collectionId, {
        name: requireText(input.name, "Le nom"),
        description: input.description?.trim() || null,
      });
    },

    async deleteCollection(collectionId: string) {
      await client.deleteCollection(collectionId);
    },

    async listCategories(collectionId: string) {
      return client.listCategories(collectionId);
    },

    async listCategoryStats(collectionId: string) {
      return client.listCategoryStats(collectionId);
    },

    async listClueFilters(collectionId: string): Promise<ClueLibraryFilters> {
      const rows = await client.listClueFilterRows(collectionId);
      const categories = new Map<string, string>();
      const countries = new Map<string, string>();
      const statuses = new Set<ClueStatus>();

      for (const row of rows) {
        categories.set(
          row.category_id,
          row.categories?.name ?? row.category_id,
        );
        countries.set(
          row.country_code,
          row.countries?.name ?? row.country_code,
        );
        statuses.add(row.status);
      }

      return {
        categories: [...categories].map(([id, name]) => ({ id, name })).sort(
          (left, right) => left.name.localeCompare(right.name, "fr"),
        ),
        countries: [...countries].map(([code, name]) => ({ code, name })).sort(
          (left, right) => left.name.localeCompare(right.name, "fr"),
        ),
        statuses: (["draft", "published"] as ClueStatus[]).filter((status) =>
          statuses.has(status),
        ),
      };
    },

    async listClues(input: ClueLibraryQuery) {
      const page = Math.max(1, input.page);
      const pageSize = Math.min(100, Math.max(1, input.pageSize));
      const from = (page - 1) * pageSize;
      const categoryIds = cleanStringArray(input.categoryIds);
      const countryCodes = cleanStringArray(input.countryCodes);
      const statuses = input.statuses
        ? [...new Set(input.statuses)].filter((status) =>
            (["draft", "published"] as ClueStatus[]).includes(status),
          )
        : undefined;

      if (
        categoryIds?.length === 0 ||
        countryCodes?.length === 0 ||
        statuses?.length === 0
      ) {
        return {
          items: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

      const { rows, count } = await client.listClueRows({
        collectionId: input.collectionId,
        categoryIds,
        countryCodes,
        statuses,
        search: input.search?.trim() || undefined,
        from,
        to: from + pageSize - 1,
      });
      const paths = [
        ...new Set(
          rows.flatMap((row) =>
            row.clue_images.map((image) => image.storage_path),
          ),
        ),
      ];
      const signedUrls = await client.createSignedImageUrls(paths);

      return {
        items: rows.map((row): ClueLibraryItem => {
          const { categories, countries, clue_images, ...clue } = row;
          return {
            ...clue,
            categoryName: categories?.name ?? row.category_id,
            countryName: countries?.name ?? row.country_code,
            images: [...clue_images]
              .sort((left, right) => left.sort_order - right.sort_order)
              .map((image) => ({
                id: image.id,
                altText: image.alt_text,
                url: signedUrls[image.storage_path] ?? "",
              })),
          };
        }),
        total: count,
        page,
        pageSize,
        totalPages: count > 0 ? Math.ceil(count / pageSize) : 0,
      };
    },

    async createCategory(input: CreateCategoryInput) {
      return client.insertCategory({
        collection_id: input.collectionId,
        name: requireText(input.name, "Le nom de la catégorie"),
        icon: input.icon?.trim() || null,
        color: input.color ?? null,
      });
    },

    async createCategories(input: CreateCategoriesInput) {
      const seen = new Set<string>();
      const names = input.names
        .map((name) => name.trim())
        .filter((name) => {
          const key = name.toLocaleLowerCase("fr");
          if (!name || seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });

      if (!names.length) {
        throw new CollectionError(
          "validation_error",
          "Ajoutez au moins une catégorie.",
        );
      }

      return Promise.all(
        names.map((name) =>
          client.insertCategory({
            collection_id: input.collectionId,
            name,
            icon: input.icon?.trim() || null,
            color: input.color ?? null,
          }),
        ),
      );
    },

    async updateCategory(
      categoryId: string,
      input: Pick<CreateCategoryInput, "name" | "icon" | "color">,
    ) {
      return client.updateCategory(categoryId, {
        name: requireText(input.name, "Le nom de la catégorie"),
        icon: input.icon?.trim() || null,
        color: input.color ?? null,
      });
    },

    async deleteCategory(categoryId: string) {
      await client.deleteCategory(categoryId);
    },

    async listMembers(collectionId: string) {
      return client.listMembers(collectionId);
    },

    async inviteEditor(collectionId: string, email: string) {
      await client.sendInvitation(collectionId, normalizeEmail(email));
    },

    async acceptInvitation(token: string) {
      return client.acceptInvitation(requireText(token, "Le jeton"));
    },

    async removeEditor(collectionId: string, userId: string) {
      await client.removeEditor(collectionId, userId);
    },
  };
}

function unwrap<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  fallbackCode: string,
): T {
  if (result.error) {
    throw new CollectionError(
      result.error.code ?? fallbackCode,
      result.error.message,
    );
  }
  if (result.data === null) {
    throw new CollectionError(fallbackCode, "Aucune donnée retournée.");
  }
  return result.data;
}

type MemberProfileRow = Membership & {
  profiles: Pick<Tables["profiles"]["Row"], "display_name" | "avatar_url"> | null;
};

type CategoryClueSummaryRow = {
  category_id: string;
  country_code: string;
  status: Tables["clues"]["Row"]["status"];
  clue_images: Array<{ id: string }>;
};

type LegacyCollectionRow = Omit<Collection, "visibility"> & {
  visibility?: Collection["visibility"];
  is_official?: Collection["is_official"];
};

const HIDDEN_PUBLIC_COLLECTION_IDS = new Set([
  "b0000000-0000-0000-0000-000000000001",
]);

function isMissingVisibilityColumn(
  error: { message: string; code?: string } | null,
): boolean {
  if (!error) return false;
  return (
    error.message.includes("visibility") &&
    (error.message.includes("column") || error.code === "42703")
  );
}

function normalizeCollectionVisibility<
  TCollection extends Omit<Collection, "visibility"> & {
    visibility?: Collection["visibility"];
    is_official?: Collection["is_official"];
  },
>(collection: TCollection): Collection {
  return {
    ...collection,
    is_official: collection.is_official ?? false,
    visibility: collection.visibility ?? "private",
  };
}

async function selectCollectionsByIds(
  supabase: SupabaseClient<Database>,
  ids: string[],
): Promise<Collection[]> {
  if (!ids.length) {
    return [];
  }

  const collectionQuery = supabase
    .from("collections")
    .select()
    .in("id", ids)
    .order("created_at");
  const collectionResult = await collectionQuery;

  if (isMissingVisibilityColumn(collectionResult.error)) {
    const legacyResult = await supabase
      .from("collections")
      .select("id, owner_id, name, description, created_at, updated_at")
      .in("id", ids)
      .order("created_at");
    const legacyCollections = unwrap(
      legacyResult as unknown as {
        data: LegacyCollectionRow[] | null;
        error: { message: string; code?: string } | null;
      },
      "collections_list_failed",
    );
    return legacyCollections.map((collection) =>
      normalizeCollectionVisibility(collection),
    );
  }

  const collections = unwrap(collectionResult, "collections_list_failed");
  return collections.map((collection) => normalizeCollectionVisibility(collection));
}

async function listPublicCollections(
  supabase: SupabaseClient<Database>,
): Promise<Collection[]> {
  const publicResult = await supabase
    .from("collections")
    .select()
    .eq("visibility", "public_readonly")
    .order("created_at");
  if (isMissingVisibilityColumn(publicResult.error)) {
    return [];
  }
  const collections = unwrap(publicResult, "collections_list_failed");
  return collections
    .map((collection) => normalizeCollectionVisibility(collection))
    .filter((collection) => !HIDDEN_PUBLIC_COLLECTION_IDS.has(collection.id));
}

export function createSupabaseCollectionDataClient(
  supabase: SupabaseClient<Database>,
): CollectionDataClient {
  return {
    async getCurrentUser() {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        throw new CollectionError("not_authenticated", "Connexion requise.");
      }
      return { id: data.user.id, email: data.user.email ?? null };
    },

    async listCollections(userId) {
      const membershipResult = await supabase
        .from("collection_members")
        .select()
        .eq("user_id", userId)
        .order("created_at");
      const membershipRows = unwrap(membershipResult, "collections_list_failed");
      const privateMemberships = membershipRows.filter(
        (row) => row.collection_id !== null,
      );
      const privateCollectionIds = [
        ...new Set(privateMemberships.map((row) => row.collection_id)),
      ];
      const privateCollections = await selectCollectionsByIds(
        supabase,
        privateCollectionIds,
      );
      const privateCollectionsById = new Map(
        privateCollections.map((collection) => [collection.id, collection]),
      );
      const collectionsWithRole: Array<
        Collection & { current_user_role: Membership["role"] | null }
      > = [];
      for (const membership of privateMemberships) {
        const collection = privateCollectionsById.get(membership.collection_id);
        if (!collection || HIDDEN_PUBLIC_COLLECTION_IDS.has(collection.id)) {
          continue;
        }
        collectionsWithRole.push({
          ...collection,
          current_user_role: membership.role,
        });
      }
      const publicCollections = await listPublicCollections(supabase);

      const collectionsById = new Map<string, Collection & {
        current_user_role: Membership["role"] | null;
      }>();

      for (const collection of collectionsWithRole) {
        collectionsById.set(collection.id, collection);
      }
      for (const collection of publicCollections) {
        if (!collectionsById.has(collection.id)) {
          collectionsById.set(collection.id, {
            ...collection,
            current_user_role: null,
          });
        }
      }

      return [...collectionsById.values()].sort((left, right) =>
        left.created_at.localeCompare(right.created_at),
      );
    },

    async insertCollection(input) {
      const result = await supabase.rpc("create_collection", {
        collection_name: input.name,
        collection_description: input.description ?? null,
      });
      return normalizeCollectionVisibility(
        unwrap(
          result as unknown as {
            data: LegacyCollectionRow | null;
            error: { message: string; code?: string } | null;
          },
          "collection_create_failed",
        ),
      );
    },

    async getMembership(collectionId, userId) {
      const result = await supabase
        .from("collection_members")
        .select()
        .eq("collection_id", collectionId)
        .eq("user_id", userId)
        .single();
      return unwrap(result, "membership_read_failed");
    },

    async updateCollection(collectionId, input) {
      const result = await supabase
        .from("collections")
        .update(input)
        .eq("id", collectionId)
        .select()
        .single();
      return unwrap(result, "collection_update_failed");
    },

    async deleteCollection(collectionId) {
      const { error } = await supabase
        .from("collections")
        .delete()
        .eq("id", collectionId);
      if (error) {
        throw new CollectionError(error.code, error.message);
      }
    },

    async listCategories(collectionId) {
      const result = await supabase
        .from("categories")
        .select()
        .eq("collection_id", collectionId)
        .order("name");
      return unwrap(result, "categories_list_failed");
    },

    async listCategoryStats(collectionId) {
      const result = await supabase
        .from("clues")
        .select("category_id, country_code, status, clue_images(id)")
        .eq("collection_id", collectionId);
      const rows = unwrap(
        result as unknown as {
          data: CategoryClueSummaryRow[] | null;
          error: { message: string; code?: string } | null;
        },
        "category_stats_load_failed",
      );
      const grouped = new Map<
        string,
        {
          clueCount: number;
          publishedCount: number;
          completeCount: number;
          countries: Set<string>;
        }
      >();

      for (const row of rows) {
        const entry = grouped.get(row.category_id) ?? {
          clueCount: 0,
          publishedCount: 0,
          completeCount: 0,
          countries: new Set<string>(),
        };
        entry.clueCount += 1;
        entry.countries.add(row.country_code);
        if (row.status === "published") entry.publishedCount += 1;
        if (row.status === "published" && row.clue_images.length > 0) {
          entry.completeCount += 1;
        }
        grouped.set(row.category_id, entry);
      }

      return [...grouped.entries()].map(([categoryId, entry]) => ({
        categoryId,
        clueCount: entry.clueCount,
        publishedCount: entry.publishedCount,
        countryCount: entry.countries.size,
        completeCount: entry.completeCount,
        completeness:
          entry.clueCount > 0
            ? Math.round((entry.completeCount / entry.clueCount) * 100)
            : 0,
      }));
    },

    async listClueFilterRows(collectionId) {
      const pageSize = 1000;
      const rows: ClueLibraryFilterRow[] = [];
      let from = 0;

      while (true) {
        const result = await supabase
          .from("clues")
          .select(
            "category_id, country_code, status, categories(name), countries(name)",
          )
          .eq("collection_id", collectionId)
          .in("status", ["draft", "published"])
          .order("created_at")
          .order("id")
          .range(from, from + pageSize - 1);
        const page = unwrap(
          result as unknown as {
            data: ClueLibraryFilterRow[] | null;
            error: { message: string; code?: string } | null;
          },
          "clue_library_filters_failed",
        );
        rows.push(...page);
        if (page.length < pageSize) {
          return rows;
        }
        from += pageSize;
      }
    },

    async listClueRows(input) {
      const allowedStatuses = ["draft", "published"] as ClueStatus[];
      const statuses = input.statuses
        ? input.statuses.filter((status) => allowedStatuses.includes(status))
        : allowedStatuses;
      let query = supabase
        .from("clues")
        .select(
          "id, title, status, difficulty, category_id, country_code, characteristics, notes, google_maps_url, created_at, categories(name), countries(name), clue_images(id, storage_path, alt_text, sort_order)",
          { count: "exact" },
        )
        .eq("collection_id", input.collectionId)
        .in("status", statuses)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(input.from, input.to);

      if (input.categoryIds?.length) {
        query = query.in("category_id", input.categoryIds);
      }
      if (input.countryCodes?.length) {
        query = query.in("country_code", input.countryCodes);
      }
      if (input.search) {
        query = query.ilike("title", `%${escapeLikePattern(input.search)}%`);
      }

      const { data, error, count } = await query;
      if (error) {
        throw new CollectionError(
          error.code ?? "clue_library_load_failed",
          error.message,
        );
      }
      return {
        rows: (data ?? []) as unknown as ClueLibraryRow[],
        count: count ?? 0,
      };
    },

    async createSignedImageUrls(paths) {
      if (paths.length === 0) return {};
      const { data, error } = await supabase.storage
        .from("clue-images")
        .createSignedUrls(paths, 60 * 60);
      if (error) {
        throw new CollectionError(
          error.name || "clue_library_images_failed",
          error.message,
        );
      }
      return Object.fromEntries(
        data.flatMap((item, index) =>
          item.signedUrl ? [[paths[index], item.signedUrl] as const] : [],
        ),
      );
    },

    async insertCategory(input) {
      const result = await supabase
        .from("categories")
        .insert(input)
        .select()
        .single();
      return unwrap(result, "category_create_failed");
    },

    async updateCategory(categoryId, input) {
      const result = await supabase
        .from("categories")
        .update(input)
        .eq("id", categoryId)
        .select()
        .single();
      return unwrap(result, "category_update_failed");
    },

    async deleteCategory(categoryId) {
      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);
      if (error) {
        throw new CollectionError(error.code, error.message);
      }
    },

    async listMembers(collectionId) {
      const result = await supabase
        .from("collection_members")
        .select("*, profiles(display_name, avatar_url)")
        .eq("collection_id", collectionId)
        .order("created_at");
      const rows = unwrap(
        result as unknown as {
          data: MemberProfileRow[] | null;
          error: { message: string; code?: string } | null;
        },
        "members_list_failed",
      );
      return rows.map(({ profiles, ...membership }) => ({
        ...membership,
        profile: profiles ?? { display_name: "", avatar_url: null },
      }));
    },

    async sendInvitation(collectionId, email) {
      const { error } = await supabase.functions.invoke(
        "send-collection-invite",
        { body: { collectionId, email } },
      );
      if (error) {
        throw new CollectionError("invitation_send_failed", error.message);
      }
    },

    async acceptInvitation(token) {
      const result = await supabase.rpc("accept_collection_invitation", {
        raw_token: token,
      });
      if (result.error) {
        const message = result.error.message;
        const invitationCode = message.match(/invitation_[a-z_]+/)?.[0];
        throw new CollectionError(
          invitationCode ?? result.error.code ?? "invitation_accept_failed",
          message,
        );
      }
      const accepted = result.data?.[0];
      if (!accepted) {
        throw new CollectionError(
          "invitation_accept_failed",
          "Aucune invitation acceptée.",
        );
      }
      return accepted;
    },

    async removeEditor(collectionId, userId) {
      const { error } = await supabase
        .from("collection_members")
        .delete()
        .eq("collection_id", collectionId)
        .eq("user_id", userId)
        .eq("role", "editor");
      if (error) {
        throw new CollectionError(error.code, error.message);
      }
    },
  };
}

function cleanStringArray(values: string[] | undefined) {
  return values
    ? [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    : undefined;
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

let defaultApi: CollectionApi | undefined;

export function getCollectionApi() {
  defaultApi ??= createCollectionApi(
    createSupabaseCollectionDataClient(getSupabaseClient()),
  );
  return defaultApi;
}
