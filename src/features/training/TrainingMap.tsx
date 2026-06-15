import { useEffect, useRef } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { WorldFeatureCollection } from "../atlas/atlasApi";

type TrainingMapDifficulty = "easy" | "medium" | "expert";
type Viewport = "world" | "country";
type PaintPropertyValue = Parameters<MapLibreMap["setPaintProperty"]>[2];
type Bounds = [[number, number], [number, number]];
type Coordinates = number | Coordinates[];

export type TrainingMapProps = {
  viewport: Viewport;
  countryCode: string | null;
  markers: Array<{
    code: string;
    name: string;
    difficulty: TrainingMapDifficulty;
  }>;
  selectedCode: string | null;
  correctCode: string | null;
  disabled: boolean;
  onSelect: (code: string) => void;
};

const inlineStyle = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "ocean",
      type: "background" as const,
      paint: {
        "background-color": "#07182a",
      },
    },
  ],
};

const WORLD_BOUNDS: Bounds = [
  [-168, -56],
  [178, 75],
];

const difficultyFillColors = {
  easy: "#4fd38a",
  medium: "#f4c84f",
  expert: "#f06b6b",
} as const;

function isCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2;
}

function featureBounds(
  feature: WorldFeatureCollection["features"][number] | undefined,
): Bounds | null {
  if (!feature?.geometry) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function visit(value: Coordinates) {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number"
    ) {
      minX = Math.min(minX, value[0]);
      maxX = Math.max(maxX, value[0]);
      minY = Math.min(minY, value[1]);
      maxY = Math.max(maxY, value[1]);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
    }
  }

  visit(feature.geometry.coordinates as Coordinates);

  return Number.isFinite(minX)
    ? [
        [minX, minY],
        [maxX, maxY],
      ]
    : null;
}

function collectionBounds(collection: WorldFeatureCollection): Bounds | null {
  const bounds = collection.features
    .map((feature) => featureBounds(feature))
    .filter((value): value is Bounds => value !== null);
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce<Bounds>(
    (current, next) => [
      [
        Math.min(current[0][0], next[0][0]),
        Math.min(current[0][1], next[0][1]),
      ],
      [
        Math.max(current[1][0], next[1][0]),
        Math.max(current[1][1], next[1][1]),
      ],
    ],
    bounds[0],
  );
}

