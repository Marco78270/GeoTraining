import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { AtlasCountry } from "./atlasApi";
import type { WorldFeatureCollection } from "./atlasApi";

type Viewport = "world" | "country";
type AtlasMapCountry = Pick<
  AtlasCountry,
  "code" | "name" | "coordinates" | "difficulty"
>;

export type AtlasMapProps = {
  markers: AtlasMapCountry[];
  selectedCountryCode: string | null;
  selectedRegionId?: string | null;
  viewport: Viewport;
  hasWholeCountryCoverage?: boolean;
  coveredRegionIds?: string[];
  onCountrySelect(code: string): void;
  onRegionSelect?(regionId: string): void;
  onViewportChange(viewport: Viewport): void;
};

const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-168, -56],
  [178, 75],
];

function isSupportedCountryCode(
  code: unknown,
  supportedCodes: ReadonlySet<string>,
): code is string {
  return typeof code === "string" && supportedCodes.has(code);
}

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

const difficultyFillColors = {
  easy: "#4fd38a",
  medium: "#f4c84f",
  expert: "#f06b6b",
} as const;

type Bounds = [[number, number], [number, number]];
type Coordinates = number | Coordinates[];
type PaintPropertyValue = Parameters<MapLibreMap["setPaintProperty"]>[2];

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

