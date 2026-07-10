import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { Country, Region } from "../geography/geographyApi";
import {
  loadRegionGeoJson,
  WORLD_GEOJSON_PATH,
  WORLD_OUTLINE_GEOJSON_PATH,
} from "../geography/geographyApi";
import type { ClueCoverage } from "./clueSchema";
import type { ClueZoneGeoJson } from "./clueLocationTypes";

type Props = {
  countries: Country[];
  regions: Region[];
  regionsLoading: boolean;
  selectedCountryCode: string;
  coverage: ClueCoverage;
  selectedRegionIds: string[];
  zoneGeoJson: ClueZoneGeoJson | null;
  onCountrySelect(countryCode: string): void;
  onCoverageChange(coverage: ClueCoverage): void;
  onToggleRegion(regionId: string): void;
  onZoneChange(zoneGeoJson: ClueZoneGeoJson | null): void;
};

const mapStyle = {
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

function hasLayer(map: MapLibreMap, layerId: string) {
  try {
    return Boolean(map.getLayer(layerId));
  } catch {
    return false;
  }
}

function zoneToVertices(zoneGeoJson: ClueZoneGeoJson | null) {
  if (!zoneGeoJson?.coordinates[0]?.length) return [] as [number, number][];
  const ring = zoneGeoJson.coordinates[0];
  if (ring.length < 2) return [] as [number, number][];
  const maybeClosed = ring.slice(0, -1);
  return maybeClosed.map((point) => [point[0], point[1]] as [number, number]);
}

function verticesToZone(vertices: [number, number][]) {
  if (vertices.length < 3) return null;
  return {
    type: "Polygon" as const,
    coordinates: [[...vertices, vertices[0]]],
  };
}

function draftLineSourceData(vertices: [number, number][]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features:
      vertices.length >= 2
        ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: vertices,
              },
            },
          ]
        : [],
  };
}

function zoneSourceData(zoneGeoJson: ClueZoneGeoJson | null): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: zoneGeoJson
      ? [
          {
            type: "Feature",
            properties: {},
            geometry: zoneGeoJson,
          },
        ]
      : [],
  };
}

function pointSourceData(vertices: [number, number][]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: vertices.map((vertex, index) => ({
      type: "Feature",
      properties: { index },
      geometry: {
        type: "Point",
        coordinates: vertex,
      },
    })),
  };
}

async function updateRegionSource(
  map: MapLibreMap,
  countryCode: string,
  regionsLoading: boolean,
) {
  const source = map.getSource("clue-regions") as GeoJSONSource | undefined;
  if (!source) return;

  if (!countryCode || regionsLoading) {
    source.setData({
      type: "FeatureCollection",
      features: [],
    });
    return;
  }

  try {
    source.setData(await loadRegionGeoJson(countryCode));
  } catch {
    source.setData({
      type: "FeatureCollection",
      features: [],
    });
  }
}

function setRegionPaint(map: MapLibreMap, selectedRegionIds: string[]) {
  if (!hasLayer(map, "clue-regions-fill")) return;
  map.setPaintProperty("clue-regions-fill", "fill-color", [
    "case",
    ["in", ["get", "id"], ["literal", selectedRegionIds]],
    "#20d4e6",
    "#5b7692",
  ]);
  map.setPaintProperty("clue-regions-fill", "fill-opacity", [
    "case",
    ["in", ["get", "id"], ["literal", selectedRegionIds]],
    0.56,
    0.18,
  ]);
}

function emptyFeatureCollection(): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