export function TrainingMap({
  viewport,
  countryCode,
  markers,
  selectedCode,
  correctCode,
  disabled,
  onSelect,
}: TrainingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const fittedRegionCountryRef = useRef<string | null>(null);
  const callbacksRef = useRef({ onSelect, disabled });
  const markersRef = useRef(markers);
  const viewportRef = useRef(viewport);
  const countryCodeRef = useRef(countryCode);
  const selectedCodeRef = useRef(selectedCode);
  const correctCodeRef = useRef(correctCode);
  const worldFeaturesRef = useRef(
    new Map<string, WorldFeatureCollection["features"][number]>(),
  );

  useEffect(() => {
    callbacksRef.current = { onSelect, disabled };
  }, [onSelect, disabled]);

  useEffect(() => {
    markersRef.current = markers;
    viewportRef.current = viewport;
    countryCodeRef.current = countryCode;
    selectedCodeRef.current = selectedCode;
    correctCodeRef.current = correctCode;
  }, [markers, viewport, countryCode, selectedCode, correctCode]);

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

    void fetch("/geography/world.geojson")
      .then((response) =>
        response.ok ? (response.json() as Promise<WorldFeatureCollection>) : null,
      )
      .then((world) => {
        if (disposed || !world) {
          return;
        }
        worldFeaturesRef.current = new Map(
          world.features.map((feature) => [feature.properties.iso2, feature]),
        );
      })
      .catch(() => {
        worldFeaturesRef.current = new Map();
      });

    void import("maplibre-gl").then((maplibregl) => {
      if (disposed || !containerRef.current) {
        return;
      }

      map = new maplibregl.Map({
        container: containerRef.current,
        style: inlineStyle,
        center: [5, 18],
        zoom: 1.15,
        minZoom: 0.8,
        maxZoom: 7,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: false }),
        "bottom-left",
      );

      map.on("load", () => {
        if (!map) return;
        map.addSource("world-training", {
          type: "geojson",
          data: "/geography/world.geojson",
          promoteId: "iso2",
        });
        map.addLayer({
          id: "training-countries-fill",
          type: "fill",
          source: "world-training",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "selectedCorrect"], false],
              "#20d4e6",
              ["boolean", ["feature-state", "correct"], false],
              "#38d47a",
              ["boolean", ["feature-state", "selectedWrong"], false],
              "#ef5b5b",
              ["boolean", ["feature-state", "hover"], false],
              "#3b6e83",
              ["boolean", ["feature-state", "hasData"], false],
              [
                "match",
                ["feature-state", "difficulty"],
                "easy",
                difficultyFillColors.easy,
                "medium",
                difficultyFillColors.medium,
                "expert",
                difficultyFillColors.expert,
                "#29445f",
              ],
              "#29445f",
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selectedCorrect"], false],
              0.7,
              ["boolean", ["feature-state", "correct"], false],
              0.7,
              ["boolean", ["feature-state", "selectedWrong"], false],
              0.7,
              ["boolean", ["feature-state", "hasData"], false],
              0.42,
              0.84,
            ],
          },
        });
        map.addLayer({
          id: "training-countries-line",
          type: "line",
          source: "world-training",
          paint: {
            "line-color": "#7790a7",
            "line-width": 0.75,
            "line-opacity": 0.7,
          },
        });
        map.fitBounds(WORLD_BOUNDS, { padding: 34, duration: 0 });
        if (viewportRef.current === "world") {
          updateWorldSelection(
            map,
            markersRef.current,
            selectedCodeRef.current,
            correctCodeRef.current,
          );
        } else {
          map.setLayoutProperty("training-countries-fill", "visibility", "none");
          map.setLayoutProperty("training-countries-line", "visibility", "none");
          void updateRegionOverlay(
            map,
            countryCodeRef.current,
            markersRef.current,
            selectedCodeRef.current,
            correctCodeRef.current,
            true,
          );
        }

        let hoveredId: string | number | null = null;
        map.on("mousemove", "training-countries-fill", (event: MapLayerMouseEvent) => {
          if (!map) return;
          if (viewportRef.current !== "world") return;
          const code = event.features?.[0]?.properties?.iso2;
          const interactive =
            !callbacksRef.current.disabled &&
            isCode(code) &&
            markersRef.current.some((country) => country.code === code);
          map.getCanvas().style.cursor = interactive ? "pointer" : "";
          const nextId = event.features?.[0]?.id ?? null;
          if (hoveredId !== null && hoveredId !== nextId) {
            map.setFeatureState(
              { source: "world-training", id: hoveredId },
              { hover: false },
            );
          }
          if (interactive && nextId !== null) {
            map.setFeatureState(
              { source: "world-training", id: nextId },
              { hover: true },
            );
            hoveredId = nextId;
          } else {
            hoveredId = null;
          }
        });
        map.on("mouseleave", "training-countries-fill", () => {
          if (!map) return;
          map.getCanvas().style.cursor = "";
          if (hoveredId !== null) {
            map.setFeatureState(
              { source: "world-training", id: hoveredId },
              { hover: false },
            );
          }
          hoveredId = null;
        });
        map.on("click", "training-countries-fill", (event: MapLayerMouseEvent) => {
          if (callbacksRef.current.disabled || viewportRef.current !== "world") {
            return;
          }
          const code = event.features?.[0]?.properties?.iso2;
          if (
            isCode(code) &&
            markersRef.current.some((country) => country.code === code)
          ) {
            callbacksRef.current.onSelect(code);
          }
        });
        map.on("mousemove", "training-regions-fill", (event: MapLayerMouseEvent) => {
          if (!map) return;
          if (viewportRef.current !== "country") return;
          const code = event.features?.[0]?.properties?.id;
          const interactive =
            !callbacksRef.current.disabled &&
            typeof code === "string" &&
            markersRef.current.some((region) => region.code === code);
          map.getCanvas().style.cursor = interactive ? "pointer" : "";
        });
        map.on("mouseleave", "training-regions-fill", () => {
          if (!map) return;
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "training-regions-fill", (event: MapLayerMouseEvent) => {
          if (callbacksRef.current.disabled || viewportRef.current !== "country") {
            return;
          }
          const code = event.features?.[0]?.properties?.id;
          if (
            typeof code === "string" &&
            markersRef.current.some((region) => region.code === code)
          ) {
            callbacksRef.current.onSelect(code);
          }
        });
      });
    });

    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }

    if (viewport === "world") {
      fittedRegionCountryRef.current = null;
      map.setLayoutProperty("training-countries-fill", "visibility", "visible");
      map.setLayoutProperty("training-countries-line", "visibility", "visible");
      updateWorldSelection(map, markers, selectedCode, correctCode);
      void clearRegionOverlay(map);
      map.fitBounds(WORLD_BOUNDS, { padding: 34, duration: 800 });
      return;
    }

    map.setLayoutProperty("training-countries-fill", "visibility", "none");
    map.setLayoutProperty("training-countries-line", "visibility", "none");
    const shouldFitBounds = fittedRegionCountryRef.current !== countryCode;
    void updateRegionOverlay(
      map,
      countryCode,
      markers,
      selectedCode,
      correctCode,
      shouldFitBounds,
    ).then(() => {
      if (shouldFitBounds && countryCode) {
        fittedRegionCountryRef.current = countryCode;
      }
    });
  }, [viewport, countryCode, markers, selectedCode, correctCode]);

  return (
    <div className="training-map-frame atlas-map-frame">
      <div
        ref={containerRef}
        className="training-map atlas-map"
        aria-label="Carte d'entraînement"
      />
      <div className="map-legend" aria-label="Légende des difficultés">
        <span className="easy">
          <i />
          Facile
        </span>
        <span className="medium">
          <i />
          Moyen
        </span>
        <span className="expert">
          <i />
          Expert
        </span>
      </div>
      <div className="map-access-list" aria-label="Selection accessible">
        {markers.map((marker) => (
          <button
            type="button"
            key={marker.code}
            disabled={disabled}
            onClick={() => onSelect(marker.code)}
          >
            {marker.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function updateWorldSelection(
  map: MapLibreMap,
  markers: TrainingMapProps["markers"],
  selectedCode: string | null,
  correctCode: string | null,
) {
  const nextCodes = new Set(markers.map((country) => country.code));
  for (const country of markers) {
    const isSelected = country.code === selectedCode;
    const isCorrect = country.code === correctCode;
    map.setFeatureState(
      { source: "world-training", id: country.code },
      {
        hasData: true,
        difficulty: country.difficulty,
        selectedCorrect: isSelected && isCorrect,
        selectedWrong: isSelected && !isCorrect,
        correct: !isSelected && isCorrect,
      },
    );
  }
  worldFeaturesRefCleanup(map, nextCodes);
}

function worldFeaturesRefCleanup(map: MapLibreMap, nextCodes: Set<string>) {
  for (const feature of map.querySourceFeatures("world-training")) {
    if (typeof feature.id !== "string" || nextCodes.has(feature.id)) {
      continue;
    }
    map.setFeatureState(
      { source: "world-training", id: feature.id },
      {
        hasData: false,
        difficulty: null,
        selectedCorrect: false,
        selectedWrong: false,
        correct: false,
      },
    );
  }
}

async function clearRegionOverlay(map: MapLibreMap) {
  const source = map.getSource("training-regions") as GeoJSONSource | undefined;
  source?.setData({ type: "FeatureCollection", features: [] });
}

async function updateRegionOverlay(
  map: MapLibreMap,
  countryCode: string | null,
  markers: TrainingMapProps["markers"],
  selectedCode: string | null,
  correctCode: string | null,
  fitToBounds: boolean,
) {
  const source = map.getSource("training-regions") as GeoJSONSource | undefined;
  if (!countryCode) {
    source?.setData({ type: "FeatureCollection", features: [] });
    return;
  }

  const response = await fetch(`/geography/regions/${countryCode}.geojson`);
  if (!response.ok) {
    return;
  }
  const data = normalizeRegionCollection(
    (await response.json()) as WorldFeatureCollection,
  );
  const markerCodes = new Set(markers.map((marker) => marker.code));
  const fillColor: PaintPropertyValue = [
    "case",
    ["==", ["id"], selectedCode ?? ""],
    ["case", ["==", ["id"], correctCode ?? ""], "#20d4e6", "#ef5b5b"],
    ["==", ["id"], correctCode ?? ""],
    "#38d47a",
    ["boolean", ["feature-state", "hasData"], false],
    [
      "match",
      ["feature-state", "difficulty"],
      "easy",
      difficultyFillColors.easy,
      "medium",
      difficultyFillColors.medium,
      "expert",
      difficultyFillColors.expert,
      "#173c57",
    ],
    "#10293d",
  ];
  const fillOpacity: PaintPropertyValue = [
    "case",
    ["==", ["id"], selectedCode ?? ""],
    0.82,
    ["==", ["id"], correctCode ?? ""],
    0.72,
    ["boolean", ["feature-state", "hasData"], false],
    0.62,
    0.16,
  ];

  if (!source) {
      map.addSource("training-regions", {
        type: "geojson",
        data: data as never,
        promoteId: "id",
      });
    map.addLayer({
      id: "training-regions-fill",
      type: "fill",
      source: "training-regions",
      paint: {
        "fill-color": fillColor,
        "fill-opacity": fillOpacity,
      },
    });
    map.addLayer({
      id: "training-regions-line",
      type: "line",
      source: "training-regions",
      paint: {
        "line-color": "#9cb1c5",
        "line-width": 0.8,
        "line-opacity": 0.75,
      },
    });
  } else {
    source.setData(data as never);
    map.setPaintProperty("training-regions-fill", "fill-color", fillColor);
    map.setPaintProperty("training-regions-fill", "fill-opacity", fillOpacity);
  }

  for (const marker of markers) {
    map.setFeatureState(
      { source: "training-regions", id: marker.code },
      {
        hasData: true,
        difficulty: marker.difficulty,
      },
    );
  }

  for (const feature of data.features) {
    const featureId = (feature.properties as { id?: string }).id;
    if (!featureId || markerCodes.has(featureId)) {
      continue;
    }
    map.setFeatureState(
      { source: "training-regions", id: featureId },
      {
        hasData: false,
        difficulty: null,
      },
    );
  }

  const bounds = collectionBounds(data);
  if (fitToBounds && bounds) {
    map.fitBounds(bounds, {
      padding: 40,
      duration: 900,
      maxZoom: 5.2,
    });
  }
}

function normalizeRegionCollection(
  data: WorldFeatureCollection,
): WorldFeatureCollection {
  return {
    ...data,
    features: data.features.map((feature) => {
      const featureWithOptionalId = feature as typeof feature & { id?: string };
      const featureId =
        typeof featureWithOptionalId.id === "string"
          ? featureWithOptionalId.id
          : (feature.properties as { id?: string } | undefined)?.id;
      if (!featureId || featureWithOptionalId.id === featureId) {
        return feature;
      }
      return {
        ...feature,
        id: featureId,
      };
    }),
  };
}
