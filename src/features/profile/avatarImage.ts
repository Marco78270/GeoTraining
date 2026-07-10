export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function validateAvatarFile(file: Pick<File, "type" | "size">) {
  if (!AVATAR_TYPES.has(file.type)) {
    return { valid: false, reason: "format" } as const;
  }

  if (file.size > MAX_AVATAR_BYTES) {
    return { valid: false, reason: "size" } as const;
  }

  return { valid: true } as const;
}

export async function prepareAvatar(file: File): Promise<Blob> {
  const validation = validateAvatarFile(file);
  if (!validation.valid) {
    throw Object.assign(new Error("Avatar invalide."), {
      code: `avatar_${validation.reason}`,
    });
  }

  const image = await createImageBitmap(file);
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");

  if (!context) {
    image.close();
    throw new Error("Canvas indisponible.");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    512,
    512,
  );
  image.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Conversion impossible."));
      },
      "image/webp",
      0.86,
    );
  });
}
