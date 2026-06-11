import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { getSupabaseClient } from "../../lib/supabase";

type Tables = Database["public"]["Tables"];
export type Collection = Tables["collections"]["Row"];
export type Membership = Tables["collection_members"]["Row"];
export type Category = Tables["categories"]["Row"];

export type CollectionSummary = Pick<
  Collection,
  "id" | "name" | "description" | "owner_id" | "created_at" | "updated_at"
> & {
  role: Membership["role"];
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
    Array<Collection & { current_user_role: Membership["role"] }>
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

type MembershipCollectionRow = Membership & {
  collections: Collection | null;
};

type MemberProfileRow = Membership & {
  profiles: Pick<Tables["profiles"]["Row"], "display_name" | "avatar_url"> | null;
};

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
      const result = await supabase
        .from("collection_members")
        .select("*, collections(*)")
        .eq("user_id", userId)
        .order("created_at");
      const rows = unwrap(
        result as unknown as {
          data: MembershipCollectionRow[] | null;
          error: { message: string; code?: string } | null;
        },
        "collections_list_failed",
      );
      return rows
        .filter(
          (row): row is MembershipCollectionRow & { collections: Collection } =>
            row.collections !== null,
        )
        .map((row) => ({
          ...row.collections,
          current_user_role: row.role,
        }));
    },

    async insertCollection(input) {
      const result = await supabase.rpc("create_collection", {
        collection_name: input.name,
        collection_description: input.description ?? null,
      });
      return unwrap(result, "collection_create_failed");
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

let defaultApi: CollectionApi | undefined;

export function getCollectionApi() {
  defaultApi ??= createCollectionApi(
    createSupabaseCollectionDataClient(getSupabaseClient()),
  );
  return defaultApi;
}

export const listCollections = () => getCollectionApi().listCollections();
export const createCollection = (input: CreateCollectionInput) =>
  getCollectionApi().createCollection(input);
export const updateCollection = (
  collectionId: string,
  input: CreateCollectionInput,
) => getCollectionApi().updateCollection(collectionId, input);
export const deleteCollection = (collectionId: string) =>
  getCollectionApi().deleteCollection(collectionId);
export const createCategory = (input: CreateCategoryInput) =>
  getCollectionApi().createCategory(input);
export const updateCategory = (
  categoryId: string,
  input: Pick<CreateCategoryInput, "name" | "icon" | "color">,
) => getCollectionApi().updateCategory(categoryId, input);
export const deleteCategory = (categoryId: string) =>
  getCollectionApi().deleteCategory(categoryId);
export const listMembers = (collectionId: string) =>
  getCollectionApi().listMembers(collectionId);
export const inviteEditor = (collectionId: string, email: string) =>
  getCollectionApi().inviteEditor(collectionId, email);
export const acceptInvitation = (token: string) =>
  getCollectionApi().acceptInvitation(token);
export const removeEditor = (collectionId: string, userId: string) =>
  getCollectionApi().removeEditor(collectionId, userId);
