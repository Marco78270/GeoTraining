import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AcceptInvitationPage } from "./AcceptInvitationPage";
import { CollectionError, type CollectionApi } from "./collectionApi";

function renderPage(api: CollectionApi) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/invitations/raw-token"]}>
        <Routes>
          <Route
            path="/invitations/:token"
            element={<AcceptInvitationPage api={api} />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AcceptInvitationPage", () => {
  it("shows success after accepting the token", async () => {
    renderPage({
      acceptInvitation: vi.fn().mockResolvedValue({
        collection_id: "collection-1",
        collection_name: "STOP",
      }),
    } as unknown as CollectionApi);

    expect(
      await screen.findByText("Vous avez rejoint la collection STOP."),
    ).toHaveAttribute("role", "status");
  });

  it.each([
    ["invitation_expired", "Cette invitation a expiré."],
    [
      "invitation_email_mismatch",
      "Cette invitation est destinée à une autre adresse email.",
    ],
  ])("maps %s to an accessible message", async (code, message) => {
    renderPage({
      acceptInvitation: vi
        .fn()
        .mockRejectedValue(new CollectionError(code, code)),
    } as unknown as CollectionApi);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
