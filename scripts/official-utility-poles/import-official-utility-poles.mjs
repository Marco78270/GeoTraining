import { createClient } from "@supabase/supabase-js";
import { loadLocalEnv } from "../load-env.mjs";
import { runOfficialImport } from "../official-meta/importer.mjs";

loadLocalEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL est requis.");
if (!serviceRoleKey) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY est requis.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const summary = await runOfficialImport({
  category: {
    id: "f1000000-0000-0000-0000-000000000005",
    name: "Poteaux electriques",
  },
  datasetPath: new URL("./utility-poles.geometas.v1.json", import.meta.url),
  summaryFileName: "official-utility-poles-import-summary.json",
  authorEnvName: "SUPABASE_META_AUTHOR_ID",
  dryRun: process.argv.includes("--dry-run"),
  missingImagesOnly: process.argv.includes("--missing-images-only"),
  allowedImageHosts: new Set([
    "paulplay-storage-1.fra1.digitaloceanspaces.com",
  ]),
  supabase,
});

console.log(JSON.stringify(summary, null, 2));
if (summary.failed > 0) process.exitCode = 1;
