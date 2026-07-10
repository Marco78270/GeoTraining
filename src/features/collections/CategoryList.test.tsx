import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import type { ClueApi } from "../clues/clueApi";
import { CategoryList } from "./CategoryList";
import type { CollectionApi } from "./collectionApi";

function renderCategoryList(
  api: CollectionApi,
  options: { clueApi?: ClueApi; readOnly?: boolean } = {},
) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <CategoryList
          collectionId="collection-1"
          api={api}
          clueApi={options.clueApi}
          readOnly={options.readOnly}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("creates a category with a visual icon picker", async () => {
  const user = userEvent.setup();
  const api = {
    listCategories: vi.fn().mockResolvedValue([]),
    listCategoryStats: vi.fn().mockResolvedValue([]),
    listClueFilters: vi.fn().mockResolvedValue({
      categories: [],
      countries: [],
      statuses: [],
    }),
    listClues: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      totalPages: 0,
    }),
    createCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    updateCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
  } as unknown as CollectionApi;

  renderCategoryList(api);

  await screen.findByText("Aucune catégorie.");
  await user.click(screen.getByText("Ajouter une catégorie"));
  await user.click(screen.getByRole("button", { name: "Ajouter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Le nom de la catégorie est obligatoire.",
  );

  await user.type(screen.getByLabelText("Nom de la catégorie"), "STOP");
  await user.click(screen.getByRole("button", { name: "Route" }));
  await user.click(screen.getByRole("button", { name: "Ajouter" }));
  expect(api.createCategory).toHaveBeenCalledWith({
    collectionId: "collection-1",
    name: "STOP",
    icon: "road",
    color: "#20D4E6",
  });
});

it("shows category coverage and completeness in the management table", async () => {
  const api = {
    listCategories: vi.fn().mockResolvedValue([
      {
        id: "category-1",
        collection_id: "collection-1",
        name: "Bollards",
        icon: "milestone",
        color: "#20D4E6",
        created_at: "2026-06-11T00:00:00.000Z",
        updated_at: "2026-06-11T00:00:00.000Z",
      },
    ]),
    listCategoryStats: vi.fn().mockResolvedValue([
      {
        categoryId: "category-1",
        clueCount: 10,
        publishedCount: 8,
        countryCount: 6,
        completeCount: 8,
        completeness: 80,
      },
    ]),
    listClueFilters: vi.fn().mockResolvedValue({
      categories: [],
      countries: [],
      statuses: [],
    }),
    listClues: vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 24,
      totalPages: 0,
    }),
  } as unknown as CollectionApi;

  renderCategoryList(api);

  const clueCount = await screen.findByRole("cell", { name: "10" });
  const countryCount = screen.getByRole("cell", { name: "6" });
  const completeness = screen.getByText("80%").closest("td");

  expect(clueCount).toBeVisible();
  expect(clueCount).toHaveAttribute("data-label", "Indices");
  expect(countryCount).toHaveAttribute("data-label", "Pays");
  expect(completeness).toHaveAttribute("data-label", "Complétude");
});

function createLibraryApi() {
  const listClues = vi.fn().mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 24,
    totalPages: 0,
  });
  const api = {
    listCategories: vi.fn().mockResolvedValue([]),
    listCategoryStats: vi.fn().mockResolvedValue([]),
    listClueFilters: vi.fn().mockResolvedValue({
      categories: [
        { id: "bollards", name: "Bollards" },
        { id: "road-bollards", name: "Road bollards" },
      ],
      countries: [{ code: "MX", name: "Mexico" }],
      statuses: ["draft", "published"],
    }),
    listClues,
  } as unknown as CollectionApi;
  return { api, listClues };
}

async function settleReactQueryWithFakeTimers() {
  await act(async () => {
    await Promise.resolve();
    vi.advanceTimersByTime(0);
    await Promise.resolve();
  });
}

