import { describe, expect, it } from "vitest";
import {
  createSupabaseClient,
  SupabaseConfigurationError,
} from "./supabase";

describe("createSupabaseClient", () => {
  it("rejects an invalid Supabase URL", () => {
    expect(() =>
      createSupabaseClient({
        url: "not-a-url",
        anonKey: "public-anon-key",
      }),
    ).toThrow(SupabaseConfigurationError);
  });

  it("rejects a missing or placeholder anonymous key", () => {
    expect(() =>
      createSupabaseClient({
        url: "https://example.supabase.co",
        anonKey: "replace-with-your-supabase-anon-key",
      }),
    ).toThrow("VITE_SUPABASE_ANON_KEY");
  });
});
