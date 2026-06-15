import { expect, test } from "@playwright/test";

test("displays the login page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("GeoTrainer")).toBeVisible();
  await expect(page.getByText("Atlas", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Se connecter" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeEnabled();
  await expect(page.getByLabel("Mot de passe")).toBeEnabled();
});
