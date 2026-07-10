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
  is_official: false,
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
    listCategoryStats: vi.fn().mockResolvedValue([]),
    listClueFilterRows: vi.fn().mockResolvedValue([]),
    listClueRows: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
    createSignedImageUrls: vi.fn().mockResolvedValue({}),
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

  it("deduplicates visible clue library filters", async () => {
    const client = {
      ...createClient(),
      listClueFilterRows: vi.fn().mockResolvedValue([
        {
          category_id: "bollards",
          country_code: "MX",
          status: "published",
          categories: { name: "Bollards" },
          countries: { name: "Mexico" },
        },
        {
          category_id: "bollards",
          country_code: "MX",
          status: "draft",
          categories: { name: "Bollards" },
          countries: { name: "Mexico" },
        },
      ]),
    } as unknown as CollectionDataClient;

    await expect(
      createCollectionApi(client).listClueFilters("collection-1"),
    ).resolves.toEqual({
      categories: [{ id: "bollards", name: "Bollards" }],
      countries: [{ code: "MX", name: "Mexico" }],
      statuses: ["draft", "published"],
    });
  });

  it("loads clue library filters across multiple pages", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      category_id: `category-${index}`,
      country_code: `C${index}`,
      status: "published" as const,
      categories: { name: `Category ${index}` },
      countries: { name: `Country ${index}` },
    }));
    const secondPage = [
      {
        category_id: "category-last",
        country_code: "CZ",
        status: "draft" as const,
        categories: { name: "Category last" },
        countries: { name: "Country last" },
      },
    ];
    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: firstPage,
        error: null,
      })
      .mockResolvedValueOnce({
        data: secondPage,
        error: null,
      });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range,
    };
    const supabase = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;
    const client = createSupabaseCollectionDataClient(supabase);

    const result = await client.listClueFilterRows("collection-1");

    expect(range).toHaveBeenNthCalledWith(1, 0, 999);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(query.order.mock.calls).toEqual([
      ["created_at"],
      ["id"],
      ["created_at"],
      ["id"],
    ]);
    expect(result).toHaveLength(1001);
    expect(result.at(-1)).toEqual(secondPage[0]);
  });

  it("paginates clue library rows and maps signed images", async () => {
    const clueImages = [
      {
        id: "image-2",
        storage_path: "clue-1/second.png",
        alt_text: null,
        sort_order: 2,
      },
      {
        id: "image-1",
        storage_path: "clue-1/first.png",
        alt_text: "Bollard mexicain",
        sort_order: 1,
      },
    ];
    const listClueRows = vi.fn().mockResolvedValue({
      count: 25,
      rows: [
        {
          id: "clue-1",
          title: "Bollard jaune",
          status: "published",
          difficulty: "medium",
          category_id: "bollards",
          country_code: "MX",
          characteristics: ["Jaune"],
          notes: "Visible au Yucatan",
          google_maps_url: "https://maps.google.com/example",
          created_at: "2026-06-28T10:00:00Z",
          categories: { name: "Bollards" },
          countries: { name: "Mexico" },
          clue_images: clueImages,
        },
      ],
    });
    const client = {
      ...createClient(),
      listClueRows,
      createSignedImageUrls: vi.fn().mockResolvedValue({
        "clue-1/first.png": "https://signed.example/first.png",
        "clue-1/second.png": "https://signed.example/second.png",
      }),
    } as unknown as CollectionDataClient;

    const result = await createCollectionApi(client).listClues({
      collectionId: "collection-1",
      categoryIds: [" bollards ", "signs", ""],
      countryCodes: [" MX ", "FR", "   "],
      statuses: ["draft", "published"],
      search: "  jaune  ",
      page: 2,
      pageSize: 24,
    });

    expect(listClueRows).toHaveBeenCalledWith({
      collectionId: "collection-1",
      categoryIds: ["bollards", "signs"],
      countryCodes: ["MX", "FR"],
      statuses: ["draft", "published"],
      search: "jaune",
      from: 24,
      to: 47,
    });
    expect(result.totalPages).toBe(2);
    expect(result.items[0]).toMatchObject({
      categoryName: "Bollards",
      countryName: "Mexico",
      images: [
        { id: "image-1", url: "https://signed.example/first.png" },
        { id: "image-2", url: "https://signed.example/second.png" },
      ],
    });
    expect(clueImages.map((image) => image.id)).toEqual(["image-2", "image-1"]);
  });

  it.each(["categoryIds", "countryCodes", "statuses"] as const)(
    "returns an empty page without loading clues when %s is explicitly empty",
    async (filter) => {
      const client = createClient();

      await expect(
        createCollectionApi(client).listClues({
          collectionId: "collection-1",
          [filter]: [],
          page: 2,
          pageSize: 24,
        }),
      ).resolves.toEqual({
        items: [],
        total: 0,
        page: 2,
        pageSize: 24,
        totalPages: 0,
      });
      expect(client.listClueRows).not.toHaveBeenCalled();
      expect(client.createSignedImageUrls).not.toHaveBeenCalled();
    },
  );

  it("applies non-empty clue filters with a single allowed-status constraint", async () => {
    const queryResult = Promise.resolve({ data: [], error: null, count: 0 });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      then: queryResult.then.bind(queryResult),
    };
    const supabase = {
      from: vi.fn().mockReturnValue(query),
    } as unknown as SupabaseClient<Database>;

    await createSupabaseCollectionDataClient(supabase).listClueRows({
      collectionId: "collection-1",
      categoryIds: ["bollards", "signs"],
      countryCodes: ["MX", "FR"],
      statuses: ["published"],
      search: "100%_done\\path",
      from: 0,
      to: 23,
    });

    expect(query.in.mock.calls).toEqual([
      ["status", ["published"]],
      ["category_id", ["bollards", "signs"]],
      ["country_code", ["MX", "FR"]],
    ]);
    expect(query.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(query.ilike).toHaveBeenCalledWith(
      "title",
      "%100\\%\\_done\\\\path%",
    );
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
