import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";

type WorldFeature = {
  type: "Feature";
  id?: string;
  properties: {
    iso2: string;
    name: string;
  };
  geometry: unknown;
};

type WorldFeatureCollection = {
  type: "FeatureCollection";
  features: WorldFeature[];
};

export type TrainingMapProps = {
  selectedCode: string | null;
  correctCode: string | null;
  disabled: boolean;
  onSelect: (countryCode: string) => void;
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

const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-168, -56],
  [178, 75],
];

function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2;
}

export function TrainingMap({
  selectedCode,
  correctCode,
  disabled,
  onSelect,
}: TrainingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const callbacksRef = useRef({ onSelect, disabled });
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);

  useEffect(() => {
    callbacksRef.current = { onSelect, disabled };
  }, [onSelect, disabled]);

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
              ["boolean", ["feature-state", "correct"], false],
              "#38d47a",
              ["boolean", ["feature-state", "selectedWrong"], false],
              "#ef5b5b",
              ["boolean", ["feature-state", "selectedCorrect"], false],
              "#20d4e6",
              ["boolean", ["feature-state", "hover"], false],
              "#3b6e83",
              "#29445f",
            ],
            "fill-opacity": 0.84,
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

        let hoveredId: string | number | null = null;
        map.on("mousemove", "training-countries-fill", (event: MapLayerMouseEvent) => {
          if (!map) return;
          map.getCanvas().style.cursor = callbacksRef.current.disabled ? "" : "pointer";
          const nextId = event.features?.[0]?.id ?? null;
          if (hoveredId !== null && hoveredId !== nextId) {
            map.setFeatureState(
              { source: "world-training", id: hoveredId },
              { hover: false },
            );
          }
          if (!callbacksRef.current.disabled && nextId !== null) {
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
          if (callbacksRef.current.disabled) {
            return;
          }
          const code = event.features?.[0]?.properties?.iso2;
          if (isCountryCode(code)) {
            callbacksRef.current.onSelect(code);
          }
        });
      });
    });

    void fetch("/geography/world.geojson")
      .then((response) => response.json() as Promise<WorldFeatureCollection>)
      .then((data) => {
        if (disposed) return;
        setCountries(
          data.features
            .map((feature) => ({
              code: feature.properties.iso2,
              name: feature.properties.name,
            }))
            .filter((country) => isCountryCode(country.code))
            .sort((left, right) => left.name.localeCompare(right.name, "fr")),
        );
      })
      .catch(() => {
        if (!disposed) setCountries([]);
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
    for (const country of countries) {
      const isSelected = country.code === selectedCode;
      const isCorrect = country.code === correctCode;
      map.setFeatureState(
        { source: "world-training", id: country.code },
        {
          selectedCorrect: isSelected && isCorrect,
          selectedWrong: isSelected && !isCorrect,
          correct: !isSelected && isCorrect,
        },
      );
    }
  }, [countries, selectedCode, correctCode]);

  return (
    <div className="training-map-frame atlas-map-frame">
      <div ref={containerRef} className="training-map atlas-map" aria-label="Carte d'entraînement" />
      <div className="map-access-list" aria-label="Selection accessible des pays">
        {countries.map((country) => (
          <button
            type="button"
            key={country.code}
            disabled={disabled}
            onClick={() => onSelect(country.code)}
          >
            {country.name}
          </button>
        ))}
      </div>
    </div>
  );
}
