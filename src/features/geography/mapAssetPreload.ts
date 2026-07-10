import { loadWorldGeoJson, loadWorldOutlineGeoJson } from "./geographyApi";

let atlasMapModulePromise: Promise<typeof import("../atlas/AtlasMap")> | null = null;
let trainingMapModulePromise: Promise<typeof import("../training/TrainingMap")> | null =
  null;
let clueLocationAtlasModulePromise:
  | Promise<typeof import("../clues/ClueLocationAtlas")>
  | null = null;

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function isJsdomRuntime() {
  return typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
}

function preloadSharedGeoJson() {
  if (isJsdomRuntime()) {
    return;
  }
  void loadWorldGeoJson();
  void loadWorldOutlineGeoJson();
}

export function preloadAtlasMapModule() {
  atlasMapModulePromise ??= import("../atlas/AtlasMap");
  return atlasMapModulePromise;
}

export function preloadTrainingMapModule() {
  trainingMapModulePromise ??= import("../training/TrainingMap");
  return trainingMapModulePromise;
}

export function preloadClueLocationAtlasModule() {
  clueLocationAtlasModulePromise ??= import("../clues/ClueLocationAtlas");
  return clueLocationAtlasModulePromise;
}

export function preloadAtlasExperience() {
  void preloadAtlasMapModule();
  preloadSharedGeoJson();
}

export function preloadTrainingExperience() {
  void preloadTrainingMapModule();
  preloadSharedGeoJson();
}

export function preloadClueLocationExperience() {
  void preloadClueLocationAtlasModule();
  preloadSharedGeoJson();
}

export function scheduleMapAssetPreload(task: () => void) {
  if (typeof window === "undefined") {
    task();
    return () => undefined;
  }

  const idleWindow = window as IdleWindow;
  if (typeof idleWindow.requestIdleCallback === "function") {
    const handle = idleWindow.requestIdleCallback(() => {
      task();
    });
    return () => {
      idleWindow.cancelIdleCallback?.(handle);
    };
  }

  const timeoutId = window.setTimeout(() => {
    task();
  }, 150);
  return () => {
    window.clearTimeout(timeoutId);
  };
}