export function AtlasMap({
  markers,
  selectedCountryCode,
  selectedRegionId = null,
  viewport,
  hasWholeCountryCoverage = false,
  coveredRegionIds = [],
  onCountrySelect,
  onRegionSelect,
  onViewportChange,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacksRef = useRef({ onCountrySelect, onRegionSelect, onViewportChange });
  const markersRef = useRef(markers);
  const selectedCountryCodeRef = useRef(selectedCountryCode);
  const selectedRegionIdRef = useRef(selectedRegionId);
  const previousSelectedCountryCodeRef = useRef<string | null>(null);
  const previousMarkerCodesRef = useRef<Set<string>>(new Set());
  const viewportRef = useRef(viewport);
  const hasWholeCountryCoverageRef = useRef(hasWholeCountryCoverage);
  const coveredRegionIdsRef = useRef(coveredRegionIds);
  const worldFeaturesRef = useRef(
    new Map<string, WorldFeatureCollection["features"][number]>(),
  );

  useEffect(() => {
    callbacksRef.current = { onCountrySelect, onRegionSelect, onViewportChange };
  }, [onCountrySelect, onRegionSelect, onViewportChange]);

  useEffect(() => {
    markersRef.current = markers;
    selectedCountryCodeRef.current = selectedCountryCode;
    selectedRegionIdRef.current = selectedRegionId;
    viewportRef.current = viewport;
    hasWholeCountryCoverageRef.current = hasWholeCountryCoverage;
    coveredRegionIdsRef.current = coveredRegionIds;
  }, [
    markers,
    selectedCountryCode,
    selectedRegionId,
    viewport,
    hasWholeCountryCoverage,
    coveredRegionIds,
  ]);

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
        if (!disposed) {
          worldFeaturesRef.current = new Map();
        }
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
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");
      map.addControl(new maplibregl.FullscreenControl(), "top-right");

      map.on("load", () => {
        if (!map) {
          return;
        }
        map.addSource("world-demo", {
          type: "geojson",
          data: "/geography/world.geojson",
          promoteId: "iso2",
        });
        map.addLayer({
          id: "countries-fill",
          type: "fill",
          source: "world-demo",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#20d4e6",
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
              ["boolean", ["feature-state", "selected"], false],
              0.7,
              ["boolean", ["feature-state", "hasData"], false],
              0.42,
              0.84,
            ],
          },
        });
        map.addLayer({
          id: "countries-line",
          type: "line",
          source: "world-demo",
          paint: {
            "line-color": "#7790a7",
            "line-width": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              1.6,
              0.75,
            ],
            "line-opacity": 0.7,
          },
        });

        updateSelection(
          map,
          markersRef.current,
          selectedCountryCodeRef.current,
          viewportRef.current,
          worldFeaturesRef.current,
          previousMarkerCodesRef.current,
        );
        previousSelectedCountryCodeRef.current = selectedCountryCodeRef.current;
        void updateRegionOverlay(
          map,
          selectedCountryCodeRef.current,
          selectedRegionIdRef.current,
          viewportRef.current,
          hasWholeCountryCoverageRef.current,
          coveredRegionIdsRef.current,
        );

        let hoveredId: string | number | null = null;
        map.on("mousemove", "countries-fill", (event: MapLayerMouseEvent) => {
          if (!map) {
            return;
          }
          const code = event.features?.[0]?.properties?.iso2;
          const interactive = isSupportedCountryCode(
            code,
            new Set(markersRef.current.map((country) => country.code)),
          );
          map.getCanvas().style.cursor = interactive ? "pointer" : "";
          const nextId = event.features?.[0]?.id ?? null;
          if (hoveredId !== null && hoveredId !== nextId) {
            map.setFeatureState({ source: "world-demo", id: hoveredId }, { hover: false });
          }
          if (interactive && nextId !== null) {
            map.setFeatureState({ source: "world-demo", id: nextId }, { hover: true });
          }
          hoveredId = interactive ? nextId : null;
        });
        map.on("mouseleave", "countries-fill", () => {
          if (!map) {
            return;
          }
          map.getCanvas().style.cursor = "";
          if (hoveredId !== null) {
            map.setFeatureState({ source: "world-demo", id: hoveredId }, { hover: false });
          }
          hoveredId = null;
        });
        map.on("click", "countries-fill", (event: MapLayerMouseEvent) => {
          const code = event.features?.[0]?.properties?.iso2;
          if (
            isSupportedCountryCode(
              code,
              new Set(markersRef.current.map((country) => country.code)),
            )
          ) {
            callbacksRef.current.onCountrySelect(code);
            callbacksRef.current.onViewportChange("country");
          }
        });
        map.on("mousemove", "country-regions-fill", (event: MapLayerMouseEvent) => {
          if (!map) {
            return;
          }
          const regionId = event.features?.[0]?.properties?.id;
          const interactive =
            typeof regionId === "string" &&
            coveredRegionIdsRef.current.includes(regionId);
          map.getCanvas().style.cursor = interactive ? "pointer" : "";
        });
        map.on("mouseleave", "country-regions-fill", () => {
          if (!map) {
            return;
          }
          map.getCanvas().style.cursor = "";
        });
        map.on("click", "country-regions-fill", (event: MapLayerMouseEvent) => {
          const regionId = event.features?.[0]?.properties?.id;
          if (
            typeof regionId === "string" &&
            coveredRegionIdsRef.current.includes(regionId)
          ) {
            callbacksRef.current.onRegionSelect?.(regionId);
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
    map.setLayoutProperty("countries-fill", "visibility", "visible");
    map.setLayoutProperty("countries-line", "visibility", "visible");
    updateSelection(
      map,
      markers,
      selectedCountryCode,
      viewport,
      worldFeaturesRef.current,
      previousMarkerCodesRef.current,
    );
    if (
      previousSelectedCountryCodeRef.current &&
      previousSelectedCountryCodeRef.current !== selectedCountryCode
    ) {
      map.setFeatureState(
        { source: "world-demo", id: previousSelectedCountryCodeRef.current },
        { selected: false },
      );
    }
    previousSelectedCountryCodeRef.current = selectedCountryCode;
  }, [markers, selectedCountryCode, viewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }
    void updateRegionOverlay(
      map,
      selectedCountryCode,
      selectedRegionId,
      viewport,
      hasWholeCountryCoverage,
      coveredRegionIds,
    );
  }, [
    selectedCountryCode,
    selectedRegionId,
    viewport,
    hasWholeCountryCoverage,
    coveredRegionIds,
  ]);

  return (
    <div className="atlas-map-frame">
      <div ref={containerRef} className="atlas-map" aria-label="Carte mondiale interactive" />
      <div className="map-data-attribution">
        <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">
          Natural Earth
        </a>
        <span>·</span>
        <a href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">
          geoBoundaries
        </a>
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noreferrer"
        >
          CC BY 4.0
        </a>
      </div>
      <div className="map-access-list" aria-label="Sélection accessible des pays">
        {markers.map((country) => (
          <button
            type="button"
            key={country.code}
            onClick={() => {
              onCountrySelect(country.code);
              onViewportChange("country");
            }}
          >
            {country.name}
          </button>
        ))}
      </div>
    </div>
  );
}

