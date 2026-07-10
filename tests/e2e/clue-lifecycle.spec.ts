import { expect, test, type Locator, type Page } from "@playwright/test";
import { attachBrowserDiagnostics } from "./helpers/browserDiagnostics";

const e2eEmail = process.env.E2E_EMAIL;
const e2ePassword = process.env.E2E_PASSWORD;
const officialCollectionPattern = /Collection officielle|Officielle|public_readonly/i;
const fixtureCollectionName = "E2E Fixture Collection";
const fixtureCategoryName = "E2E Fixture Category";

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function signIn(page: Page) {
  test.skip(!e2eEmail || !e2ePassword, "E2E_EMAIL and E2E_PASSWORD are required.");

  await page.goto("/");
  await page.getByLabel("Email").fill(e2eEmail!);
  await page.getByLabel("Mot de passe").fill(e2ePassword!);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: "GeoTrainer Atlas" })).toBeVisible();
}

async function uploadTestImage(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e-clue.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlAbwAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
}

async function continueClueEditor(page: Page) {
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function selectCountry(page: Page, countryName: string) {
  await page.locator(".clue-step-panel-location select").first().selectOption({
    label: countryName,
  });
}

async function selectAvailableOption(
  locator: Locator,
  preferredLabel?: string,
) {
  let candidates: Array<{ value: string; label: string }> = [];

  await expect
    .poll(
      async () => {
        const options = await locator.locator("option").evaluateAll((nodes) =>
          nodes.map((node) => ({
            value: (node as HTMLOptionElement).value,
            label: node.textContent?.trim() ?? "",
          })),
        );
        candidates = options.filter((option) => option.value && option.label);
        return candidates.length;
      },
      {
        timeout: 10_000,
        message: "Expected the select control to expose at least one selectable option.",
      },
    )
    .toBeGreaterThan(0);

  const preferred = preferredLabel
    ? candidates.find((option) => option.label === preferredLabel)
    : null;
  const chosen = preferred ?? candidates[0];

  if (!chosen) {
    throw new Error("No selectable option is available in the expected select control.");
  }

  await locator.selectOption({ value: chosen.value });
  return chosen.label;
}

async function clickMapForAustralia(page: Page, expectedCountryHeading?: string) {
  const canvas = page.locator(".maplibregl-canvas").first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Atlas map canvas bounding box is unavailable.");
  }

  const positions = [
    { x: 0.79, y: 0.73 },
    { x: 0.77, y: 0.71 },
    { x: 0.81, y: 0.75 },
    { x: 0.75, y: 0.69 },
  ];

  for (const position of positions) {
    await canvas.click({
      position: {
        x: Math.round(box.width * position.x),
        y: Math.round(box.height * position.y),
      },
    });

    if (!expectedCountryHeading) {
      return;
    }

    try {
      await expect(
        page.getByRole("heading", { name: expectedCountryHeading }),
      ).toBeVisible({ timeout: 2_000 });
      return;
    } catch {
      // Try the next nearby click target.
    }
  }

  throw new Error(`Could not select ${expectedCountryHeading ?? "the expected country"} on the atlas map.`);
}

async function searchAtlas(page: Page, search: string) {
  const searchInput = page.getByPlaceholder("Rechercher un pays ou un indice");
  await searchInput.fill(search);
}

async function expectQuizStarted(page: Page) {
  await expect(page.getByText(/Question 1 \//)).toBeVisible();
  await expect(page.getByRole("button", { name: "Question suivante" })).toBeVisible();
}

async function selectOfficialCollectionIfPresent(page: Page) {
  const picker = page.getByLabel("Collection active");
  const options = await picker.locator("option").allTextContents();
  const official = options.find((option) => officialCollectionPattern.test(option));
  if (official) {
    await picker.selectOption({ label: official });
  }
}

test("login, create, edit, consult, delete, and launch a quiz", async ({ page }) => {
  test.setTimeout(120_000);
  const diagnostics = attachBrowserDiagnostics(page);
  const clueTitle = uniqueName("E2E clue");
  const updatedTitle = `${clueTitle} updated`;

  await signIn(page);
  await page.goto("/clues/new");

  await expect(page.getByRole("heading", { name: "Ajouter un indice" })).toBeVisible();
  await uploadTestImage(page);
  await continueClueEditor(page);

  await selectAvailableOption(page.getByLabel(/Collection/i), fixtureCollectionName);
  await selectAvailableOption(page.getByLabel(/Cat/i), fixtureCategoryName);
  await continueClueEditor(page);

  await selectCountry(page, "Australia");
  await page.getByLabel(/Pays entier/i).check();
  await continueClueEditor(page);

  await page.getByLabel("Titre").fill(clueTitle);
  await page.getByLabel(/Caract/i).fill("Ligne 1\nLigne 2");
  await page.getByLabel("Notes").fill("Indice créé pendant le test e2e.");
  await continueClueEditor(page);

  await page.getByRole("button", { name: /Publier .*indice/i }).click();
  await expect(page.getByRole("heading", { name: "Atlas" })).toBeHidden({ timeout: 1 }).catch(() => {});
  await expect(page.getByPlaceholder("Rechercher un pays ou un indice")).toBeVisible();

  await searchAtlas(page, clueTitle);
  await clickMapForAustralia(page, "Australia");
  await expect(page.getByRole("heading", { name: "Australia" })).toBeVisible();
  await expect(page.getByRole("heading", { name: clueTitle })).toBeVisible();

  await page.getByRole("link", { name: /Modifier .*indice/i }).click();
  await expect(page.getByRole("heading", { name: "Modifier un indice" })).toBeVisible();

  await continueClueEditor(page);
  await continueClueEditor(page);
  await continueClueEditor(page);
  await page.getByLabel("Titre").fill(updatedTitle);
  await continueClueEditor(page);
  await page.getByRole("button", { name: /Mettre .* jour .*indice/i }).click();
  await expect(page.getByPlaceholder("Rechercher un pays ou un indice")).toBeVisible();

  await searchAtlas(page, updatedTitle);
  await expect(page.getByRole("heading", { name: updatedTitle })).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Supprimer .*indice/i }).click();
  await expect(page.getByRole("status", { name: "Aucun pays" })).toBeVisible();

  await page.getByRole("link", { name: "Entraînement" }).click();
  await expect(page.getByRole("button", { name: "Lancer" })).toBeVisible();
  await selectOfficialCollectionIfPresent(page);
  await page.getByRole("button", { name: "Lancer" }).click();
  await expectQuizStarted(page);

  await diagnostics.assertClean();
});
