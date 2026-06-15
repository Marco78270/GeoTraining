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
  visibility: "private" as const,
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
        visibility: "private",
      }),
    ).resolves.toEqual(collection);

    expect(rpc).toHaveBeenCalledWith("create_collection", {
      collection_name: "Panneaux",
      collection_description: null,
    });
  });

  it("falls back to private collections when the visibility column is not deployed yet", async () => {
    const membershipQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            collection_id: "collection-1",
            user_id: "user-1",
            role: "owner",
            created_at: "2026-06-10T10:00:00Z",
            updated_at: "2026-06-10T10:00:00Z",
          },
        ],
        error: null,
      }),
    };
    const privateCollectionsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi
        .fn()
        .mockResolvedValueOnce({
          data: null,
          error: {
            code: "42703",
            message: "column collections.visibility does not exist",
          },
        })
        .mockResolvedValueOnce({
          data: [
            {
              id: "collection-1",
              owner_id: "user-1",
              name: "Panneaux",
              description: null,
              created_at: "2026-06-10T10:00:00Z",
              updated_at: "2026-06-10T10:00:00Z",
            },
          ],
          error: null,
        }),
    };
    const publicQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "42703",
          message: "column collections.visibility does not exist",
        },
      }),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(privateCollectionsQuery)
      .mockReturnValueOnce(privateCollectionsQuery)
      .mockReturnValueOnce(publicQuery);
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "marco@example.com" } },
          error: null,
        }),
      },
      from,
    } as unknown as SupabaseClient<Database>;

    await expect(
      createSupabaseCollectionDataClient(supabase).listCollections("user-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "collection-1",
        visibility: "private",
        current_user_role: "owner",
      }),
    ]);
  });

  it("returns public readonly collections alongside private memberships", async () => {
    const membershipQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            collection_id: "collection-1",
            user_id: "user-1",
            role: "owner",
            created_at: "2026-06-10T10:00:00Z",
            updated_at: "2026-06-10T10:00:00Z",
          },
        ],
        error: null,
      }),
    };
    const privateCollectionsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [collection],
        error: null,
      }),
    };
    const publicQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            ...collection,
            id: "collection-public",
            name: "Collection officielle",
            owner_id: null,
            visibility: "public_readonly",
          },
        ],
        error: null,
      }),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(privateCollectionsQuery)
      .mockReturnValueOnce(publicQuery);
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "marco@example.com" } },
          error: null,
        }),
      },
      from,
    } as unknown as SupabaseClient<Database>;

    await expect(
      createSupabaseCollectionDataClient(supabase).listCollections("user-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "collection-1",
        current_user_role: "owner",
      }),
      expect.objectContaining({
        id: "collection-public",
        visibility: "public_readonly",
        current_user_role: null,
      }),
    ]);
  });

  it("hides the legacy public bollards collection from visible lists", async () => {
    const membershipQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            collection_id: "b0000000-0000-0000-0000-000000000001",
            user_id: "user-1",
            role: "owner",
            created_at: "2026-06-10T10:00:00Z",
            updated_at: "2026-06-10T10:00:00Z",
          },
        ],
        error: null,
      }),
    };
    const privateCollectionsQuery = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            ...collection,
            id: "b0000000-0000-0000-0000-000000000001",
            name: "Bollards",
            visibility: "public_readonly",
          },
        ],
        error: null,
      }),
    };
    const publicQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            ...collection,
            id: "f0000000-0000-0000-0000-000000000001",
            name: "Collection officielle",
            owner_id: null,
            visibility: "public_readonly",
          },
          {
            ...collection,
            id: "b0000000-0000-0000-0000-000000000001",
            name: "Bollards",
            owner_id: null,
            visibility: "public_readonly",
          },
        ],
        error: null,
      }),
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(membershipQuery)
      .mockReturnValueOnce(privateCollectionsQuery)
      .mockReturnValueOnce(publicQuery);
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", email: "marco@example.com" } },
          error: null,
        }),
      },
      from,
    } as unknown as SupabaseClient<Database>;

    await expect(
      createSupabaseCollectionDataClient(supabase).listCollections("user-1"),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "f0000000-0000-0000-0000-000000000001",
        name: "Collection officielle",
      }),
    ]);
  });

  it("creates a collection and returns its owner membership", async () => {
    const client = createClient();
    const api = createCollectionApi(client);

    const result = await api.createCollection({ name: "  Panneaux  " });

    expect(client.insertCollection).toHaveBeenCalledWith({
      owner_id: "user-1",
      name: "Panneaux",
      description: null,
      visibility: "private",
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

  it("includes public readonly collections without a membership role", async () => {
    const client = createClient({
      listCollections: vi.fn().mockResolvedValue([
        {
          ...collection,
          id: "collection-public",
          name: "Collection officielle",
          visibility: "public_readonly",
          current_user_role: null,
        },
      ]),
    });

    await expect(createCollectionApi(client).listCollections()).resolves.toEqual([
      expect.objectContaining({
        id: "collection-public",
        visibility: "public_readonly",
        role: null,
      }),
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