async function updateRegionOverlay(
  map: MapLibreMap,
  selectedCountryCode: string | null,
  selectedRegionId: string | null,
  viewport: Viewport,
  hasWholeCountryCoverage: boolean,
  coveredRegionIds: string[],
) {
  const coveredRegionMatchExpression: PaintPropertyValue = [
    "match",
    ["get", "id"],
    coveredRegionIds,
    true,
    false,
  ];
  const source = map.getSource("country-regions") as GeoJSONSource | undefined;
  const fillColor: PaintPropertyValue = [
    "case",
    ["==", ["get", "id"], selectedRegionId ?? ""],
    "#23e7ff",
    coveredRegionMatchExpression,
    "#20d4e6",
    hasWholeCountryCoverage,
    "#173c57",
    "#10293d",
  ];
  const fillOpacity: PaintPropertyValue = [
    "case",
    ["==", ["get", "id"], selectedRegionId ?? ""],
    0.82,
    coveredRegionMatchExpression,
    0.62,
    hasWholeCountryCoverage,
    0.38,
    0.16,
  ];
  if (!selectedCountryCode || viewport !== "country") {
    source?.setData({
      type: "FeatureCollection",
      features: [],
    });
    return;
  }

  try {
    const response = await fetch(`/geography/regions/${selectedCountryCode}.geojson`);
    if (!response.ok) return;
    const data = await response.json();

    if (!source) {
      map.addSource("country-regions", {
        type: "geojson",
        data,
      });
      map.addLayer({
        id: "selected-country-fill",
        type: "fill",
        source: "country-regions",
        paint: {
          "fill-color": "#20d4e6",
          "fill-opacity": 0.18,
        },
      });
      map.addLayer({
        id: "country-regions-fill",
        type: "fill",
        source: "country-regions",
        paint: {
          "fill-color": fillColor,
          "fill-opacity": fillOpacity,
        },
      });
      map.addLayer({
        id: "country-regions-line",
        type: "line",
        source: "country-regions",
        paint: {
          "line-color": "#9cb1c5",
          "line-width": 0.8,
          "line-opacity": 0.75,
        },
      });
      return;
    }

    source.setData(data);
    map.setPaintProperty("country-regions-fill", "fill-color", fillColor);
    map.setPaintProperty("country-regions-fill", "fill-opacity", fillOpacity);
  } catch {
    // Keep the country map usable even when regional geometry is missing.
  }
}

function updateSelection(
  map: MapLibreMap,
  markers: AtlasMapCountry[],
  selectedCountryCode: string | null,
  viewport: Viewport,
  worldFeatures: ReadonlyMap<string, WorldFeatureCollection["features"][number]>,
  previousMarkerCodes: Set<string>,
) {
  const nextMarkerCodes = new Set(markers.map((country) => country.code));

  for (const code of previousMarkerCodes) {
    if (!nextMarkerCodes.has(code)) {
      map.setFeatureState(
        { source: "world-demo", id: code },
        { selected: false, hasData: false, difficulty: null },
      );
    }
  }

  for (const country of markers) {
    const isSelectedInCountryView =
      viewport === "country" && country.code === selectedCountryCode;

    map.setFeatureState(
      { source: "world-demo", id: country.code },
      {
        selected: viewport === "world" && country.code === selectedCountryCode,
        hasData: isSelectedInCountryView ? false : true,
        difficulty: country.difficulty,
      },
    );
  }

  previousMarkerCodes.clear();
  for (const code of nextMarkerCodes) {
    previousMarkerCodes.add(code);
  }

  const selected = selectedCountryCode
    ? worldFeatures.get(selectedCountryCode)
    : undefined;
  const bounds = featureBounds(selected);

  if (bounds && viewport === "country") {
    map.fitBounds(bounds, {
      padding: 40,
      duration: 900,
      maxZoom: 4.8,
    });
    return;
  }

  map.fitBounds(WORLD_BOUNDS, { padding: 34, duration: 800 });
}