it.each([
  {
    name: "le titre",
    input: () => screen.getByPlaceholderText("Titre de l’indice"),
    text: "jaune",
    expected: { search: "jaune" },
  },
  {
    name: "le pays",
    input: () => screen.getByLabelText("Filtrer par pays"),
    text: "mex",
    expected: { countryCodes: ["MX"] },
  },
  {
    name: "la catégorie",
    input: () => screen.getByLabelText("Filtrer par catégorie"),
    text: "boll",
    expected: { categoryIds: ["bollards", "road-bollards"] },
  },
  {
    name: "le statut",
    input: () => screen.getByLabelText("Filtrer par statut"),
    text: "pub",
    expected: { statuses: ["published"] },
  },
])("attend exactement 250 ms avant de filtrer par $name", async ({
  input,
  text,
  expected,
}) => {
  const { api, listClues } = createLibraryApi();
  vi.useFakeTimers();

  try {
    renderCategoryList(api);
    await settleReactQueryWithFakeTimers();
    expect(listClues).toHaveBeenCalledTimes(1);

    fireEvent.change(input(), { target: { value: text } });
    expect(input()).toHaveValue(text);

    await act(async () => {
      vi.advanceTimersByTime(249);
      await Promise.resolve();
    });
    expect(listClues).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(listClues).toHaveBeenLastCalledWith(expect.objectContaining(expected));
    expect(listClues).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

it("clears the title through its explicit button", async () => {
  const user = userEvent.setup();
  const { api } = createLibraryApi();

  renderCategoryList(api);
  const title = screen.getByPlaceholderText("Titre de l’indice");
  await user.type(title, "jaune");
  await user.click(screen.getByRole("button", { name: "Effacer la recherche par titre" }));

  expect(title).toHaveValue("");
});

it("sends an empty match list instead of falling back to a broad query", async () => {
  const user = userEvent.setup();
  const { api, listClues } = createLibraryApi();

  renderCategoryList(api);
  await waitFor(() => expect(listClues).toHaveBeenCalledTimes(1));
  await user.type(screen.getByLabelText("Filtrer par pays"), "Atlantide");

  await waitFor(() => {
    expect(listClues).toHaveBeenLastCalledWith(
      expect.objectContaining({ countryCodes: [] }),
    );
  });
  expect(listClues).not.toHaveBeenLastCalledWith(
    expect.objectContaining({ countryCodes: undefined }),
  );
});

it("selects a searchable filter suggestion by its exact id", async () => {
  const user = userEvent.setup();
  const { api, listClues } = createLibraryApi();

  renderCategoryList(api);
  await screen.findByRole("heading", { name: "Bibliothèque d’indices" });
  await user.click(
    screen.getByRole("button", { name: "Afficher les options Filtrer par catégorie" }),
  );
  await user.click(screen.getByRole("option", { name: /^Bollards$/ }));

  expect(screen.getByLabelText("Filtrer par catégorie")).toHaveValue("Bollards");
  await waitFor(() => {
    expect(listClues).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoryIds: ["bollards"], page: 1 }),
    );
  });
});

it("resets pagination to page 1 when a filter changes", async () => {
  const { api, listClues } = createLibraryApi();
  listClues.mockResolvedValue({
    items: [],
    total: 48,
    page: 1,
    pageSize: 24,
    totalPages: 2,
  });
  vi.useFakeTimers();

  try {
    renderCategoryList(api);
    await settleReactQueryWithFakeTimers();

    fireEvent.change(screen.getByLabelText("Filtrer par pays"), {
      target: { value: "mex" },
    });
    const nextPage = screen.getByRole("button", { name: /Suivant/ });
    expect(nextPage).toBeDisabled();
    fireEvent.click(nextPage);
    expect(listClues).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });
    expect(listClues).toHaveBeenLastCalledWith(
      expect.objectContaining({ countryCodes: ["MX"], page: 1 }),
    );
  } finally {
    vi.useRealTimers();
  }
});