export function ClueLocationAtlas({
  countries,
  regions,
  regionsLoading,
  selectedCountryCode,
  coverage,
  selectedRegionIds,
  zoneGeoJson,
  onCountrySelect,
  onCoverageChange,
  onToggleRegion,
  onZoneChange,
}: Props) {
  const isJsdom =
    typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectedCountryCodeRef = useRef(selectedCountryCode);
  const coverageRef = useRef(coverage);
  const selectedRegionIdsRef = useRef(selectedRegionIds);
  const zoneGeoJsonRef = useRef(zoneGeoJson);
  const onCountrySelectRef = useRef(onCountrySelect);
  const onToggleRegionRef = useRef(onToggleRegion);
  const onZoneChangeRef = useRef(onZoneChange);
  const previousCountryCodeRef = useRef(selectedCountryCode);
  const regionSourceCountryRef = useRef<string | null>(null);
  const regionSourceClearedRef = useRef(true);
  const regionPaintKeyRef = useRef("");
  const countryPaintKeyRef = useRef("");
  const zoneOverlayKeyRef = useRef("");
  const [draftVertices, setDraftVertices] = useState(() =>
    zoneToVertices(zoneGeoJson),
  );
  const draftVerticesRef = useRef(draftVertices);
  const [viewport, setViewport] = useState<"world" | "country">(
    selectedCountryCode ? "country" : "world",
  );
  const effectiveViewport = selectedCountryCode ? viewport : "world";
  const viewportRef = useRef<"world" | "country">(effectiveViewport);

  const selectedCountryName = useMemo(
    () => countries.find((country) => country.code === selectedCountryCode)?.name ?? "",
    [countries, selectedCountryCode],
  );

  useEffect(() => {
    selectedCountryCodeRef.current = selectedCountryCode;
    coverageRef.current = coverage;
    selectedRegionIdsRef.current = selectedRegionIds;
    zoneGeoJsonRef.current = zoneGeoJson;
    onCountrySelectRef.current = onCountrySelect;
    onToggleRegionRef.current = onToggleRegion;
    onZoneChangeRef.current = onZoneChange;
  }, [
    coverage,
    onCountrySelect,
    onToggleRegion,
    onZoneChange,
    selectedCountryCode,
    selectedRegionIds,
    zoneGeoJson,
  ]);

  useEffect(() => {
    draftVerticesRef.current = draftVertices;
  }, [draftVertices]);

  useEffect(() => {
    viewportRef.current = effectiveViewport;
  }, [effectiveViewport]);

  useEffect(() => {
    let disposed = false;
    const applyDraftVertices = (nextVertices: [number, number][]) => {
      queueMicrotask(() => {
        if (disposed) return;
        draftVerticesRef.current = nextVertices;
        setDraftVertices(nextVertices);
      });
    };

    if (coverage !== "drawn_zone") {
      applyDraftVertices([]);
      return () => {
        disposed = true;
      };
    }

    if (previousCountryCodeRef.current !== selectedCountryCode) {
      previousCountryCodeRef.current = selectedCountryCode;
      applyDraftVertices(zoneToVertices(zoneGeoJson));
      return () => {
        disposed = true;
      };
    }

    if (zoneGeoJson) {
      applyDraftVertices(zoneToVertices(zoneGeoJson));
    }
    return () => {
      disposed = true;
    };
  }, [coverage, selectedCountryCode, zoneGeoJson]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return () => undefined;

    const observer = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

    void import("maplibre-gl").then((maplibregl) => {
      if (disposed || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style: mapStyle,
        center: [5, 18],
        zoom: 1.1,
        minZoom: 0.8,
        maxZoom: 9,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-left");

      map.on("load", async () => {
        if (!map) return;

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
          id: "clue-countries-fill",
          type: "fill",
          source: "world-demo",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "iso2"], selectedCountryCodeRef.current || ""],
              "#20d4e6",
              "#29445f",
            ],
            "fill-opacity": [
              "case",
              ["==", ["get", "iso2"], selectedCountryCodeRef.current || ""],
              0.62,
              0.84,
            ],
            "fill-antialias": false,
          },
        });
        map.addLayer({
          id: "clue-countries-line",
          type: "line",
          source: "world-outline",
          paint: {
            "line-color": "#7790a7",
            "line-width": 0.8,
            "line-opacity": 0.7,
          },
        });

        map.addSource("clue-regions", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: [],
          },
        });
        map.addLayer({
          id: "clue-regions-fill",
          type: "fill",
          source: "clue-regions",
          paint: {
            "fill-color": "#5b7692",
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "clue-regions-line",
          type: "line",
          source: "clue-regions",
          paint: {
            "line-color": "#98b6cf",
            "line-width": 1,
            "line-opacity": 0.7,
          },
        });

        map.addSource("clue-zone", {
          type: "geojson",
          data: zoneSourceData(zoneGeoJsonRef.current),
        });
        map.addLayer({
          id: "clue-zone-fill",
          type: "fill",
          source: "clue-zone",
          paint: {
            "fill-color": "#20d4e6",
            "fill-opacity": 0.2,
          },
        });
        map.addLayer({
          id: "clue-zone-line",
          type: "line",
          source: "clue-zone",
          paint: {
            "line-color": "#20d4e6",
            "line-width": 2,
          },
        });

        map.addSource("clue-zone-draft-line", {
          type: "geojson",
          data: draftLineSourceData(draftVerticesRef.current),
        });
        map.addLayer({
          id: "clue-zone-draft-line-layer",
          type: "line",
          source: "clue-zone-draft-line",
          paint: {
            "line-color": "#20d4e6",
            "line-width": 2,
            "line-dasharray": [1.2, 1],
          },
        });

        map.addSource("clue-zone-points", {
          type: "geojson",
          data: pointSourceData(draftVerticesRef.current),
        });
        map.addLayer({
          id: "clue-zone-points-layer",
          type: "circle",
          source: "clue-zone-points",
          paint: {
            "circle-radius": [
              "case",
              ["==", ["get", "index"], 0],
              7,
              5,
            ],
            "circle-color": [
              "case",
              ["==", ["get", "index"], 0],
              "#f4c84f",
              "#20d4e6",
            ],
            "circle-stroke-color": "#d7f9ff",
            "circle-stroke-width": 1.5,
          },
        });

        await updateRegionSource(map, selectedCountryCodeRef.current, false);
        if (disposed || !hasLayer(map, "clue-regions-fill")) return;
        setRegionPaint(map, selectedRegionIdsRef.current);

        map.on("click", (event) => {
          if (!map) return;
          const activeCoverage = coverageRef.current;
          const currentViewport = viewportRef.current;

          if (activeCoverage === "selected_regions" && currentViewport === "country") {
            const regionFeature = map
              .queryRenderedFeatures(event.point, { layers: ["clue-regions-fill"] })
              .find((feature) => typeof feature.properties?.id === "string");
            const regionId = regionFeature?.properties?.id;
            if (typeof regionId === "string") {
              onToggleRegionRef.current(regionId);
            }
            return;
          }

          if (
            activeCoverage === "drawn_zone" &&
            selectedCountryCodeRef.current &&
            currentViewport === "country"
          ) {
            const clickedPoint = map
              .queryRenderedFeatures(event.point, {
                layers: ["clue-zone-points-layer"],
              })
              .find((feature) => typeof feature.properties?.index === "number");
            const clickedPointIndex = clickedPoint?.properties?.index;
            if (clickedPointIndex === 0 && draftVerticesRef.current.length >= 3) {
              const closedZone = verticesToZone(draftVerticesRef.current);
              onZoneChangeRef.current(closedZone);
              return;
            }
            if (typeof clickedPointIndex === "number") {
              return;
            }

            const nextVertices = [
              ...draftVerticesRef.current,
              [event.lngLat.lng, event.lngLat.lat] as [number, number],
            ];
            draftVerticesRef.current = nextVertices;
            setDraftVertices(nextVertices);
            onZoneChangeRef.current(null);
            return;
          }

          if (currentViewport !== "world" && activeCoverage !== "whole_country") {
            return;
          }

          const countryFeature = map
            .queryRenderedFeatures(event.point, {
              layers: ["clue-countries-fill"],
            })
            .find((feature) => typeof feature.properties?.iso2 === "string");
          const code = countryFeature?.properties?.iso2;
          if (typeof code !== "string") {
            return;
          }
          if (
            selectedCountryCodeRef.current === code &&
            viewportRef.current === "country"
          ) {
            return;
          }
          onCountrySelectRef.current(code);
          setViewport("country");
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
    if (!map?.isStyleLoaded() || !hasLayer(map, "clue-countries-fill")) return;
    const nextCountryPaintKey = `${effectiveViewport}:${selectedCountryCode}`;
    if (countryPaintKeyRef.current === nextCountryPaintKey) {
      return;
    }
    countryPaintKeyRef.current = nextCountryPaintKey;

    map.setPaintProperty("clue-countries-fill", "fill-color", [
      "case",
      ["==", ["get", "iso2"], selectedCountryCode || ""],
      "#20d4e6",
      "#29445f",
    ]);
    map.setPaintProperty("clue-countries-fill", "fill-opacity", [
      "case",
      ["==", ["get", "iso2"], selectedCountryCode || ""],
      0.62,
      0.84,
    ]);
    map.resize();
  }, [effectiveViewport, selectedCountryCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    if (regionsLoading || !selectedCountryCode) {
      if (!regionSourceClearedRef.current) {
        const source = map.getSource("clue-regions") as GeoJSONSource | undefined;
        source?.setData(emptyFeatureCollection());
        regionSourceCountryRef.current = null;
        regionSourceClearedRef.current = true;
        regionPaintKeyRef.current = "";
      }
      return;
    }

    if (regionSourceCountryRef.current === selectedCountryCode) {
      return;
    }

    void updateRegionSource(map, selectedCountryCode, regionsLoading).then(() => {
      regionSourceCountryRef.current = selectedCountryCode;
      regionSourceClearedRef.current = false;
      regionPaintKeyRef.current = "";
    });
  }, [selectedCountryCode, regionsLoading]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !hasLayer(map, "clue-regions-fill")) return;
    const nextRegionPaintKey = selectedRegionIds.join("|");
    if (regionPaintKeyRef.current === nextRegionPaintKey) {
      return;
    }
    regionPaintKeyRef.current = nextRegionPaintKey;
    setRegionPaint(map, selectedRegionIds);
  }, [selectedRegionIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const zone = coverage === "drawn_zone" ? zoneGeoJson : null;
    const nextZoneOverlayKey = JSON.stringify({
      coverage,
      zone,
      draftVertices: coverage === "drawn_zone" ? draftVertices : [],
    });
    if (zoneOverlayKeyRef.current === nextZoneOverlayKey) {
      return;
    }
    zoneOverlayKeyRef.current = nextZoneOverlayKey;
    (map.getSource("clue-zone") as GeoJSONSource | undefined)?.setData(
      zoneSourceData(zone),
    );
    (map.getSource("clue-zone-draft-line") as GeoJSONSource | undefined)?.setData(
      draftLineSourceData(coverage === "drawn_zone" ? draftVertices : []),
    );
    (map.getSource("clue-zone-points") as GeoJSONSource | undefined)?.setData(
      pointSourceData(coverage === "drawn_zone" ? draftVertices : []),
    );
  }, [coverage, draftVertices, zoneGeoJson]);

  const canUseRegions = regions.length > 0 && !regionsLoading && Boolean(selectedCountryCode);
  const drawnVertices = draftVertices;

  if (isJsdom) {
    return (
      <div className="clue-location-atlas">
        <fieldset className="clue-coverage">
          <legend>Couverture</legend>
          <label>
            <input
              type="radio"
              name="coverage"
              checked={coverage === "whole_country"}
              onChange={() => onCoverageChange("whole_country")}
            />
            Pays entier
          </label>
          <label>
            <input
              type="radio"
              name="coverage"
              checked={coverage === "selected_regions"}
              disabled={!canUseRegions}
              onChange={() => onCoverageChange("selected_regions")}
            />
            Certaines régions
          </label>
          <label>
            <input
              type="radio"
              name="coverage"
              checked={coverage === "drawn_zone"}
              disabled={!selectedCountryCode}
              onChange={() => onCoverageChange("drawn_zone")}
            />
            Zone dessinée
          </label>
        </fieldset>

        {selectedCountryCode && !regionsLoading && regions.length === 0 ? (
          <p className="clue-inline-note">
            Aucune division administrative disponible pour ce pays.
          </p>
        ) : null}

        {regions.length > 0 ? (
          <fieldset className="clue-region-grid">
            <legend>Régions</legend>
            {regions.map((region) => (
              <label key={region.id}>
                <input
                  type="checkbox"
                  checked={
                    coverage === "whole_country" ||
                    selectedRegionIds.includes(region.id)
                  }
                  disabled={coverage !== "selected_regions"}
                  onChange={() => onToggleRegion(region.id)}
                />
                {region.name}
              </label>
            ))}
          </fieldset>
        ) : null}
      </div>
    );
  }

  return (
    <div className="clue-location-atlas">
      <div className="clue-location-toolbar">
        <button
          type="button"
          className="atlas-ghost-button"
          onClick={() => setViewport("world")}
        >
          Vue monde
        </button>
        <button
          type="button"
          className="atlas-ghost-button"
          disabled={!selectedCountryCode}
          onClick={() => setViewport("country")}
        >
          {selectedCountryName ? `Zoom sur ${selectedCountryName}` : "Zoom pays"}
        </button>
        {coverage === "drawn_zone" ? (
          <>
            <button
              type="button"
              className="atlas-ghost-button"
              disabled={drawnVertices.length === 0}
              onClick={() => {
                const nextVertices = drawnVertices.slice(0, -1);
                draftVerticesRef.current = nextVertices;
                setDraftVertices(nextVertices);
                onZoneChange(verticesToZone(nextVertices));
              }}
            >
              Annuler un point
            </button>
            <button
              type="button"
              className="atlas-ghost-button"
              disabled={!zoneGeoJson && drawnVertices.length === 0}
              onClick={() => {
                draftVerticesRef.current = [];
                setDraftVertices([]);
                onZoneChange(null);
              }}
            >
              Effacer la zone
            </button>
          </>
        ) : null}
      </div>

      <div
        ref={containerRef}
        className="clue-location-map"
        aria-label="Atlas de localisation de l'indice"
      />

      <fieldset className="clue-coverage">
        <legend>Couverture</legend>
        <label>
          <input
            type="radio"
            name="coverage"
            checked={coverage === "whole_country"}
            onChange={() => onCoverageChange("whole_country")}
          />
          Pays entier
        </label>
        <label>
          <input
            type="radio"
            name="coverage"
            checked={coverage === "selected_regions"}
            disabled={!canUseRegions}
            onChange={() => onCoverageChange("selected_regions")}
          />
          Certaines régions
        </label>
        <label>
          <input
            type="radio"
            name="coverage"
            checked={coverage === "drawn_zone"}
            disabled={!selectedCountryCode}
            onChange={() => onCoverageChange("drawn_zone")}
          />
          Zone dessinée
        </label>
      </fieldset>

      {coverage === "selected_regions" ? (
        <p className="clue-inline-note">
          Passez en zoom pays puis cliquez directement sur les regions de la carte.
          {selectedRegionIds.length > 0 ? ` ${selectedRegionIds.length} selectionnee(s).` : ""}
        </p>
      ) : null}

      {coverage === "drawn_zone" ? (
        <p className="clue-inline-note">
          Passez en zoom pays puis cliquez sur la carte pour poser des points et former une zone libre.
          {drawnVertices.length > 0 ? ` ${drawnVertices.length} point(s).` : ""}
        </p>
      ) : null}

      {coverage === "selected_regions" && selectedRegionIds.length > 0 ? (
        <div className="clue-file-summary">
          {selectedRegionIds.map((regionId) => {
            const regionName =
              regions.find((region) => region.id === regionId)?.name ?? regionId;
            return (
              <button
                type="button"
                key={regionId}
                onClick={() => onToggleRegion(regionId)}
              >
                {regionName}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
