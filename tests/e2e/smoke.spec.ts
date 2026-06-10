import { expect, test } from "@playwright/test";

test("displays the GeoTrainer Atlas brand", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("GeoTrainer")).toBeVisible();
  await expect(page.getByText("Atlas")).toBeVisible();
});