it("debounces page and filters atomically from page 2 while keeping the grid", async () => {
  vi.useFakeTimers();
  let resolveFiltered!: (value: Awaited<ReturnType<CollectionApi["listClues"]>>) => void;
  const item = {
    id: "clue-page-2",
    title: "Indice page deux",
    status: "published" as const,
    difficulty: "medium" as const,
    category_id: "bollards",
    country_code: "MX",
    characteristics: [],
    notes: null,
    google_maps_url: null,
    created_at: "2026-07-05T00:00:00Z",
    categoryName: "Bollards",
    countryName: "Mexico",
    images: [],
  };
  const { api, listClues } = createLibraryApi();
  listClues.mockImplementation((input) => {
    if (input.countryCodes?.includes("MX")) {
      return new Promise((resolve) => { resolveFiltered = resolve; });
    }
    return Promise.resolve({
      items: input.page === 2 ? [item] : [],
      total: 48,
      page: input.page,
      pageSize: 24,
      totalPages: 2,
    });
  });

  try {
    renderCategoryList(api);
    await settleReactQueryWithFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    fireEvent.click(screen.getByRole("button", { name: /Suivant/ }));
    await settleReactQueryWithFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(listClues).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.getByRole("button", { name: "Voir Indice page deux" })).toBeVisible();

    const callsBeforeTyping = listClues.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Filtrer par pays"), {
      target: { value: "mex" },
    });
    expect(listClues).toHaveBeenCalledTimes(callsBeforeTyping);
    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(listClues).toHaveBeenCalledTimes(callsBeforeTyping + 1);
    expect(listClues).toHaveBeenLastCalledWith(
      expect.objectContaining({ countryCodes: ["MX"], page: 1 }),
    );
    expect(screen.getByRole("button", { name: "Voir Indice page deux" })).toBeVisible();
    resolveFiltered({ items: [], total: 0, page: 1, pageSize: 24, totalPages: 0 });
  } finally {
    vi.useRealTimers();
  }
});

it("previews clues from the active collection", async () => {
  const user = userEvent.setup();
  const listClues = vi.fn().mockResolvedValue({
    items: [
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
        categoryName: "Bollards",
        countryName: "Mexico",
        images: [
          {
            id: "image-1",
            altText: "Bollard mexicain",
            url: "https://signed.example/bollard.png",
          },
        ],
      },
    ],
    total: 1,
    page: 1,
    pageSize: 24,
    totalPages: 1,
  });
  const api = {
    listCategories: vi.fn().mockResolvedValue([]),
    listCategoryStats: vi.fn().mockResolvedValue([]),
    listClueFilters: vi.fn().mockResolvedValue({
      categories: [{ id: "bollards", name: "Bollards" }],
      countries: [{ code: "MX", name: "Mexico" }],
      statuses: ["draft", "published"],
    }),
    listClues,
  } as unknown as CollectionApi;

  renderCategoryList(api);

  expect(
    await screen.findByRole("heading", { name: "Bibliothèque d’indices" }),
  ).toBeVisible();
  await user.click(
    await screen.findByRole("button", { name: "Voir Bollard jaune" }),
  );
  const dialog = screen.getByRole("dialog");
  expect(dialog).toBeVisible();
  expect(within(dialog).getByAltText("Bollard mexicain")).toBeVisible();
  expect(within(dialog).getByRole("link", { name: "Modifier" })).toHaveAttribute(
    "href",
    "/clues/clue-1/edit",
  );
});

it("deletes a clue from its preview after confirmation", async () => {
  const user = userEvent.setup();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  const removeClue = vi.fn().mockResolvedValue(undefined);
  const item = {
    id: "clue-1",
    title: "Bollard jaune",
    status: "draft" as const,
    difficulty: "medium" as const,
    category_id: "bollards",
    country_code: "MX",
    characteristics: [],
    notes: null,
    google_maps_url: null,
    created_at: "2026-06-28T10:00:00Z",
    categoryName: "Bollards",
    countryName: "Mexico",
    images: [],
  };
  const api = {
    listCategories: vi.fn().mockResolvedValue([]),
    listCategoryStats: vi.fn().mockResolvedValue([]),
    listClueFilters: vi.fn().mockResolvedValue({
      categories: [],
      countries: [],
      statuses: ["draft"],
    }),
    listClues: vi.fn().mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      pageSize: 24,
      totalPages: 1,
    }),
  } as unknown as CollectionApi;

  renderCategoryList(api, {
    clueApi: { delete: removeClue } as unknown as ClueApi,
  });

  await user.click(await screen.findByRole("button", { name: "Voir Bollard jaune" }));
  await user.click(screen.getByRole("button", { name: "Supprimer" }));

  expect(confirm).toHaveBeenCalledWith(
    "Supprimer définitivement l’indice « Bollard jaune » et toutes ses images ?",
  );
  await waitFor(() => expect(removeClue).toHaveBeenCalledWith("clue-1"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  confirm.mockRestore();
});
