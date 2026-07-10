import { describe, expect, it } from "vitest";
import { validateAvatarFile } from "./avatarImage";

describe("validateAvatarFile", () => {
  it("rejette les formats non supportes", () => {
    expect(validateAvatarFile({ type: "image/gif", size: 10 })).toEqual({
      valid: false,
      reason: "format",
    });
  });

  it("rejette les images trop lourdes", () => {
    expect(
      validateAvatarFile({ type: "image/png", size: 6 * 1024 * 1024 }),
    ).toEqual({
      valid: false,
      reason: "size",
    });
  });

  it("accepte jpeg, png et webp sous la limite", () => {
    expect(
      validateAvatarFile({ type: "image/jpeg", size: 1024 * 1024 }),
    ).toEqual({
      valid: true,
    });
    expect(validateAvatarFile({ type: "image/webp", size: 1024 })).toEqual({
      valid: true,
    });
  });
});
