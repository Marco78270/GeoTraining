import { describe, expect, it, vi } from "vitest";
import {
  CollectionError,
  createCollectionApi,
  createSupabaseCollectionDataClient,
  type CollectionDataClient,
} from "./collectionApi";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

const collection = {
  id: "collection-1",
  owner_id: "user-1",
  name: "Panneaux",
  description: null,
  created_at: "2026-06-10T10:00:00Z",
  updated_at: "2026-06-10T10:00:00Z",
};

function createClient(
  overrides: Partial<CollectionDataClient> = {},
): CollectionDataClient {
  return {
    getCurrentUser: vi.fn().mockResolvedValue({
      id: "user-1",
      email: "marco@example.com",
    }),
    listCollections: vi.fn().mockResolvedValue([]),
    insertCollection: vi.fn().mockResolvedValue(collection),
    getMembership: vi.fn().mockResolvedValue({
      collection_id: "collection-1",
      user_id: "user-1",
      role: "owner",
      created_at: "2026-06-10T10:00:00Z",
      updated_at: "2026-06-10T10:00:00Z",
    }),
    updateCollection: vi.fn().mockResolvedValue(collection),
    deleteCollection: vi.fn().mockResolvedValue(undefined),
    listCategories: vi.fn().mockResolvedValue([]),
    insertCategory: vi.fn().mockImplementation(async (input) => ({
      id: `category-${input.name}`,
      created_at: "2026-06-10T10:00:00Z",
      updated_at: "2026-06-10T10:00:00Z",
      ...input,
    })),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
    sendInvitation: vi.fn().mockResolvedValue(undefined),
    acceptInvitation: vi.fn().mockResolvedValue({
      collection_id: "collection-1",
      collection_name: "Panneaux",
    }),
    removeEditor: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("collectionApi", () => {
  it("creates collections through the authenticated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: collection, error: null });
    const supabase = {
      rpc,
    } as unknown as SupabaseClient<Database>;
    const client = createSupabaseCollectionDataClient(supabase);

    await expect(
      client.insertCollection({
        owner_id: "user-1",
        name: "Panneaux",
        description: null,
      }),
    ).resolves.toEqual(collection);

    expect(rpc).toHaveBeenCalledWith("create_collection", {
      collection_name: "Panneaux",
      collection_description: null,
    });
  });

  it("creates a collection and returns its owner membership", async () => {
    const client = createClient();
    const api = createCollectionApi(client);

    const result = await api.createCollection({ name: "  Panneaux  " });

    expect(client.insertCollection).toHaveBeenCalledWith({
      owner_id: "user-1",
      name: "Panneaux",
      description: null,
    });
    expect(result.membership.role).toBe("owner");
  });

  it("lists only collections visible to the current user", async () => {
    const client = createClient({
      listCollections: vi.fn().mockResolvedValue([
        { ...collection, current_user_role: "owner" },
        {
          ...collection,
          id: "collection-2",
          name: "Marquages",
          current_user_role: "editor",
        },
      ]),
    });

    await expect(createCollectionApi(client).listCollections()).resolves.toEqual([
      expect.objectContaining({ id: "collection-1", role: "owner" }),
      expect.objectContaining({ id: "collection-2", role: "editor" }),
    ]);
  });

  it("creates one category per non-empty unique submitted name", async () => {
    const client = createClient();
    const api = createCollectionApi(client);

    const result = await api.createCategories({
      collectionId: "collection-1",
      names: [" STOP ", "", "stop", "Bollards"],
      icon: "sign",
      color: "#20D4E6",
    });

    expect(client.insertCategory).toHaveBeenCalledTimes(2);
    expect(result.map((category) => category.name)).toEqual(["STOP", "Bollards"]);
  });

  it("rejects an invitation when the signed-in email differs", async () => {
    const client = createClient({
      acceptInvitation: vi.fn().mockRejectedValue(
        new CollectionError("invitation_email_mismatch", "Email différent."),
      ),
    });

    await expect(
      createCollectionApi(client).acceptInvitation("raw-token"),
    ).rejects.toMatchObject({ code: "invitation_email_mismatch" });
  });
});
