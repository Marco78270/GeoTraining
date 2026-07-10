import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import type { ClueZoneGeoJson } from "../clues/clueLocationTypes";
import {
  loadRegionGeoJson,
  WORLD_GEOJSON_PATH,
  WORLD_OUTLINE_GEOJSON_PATH,
} from "../geography/geographyApi";
import type { AtlasCountry } from "./atlasApi";

type Viewport = "world" | "country";
type AtlasMapCountry = Pick<
  AtlasCountry,
  "code" | "name" | "coordinates" | "difficulty"
>;
type AtlasMapZone = {
  id: string;
  geoJson: ClueZoneGeoJson;
  difficulty: AtlasCountry["difficulty"];
  selected?: boolean;
};

export type AtlasMapProps = {
  markers: AtlasMapCountry[];
  selectedCountryCode: string | null;
  selectedRegionId?: string | null;
  viewport: Viewport;
  focusRequestToken?: number;
  hasWholeCountryCoverage?: boolean;
  coveredRegionIds?: string[];
  visibleZones?: AtlasMapZone[];
  onCountrySelect(code: string): void;
  onRegionSelect?(regionId: string): void;
  onViewportChange(viewport: Viewport): void;
};

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

type PaintPropertyValue = Parameters<MapLibreMap["setPaintProperty"]>[2];

export function AtlasMap({
  markers,
  selectedCountryCode,
  selectedRegionId = null,
  viewport,
  focusRequestToken = 0,
  hasWholeCountryCoverage = false,
  coveredRegionIds = [],
  visibleZones = [],
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
  const focusRequestTokenRef = useRef(focusRequestToken);
  const lastHandledFocusRequestTokenRef = useRef(0);
  const hasWholeCountryCoverageRef = useRef(hasWholeCountryCoverage);
  const coveredRegionIdsRef = useRef(coveredRegionIds);
  const visibleZonesRef = useRef(visibleZones);
  const visibleZonesSignatureRef = useRef("");
  const regionOverlayStateRef = useRef<{
    loadedCountryCode: string | null;
    paintKey: string;
    isCleared: boolean;
  }>({
    loadedCountryCode: null,
    paintKey: "",
    isCleared: true,
  });

  useEffect(() => {
    callbacksRef.current = { onCountrySelect, onRegionSelect, onViewportChange };
  }, [onCountrySelect, onRegionSelect, onViewportChange]);

  useEffect(() => {
    markersRef.current = markers;
    selectedCountryCodeRef.current = selectedCountryCode;
    selectedRegionIdRef.current = selectedRegionId;
    viewportRef.current = viewport;
    focusRequestTokenRef.current = focusRequestToken;
    hasWholeCountryCoverageRef.current = hasWholeCountryCoverage;
    coveredRegionIdsRef.current = coveredRegionIds;
    visibleZonesRef.current = visibleZones;
  }, [
    markers,
    selectedCountryCode,
    selectedRegionId,
    viewport,
    focusRequestToken,
    hasWholeCountryCoverage,
    coveredRegionIds,
    visibleZones,
  ]);

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

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
          data: WORLD_GEOJSON_PATH,
          promoteId: "iso2",
        });
        map.addSource("world-outline", {
          type: "geojson",
          data: WORLD_OUTLINE_GEOJSON_PATH,
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
            "fill-antialias": false,
          },
        });
        map.addLayer({
          id: "countries-line",
          type: "line",
          source: "world-outline",
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
        map.addSource("visible-clue-zones", {
          type: "geojson",
          data: zoneFeatureCollection(visibleZonesRef.current),
        });
        map.addLayer({
          id: "visible-clue-zones-fill",
          type: "fill",
          source: "visible-clue-zones",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              "#23e7ff",
              [
                "match",
                ["get", "difficulty"],
                "easy",
                difficultyFillColors.easy,
                "medium",
                difficultyFillColors.medium,
                "expert",
                difficultyFillColors.expert,
                "#20d4e6",
              ],
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["get", "selected"], false],
              0.72,
              0.48,
            ],
          },
        });
        map.addLayer({
          id: "visible-clue-zones-line",
          type: "line",
          source: "visible-clue-zones",
          paint: {
            "line-color": [
              "case",
              ["boolean", ["get", "selected"], false],
              "#23e7ff",
              [
                "match",
                ["get", "difficulty"],
                "easy",
                difficultyFillColors.easy,
                "medium",
                difficultyFillColors.medium,
                "expert",
                difficultyFillColors.expert,
                "#23e7ff",
              ],
            ],
            "line-width": [
              "case",
              ["boolean", ["get", "selected"], false],
              3,
              1.8,
            ],
            "line-opacity": 0.96,
          },
        });

        updateSelection(
          map,
          markersRef.current,
          selectedCountryCodeRef.current,
          viewportRef.current,
          previousMarkerCodesRef.current,
        );
        previousSelectedCountryCodeRef.current = selectedCountryCodeRef.current;
        void updateRegionOverlay(
          map,
          selectedCountryCodeRef.current,
          selectedRegionIdRef.current,
          viewportRef.current,
          focusRequestTokenRef.current,
          lastHandledFocusRequestTokenRef,
          hasWholeCountryCoverageRef.current,
          coveredRegionIdsRef.current,
          regionOverlayStateRef,
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
      focusRequestToken,
      lastHandledFocusRequestTokenRef,
      hasWholeCountryCoverage,
      coveredRegionIds,
      regionOverlayStateRef,
    );
  }, [
    selectedCountryCode,
    selectedRegionId,
    viewport,
    focusRequestToken,
    hasWholeCountryCoverage,
    coveredRegionIds,
  ]);

  useEffect(() => {
    const nextSignature = JSON.stringify(visibleZones);
    if (visibleZonesSignatureRef.current === nextSignature) {
      return;
    }
    visibleZonesSignatureRef.current = nextSignature;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }
    const source = map.getSource("visible-clue-zones") as
      | GeoJSONSource
      | undefined;
    source?.setData(zoneFeatureCollection(visibleZones));
  }, [visibleZones]);

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

