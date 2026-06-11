import { useEffect, useRef } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";
import type { AtlasCountry } from "./atlasApi";

type Viewport = "world" | "country";
type AtlasMapCountry = Pick<
  AtlasCountry,
  "code" | "name" | "coordinates" | "difficulty"
>;

export type AtlasMapProps = {
  markers: AtlasMapCountry[];
  selectedCountryCode: string | null;
  viewport: Viewport;
  onCountrySelect(code: string): void;
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

export function AtlasMap({
  markers,
  selectedCountryCode,
  viewport,
  onCountrySelect,
  onViewportChange,
}: AtlasMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacksRef = useRef({ onCountrySelect, onViewportChange });
  const markersRef = useRef(markers);
  const selectedCountryCodeRef = useRef(selectedCountryCode);
  const previousSelectedCountryCodeRef = useRef<string | null>(null);
  const viewportRef = useRef(viewport);

  useEffect(() => {
    callbacksRef.current = { onCountrySelect, onViewportChange };
  }, [onCountrySelect, onViewportChange]);

  useEffect(() => {
    markersRef.current = markers;
    selectedCountryCodeRef.current = selectedCountryCode;
    viewportRef.current = viewport;
  }, [markers, selectedCountryCode, viewport]);

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
              "#29445f",
            ],
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.7,
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
            "line-width": 0.75,
            "line-opacity": 0.7,
          },
        });
        map.addSource("atlas-markers", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
        map.addLayer({
          id: "atlas-markers-glow",
          type: "circle",
          source: "atlas-markers",
          paint: {
            "circle-radius": 10,
            "circle-color": ["get", "color"],
            "circle-opacity": 0.16,
          },
        });
        map.addLayer({
          id: "atlas-markers",
          type: "circle",
          source: "atlas-markers",
          paint: {
            "circle-radius": 5.5,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 1.5,
            "circle-stroke-color": "#f5f8fc",
          },
        });

        updateMarkers(map, markersRef.current);
        updateSelection(
          map,
          markersRef.current,
          selectedCountryCodeRef.current,
          viewportRef.current,
        );
        previousSelectedCountryCodeRef.current = selectedCountryCodeRef.current;

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
        map.on("click", "atlas-markers", (event: MapLayerMouseEvent) => {
          const code = event.features?.[0]?.properties?.code as string | undefined;
          if (code) {
            callbacksRef.current.onCountrySelect(code);
            callbacksRef.current.onViewportChange("country");
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
    updateMarkers(map, markers);
  }, [markers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) {
      return;
    }
    updateSelection(map, markers, selectedCountryCode, viewport);
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

function updateMarkers(map: MapLibreMap, markers: AtlasMapCountry[]) {
  const source = map.getSource("atlas-markers") as GeoJSONSource | undefined;
  source?.setData({
    type: "FeatureCollection",
    features: markers.map((country) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: country.coordinates },
      properties: {
        code: country.code,
        color:
          country.difficulty === "easy"
            ? "#38d47a"
            : country.difficulty === "medium"
              ? "#f4b52d"
              : "#ef5b5b",
      },
    })),
  });
}

function updateSelection(
  map: MapLibreMap,
  markers: AtlasMapCountry[],
  selectedCountryCode: string | null,
  viewport: Viewport,
) {
  for (const country of markers) {
    map.setFeatureState(
      { source: "world-demo", id: country.code },
      { selected: country.code === selectedCountryCode },
    );
  }
  const selected = markers.find((country) => country.code === selectedCountryCode);
  if (selected && viewport === "country") {
    map.flyTo({ center: selected.coordinates, zoom: 3.2, duration: 900 });
  } else {
    map.fitBounds(WORLD_BOUNDS, { padding: 34, duration: 800 });
  }
}
