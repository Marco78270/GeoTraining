import { expect, test } from "@playwright/test";

test("displays login without requiring a Supabase backend", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("GeoTrainer")).toBeVisible();
  await expect(page.getByText("Atlas", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Configuration requise");
});