function zoneFeatureCollection(zones: AtlasMapZone[]) {
  return {
    type: "FeatureCollection" as const,
    features: zones.map((zone) => ({
      type: "Feature" as const,
      properties: {
        id: zone.id,
        difficulty: zone.difficulty,
        selected: zone.selected === true,
      },
      geometry: zone.geoJson,
    })),
  };
}

async function updateRegionOverlay(
  map: MapLibreMap,
  selectedCountryCode: string | null,
  selectedRegionId: string | null,
  viewport: Viewport,
  focusRequestToken: number,
  lastHandledFocusRequestTokenRef: { current: number },
  hasWholeCountryCoverage: boolean,
  coveredRegionIds: string[],
  regionOverlayStateRef: {
    current: { loadedCountryCode: string | null; paintKey: string; isCleared: boolean };
  },
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
  const nextPaintKey = JSON.stringify({
    selectedRegionId,
    hasWholeCountryCoverage,
    coveredRegionIds,
  });
  if (!selectedCountryCode || viewport !== "country") {
    if (!regionOverlayStateRef.current.isCleared) {
      source?.setData({
        type: "FeatureCollection",
        features: [],
      });
      regionOverlayStateRef.current = {
        loadedCountryCode: null,
        paintKey: "",
        isCleared: true,
      };
    }
    return;
  }

  try {
    const data = await loadRegionGeoJson(selectedCountryCode);

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
      applyCountryFocus(
        map,
        data,
        selectedRegionId,
        focusRequestToken,
        lastHandledFocusRequestTokenRef,
      );
      regionOverlayStateRef.current = {
        loadedCountryCode: selectedCountryCode,
        paintKey: nextPaintKey,
        isCleared: false,
      };
      return;
    }

    if (regionOverlayStateRef.current.loadedCountryCode !== selectedCountryCode) {
      source.setData(data);
    }
    if (
      regionOverlayStateRef.current.loadedCountryCode !== selectedCountryCode ||
      regionOverlayStateRef.current.paintKey !== nextPaintKey
    ) {
      map.setPaintProperty("country-regions-fill", "fill-color", fillColor);
      map.setPaintProperty("country-regions-fill", "fill-opacity", fillOpacity);
    }
    applyCountryFocus(
      map,
      data,
      selectedRegionId,
      focusRequestToken,
      lastHandledFocusRequestTokenRef,
    );
    regionOverlayStateRef.current = {
      loadedCountryCode: selectedCountryCode,
      paintKey: nextPaintKey,
      isCleared: false,
    };
  } catch {
    // Keep the country map usable even when regional geometry is missing.
  }
}

function applyCountryFocus(
  map: MapLibreMap,
  data: FeatureCollection<Geometry, GeoJsonProperties>,
  selectedRegionId: string | null,
  focusRequestToken: number,
  lastHandledFocusRequestTokenRef: { current: number },
) {
  if (
    focusRequestToken <= 0 ||
    focusRequestToken === lastHandledFocusRequestTokenRef.current
  ) {
    return;
  }

  const focusedFeatures =
    selectedRegionId == null
      ? data.features
      : (data.features ?? []).filter(
          (feature) =>
            (feature.properties as { id?: unknown } | null | undefined)?.id ===
            selectedRegionId,
        );
  const bounds = computeFeatureCollectionBounds({
    ...data,
    features: focusedFeatures?.length ? focusedFeatures : data.features,
  });
  if (!bounds) {
    return;
  }

  lastHandledFocusRequestTokenRef.current = focusRequestToken;
  map.fitBounds(bounds, {
    padding: 40,
    duration: 0,
  });
}

function computeFeatureCollectionBounds(data: {
  type: string;
  features?: Array<{ geometry?: { coordinates?: unknown } | null } | { geometry?: unknown }>;
}) {
  let minLng = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;

  for (const feature of data.features ?? []) {
    const geometry = feature.geometry as { coordinates?: unknown } | null | undefined;
    visitCoordinates(geometry?.coordinates, ([lng, lat]) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });
  }

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return null;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ] as [[number, number], [number, number]];
}

function visitCoordinates(
  value: unknown,
  visitor: (point: [number, number]) => void,
) {
  if (!Array.isArray(value)) {
    return;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    visitor([value[0], value[1]]);
    return;
  }

  for (const item of value) {
    visitCoordinates(item, visitor);
  }
}

function updateSelection(
  map: MapLibreMap,
  markers: AtlasMapCountry[],
  selectedCountryCode: string | null,
  viewport: Viewport,
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

  void selectedCountryCode;
}
