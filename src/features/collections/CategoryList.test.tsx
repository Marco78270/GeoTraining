import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CategoryList } from "./CategoryList";
import type { CollectionApi } from "./collectionApi";

it("creates, edits and deletes categories with validation", async () => {
  const user = userEvent.setup();
  const api = {
    listCategories: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    updateCategory: vi.fn().mockResolvedValue({ id: "category-1" }),
    deleteCategory: vi.fn().mockResolvedValue(undefined),
  } as unknown as CollectionApi;

  render(
    <QueryClientProvider client={new QueryClient()}>
      <CategoryList collectionId="collection-1" api={api} />
    </QueryClientProvider>,
  );

  await screen.findByText("Aucune catégorie.");
  await user.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Le nom de la catégorie est obligatoire.",
  );

  await user.type(screen.getByLabelText("Nom de la catégorie"), "STOP");
  await user.click(screen.getByRole("button", { name: "Ajouter la catégorie" }));
  expect(api.createCategory).toHaveBeenCalledWith({
    collectionId: "collection-1",
    name: "STOP",
    icon: "sign",
    color: "#20D4E6",
  });
});
