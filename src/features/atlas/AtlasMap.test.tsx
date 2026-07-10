import { render, waitFor } from "@testing-library/react";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { beforeEach, expect, it, vi } from "vitest";
import {
  clearGeoJsonCache,
  WORLD_GEOJSON_PATH,
  WORLD_OUTLINE_GEOJSON_PATH,
} from "../geography/geographyApi";
import { atlasCountries } from "./atlasDemoData";
import { AtlasMap } from "./AtlasMap";

type LayerHandler = (event: MapLayerMouseEvent) => void;

const mapState = vi.hoisted(() => ({
  instances: [] as MockMap[],
}));

class MockGeoJSONSource {
  setData = vi.fn();
}

class MockMap {
  sources = new Map<string, MockGeoJSONSource>();
  layers: Array<Record<string, unknown>> = [];
  handlers = new Map<string, LayerHandler[]>();
  canvas = { style: { cursor: "" } };
  addControl = vi.fn();
  flyTo = vi.fn();
  fitBounds = vi.fn();
  setLayoutProperty = vi.fn();
  setPaintProperty = vi.fn();
  setFeatureState = vi.fn();
  remove = vi.fn();

  constructor(public options: Record<string, unknown>) {
    mapState.instances.push(this);
  }

  on(event: string, layerOrHandler: string | LayerHandler, maybeHandler?: LayerHandler) {
    const key = typeof layerOrHandler === "string" ? `${event}:${layerOrHandler}` : event;
    const handler = typeof layerOrHandler === "function" ? layerOrHandler : maybeHandler;
    if (handler) {
      this.handlers.set(key, [...(this.handlers.get(key) ?? []), handler]);
    }
    return this;
  }

  emit(key: string, event = {} as MapLayerMouseEvent) {
    for (const handler of this.handlers.get(key) ?? []) {
      handler(event);
    }
  }

  addSource(id: string) {
    this.sources.set(id, new MockGeoJSONSource());
  }

  addLayer(layer: Record<string, unknown>) {
    this.layers.push(layer);
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  getCanvas() {
    return this.canvas;
  }

  isStyleLoaded() {
    return true;
  }
}

vi.mock("maplibre-gl", () => ({
  Map: MockMap,
  NavigationControl: class NavigationControl {},
  FullscreenControl: class FullscreenControl {},
}));

async function getMap() {
  await waitFor(() => expect(mapState.instances).toHaveLength(1));
  return mapState.instances[0];
}

beforeEach(() => {
  mapState.instances.length = 0;
  clearGeoJsonCache();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (input: string) => {
      if (input === WORLD_GEOJSON_PATH) {
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { iso2: "FR", name: "France" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-5, 41],
                      [9, 41],
                      [9, 51],
                      [-5, 51],
                      [-5, 41],
                    ],
                  ],
                },
              },
              {
                type: "Feature",
                properties: { iso2: "US", name: "United States" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-125, 24],
                      [-66, 24],
                      [-66, 49],
                      [-125, 49],
                      [-125, 24],
                    ],
                  ],
                },
              },
            ],
          }),
        };
      }

      if (input === "/geography/countries/FR.geojson") {
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { iso2: "FR", name: "France" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-4.8, 41.2],
                      [8.9, 41.2],
                      [8.9, 50.9],
                      [-4.8, 50.9],
                      [-4.8, 41.2],
                    ],
                  ],
                },
              },
            ],
          }),
        };
      }

      if (input === "/geography/regions/FR.geojson") {
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { id: "FR-IDF", name: "Ile-de-France" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [1, 48],
                      [3, 48],
                      [3, 49],
                      [1, 49],
                      [1, 48],
                    ],
                  ],
                },
              },
            ],
          }),
        };
      }

      if (input === "/geography/regions/US.geojson") {
        return {
          ok: true,
          json: async () => ({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { id: "US-KY", name: "Kentucky" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-89.6, 36.5],
                      [-81.9, 36.5],
                      [-81.9, 39.2],
                      [-89.6, 39.2],
                      [-89.6, 36.5],
                    ],
                  ],
                },
              },
              {
                type: "Feature",
                properties: { id: "US-TX", name: "Texas" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [-106.7, 25.8],
                      [-93.5, 25.8],
                      [-93.5, 36.5],
                      [-106.7, 36.5],
                      [-106.7, 25.8],
                    ],
                  ],
                },
              },
            ],
          }),
        };
      }

      return {
        ok: false,
        json: async () => ({
          type: "FeatureCollection",
          features: [],
        }),
      };
    }),
  );
});

it("configure le GeoJSON local et les couches pays", async () => {
  const { getByRole } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  const addSource = vi.spyOn(map, "addSource");
  map.emit("load");

  expect(map.options).toMatchObject({ center: [5, 18], zoom: 1.15 });
  expect(addSource).toHaveBeenCalledWith("world-demo", {
    type: "geojson",
    data: WORLD_GEOJSON_PATH,
    promoteId: "iso2",
  });
  expect(addSource).toHaveBeenCalledWith("world-outline", {
    type: "geojson",
    data: WORLD_OUTLINE_GEOJSON_PATH,
    promoteId: "iso2",
  });
  expect(map.layers.map((layer) => layer.id)).toEqual([
    "countries-fill",
    "countries-line",
    "visible-clue-zones-fill",
    "visible-clue-zones-line",
  ]);
  expect(map.layers[1]).toMatchObject({
    id: "countries-line",
    source: "world-outline",
  });
  const fillColor = (map.layers[0].paint as Record<string, unknown>)["fill-color"];
  expect(Array.isArray(fillColor)).toBe(true);
  const fillColorText = JSON.stringify(fillColor);
  expect(fillColorText).toContain("#4fd38a");
  expect(fillColorText).toContain("#f4c84f");
  expect(fillColorText).toContain("#f06b6b");
  expect(getByRole("link", { name: "Natural Earth" })).toHaveAttribute(
    "href",
    "https://www.naturalearthdata.com/",
  );
  expect(getByRole("link", { name: "geoBoundaries" })).toHaveAttribute(
    "href",
    "https://www.geoboundaries.org/",
  );
  expect(getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
    "href",
    "https://creativecommons.org/licenses/by/4.0/",
  );
});

it("selectionne un pays documente et ignore un pays GeoJSON non documente", async () => {
  const onCountrySelect = vi.fn();
  const onViewportChange = vi.fn();
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={onCountrySelect}
      onViewportChange={onViewportChange}
    />,
  );
  const map = await getMap();
  map.emit("load");

  map.emit("click:countries-fill", {
    features: [{ properties: { iso2: "FR" } }],
  } as unknown as MapLayerMouseEvent);
  map.emit("click:countries-fill", {
    features: [{ properties: { iso2: "DE" } }],
  } as unknown as MapLayerMouseEvent);

  expect(onCountrySelect).toHaveBeenCalledTimes(1);
  expect(onCountrySelect).toHaveBeenCalledWith("FR");
  expect(onViewportChange).toHaveBeenCalledTimes(1);
  expect(onViewportChange).toHaveBeenCalledWith("country");
});

it("ignore un pays devenu invisible apres un changement de filtres", async () => {
  const onCountrySelect = vi.fn();
  const onViewportChange = vi.fn();
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={onCountrySelect}
      onViewportChange={onViewportChange}
    />,
  );
  const map = await getMap();
  map.emit("load");

  rerender(
    <AtlasMap
      markers={atlasCountries.filter((country) => country.code !== "FR")}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={onCountrySelect}
      onViewportChange={onViewportChange}
    />,
  );
  map.emit("click:countries-fill", {
    features: [{ properties: { iso2: "FR" } }],
  } as unknown as MapLayerMouseEvent);

  expect(onCountrySelect).not.toHaveBeenCalled();
  expect(onViewportChange).not.toHaveBeenCalled();
});

it("reserve le curseur et le survol interactifs aux pays documentes", async () => {
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  map.emit("mousemove:countries-fill", {
    features: [{ id: "DE", properties: { iso2: "DE" } }],
  } as unknown as MapLayerMouseEvent);

  expect(map.canvas.style.cursor).toBe("");
  expect(map.setFeatureState).not.toHaveBeenCalledWith(
    { source: "world-demo", id: "DE" },
    { hover: true },
  );

  map.emit("mousemove:countries-fill", {
    features: [{ id: "FR", properties: { iso2: "FR" } }],
  } as unknown as MapLayerMouseEvent);

  expect(map.canvas.style.cursor).toBe("pointer");
  expect(map.setFeatureState).toHaveBeenCalledWith(
    { source: "world-demo", id: "FR" },
    { hover: true },
  );
});

it("conserve le zoom utilisateur quand la vue ou la selection change", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");
  map.fitBounds.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries.slice(0, 2)}
      selectedCountryCode="FR"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  rerender(
    <AtlasMap
      markers={atlasCountries.slice(0, 2)}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  expect(map.fitBounds).not.toHaveBeenCalled();
});

it("efface l'ancienne selection quand le pays disparait des resultats", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");
  map.setFeatureState.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries.filter((country) => country.code !== "FR")}
      selectedCountryCode="US"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  expect(map.setFeatureState).toHaveBeenCalledWith(
    { source: "world-demo", id: "FR" },
    { selected: false, hasData: false, difficulty: null },
  );
  expect(map.setFeatureState).toHaveBeenCalledWith(
    { source: "world-demo", id: "US" },
    { selected: false, hasData: false, difficulty: "medium" },
  );
});

it("charge et dessine les regions d'un pays en vue pays", async () => {
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      hasWholeCountryCoverage
      coveredRegionIds={["FR-IDF", "FR-OCC"]}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  const addSource = vi.spyOn(map, "addSource");
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/FR.geojson");
  });
  expect(addSource).toHaveBeenCalledWith(
    "country-regions",
    expect.objectContaining({
      type: "geojson",
    }),
  );
  expect(map.layers.map((layer) => layer.id)).toEqual(
    expect.arrayContaining([
      "country-regions-fill",
      "country-regions-line",
    ]),
  );
});

it("dessine la selection du pays actif avec le GeoJSON precis des regions", async () => {
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  const addSource = vi.spyOn(map, "addSource");
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/FR.geojson");
  });
  expect(addSource).toHaveBeenCalledWith(
    "country-regions",
    expect.objectContaining({
      type: "geojson",
    }),
  );
  expect(map.layers.map((layer) => layer.id)).toEqual(
    expect.arrayContaining([
      "selected-country-fill",
      "country-regions-fill",
    ]),
  );
});

it("garde la couche monde visible en vue pays", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode={null}
      viewport="world"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");
  map.setLayoutProperty.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    "countries-fill",
    "visibility",
    "visible",
  );
  expect(map.setLayoutProperty).toHaveBeenCalledWith(
    "countries-line",
    "visibility",
    "visible",
  );
});

it("permet de cliquer sur une region couverte pour la selectionner", async () => {
  const onRegionSelect = vi.fn();
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      viewport="country"
      coveredRegionIds={["US-KY"]}
      onCountrySelect={vi.fn()}
      onRegionSelect={onRegionSelect}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/US.geojson");
  });

  map.emit("click:country-regions-fill", {
    features: [{ properties: { id: "US-KY" } }],
  } as unknown as MapLayerMouseEvent);
  map.emit("click:country-regions-fill", {
    features: [{ properties: { id: "US-TX" } }],
  } as unknown as MapLayerMouseEvent);

  expect(onRegionSelect).toHaveBeenCalledTimes(1);
  expect(onRegionSelect).toHaveBeenCalledWith("US-KY");
});

it("met visuellement en avant la region selectionnee", async () => {
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      selectedRegionId="US-KY"
      viewport="country"
      coveredRegionIds={["US-KY", "US-TX"]}
      onCountrySelect={vi.fn()}
      onRegionSelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/US.geojson");
  });

  const regionFill = map.layers.find(
    (layer) => layer.id === "country-regions-fill",
  );
  expect(JSON.stringify(regionFill?.paint)).toContain("US-KY");
  expect(JSON.stringify(regionFill?.paint)).toContain("#23e7ff");
});

it("actualise les couleurs regionales sans recreer la carte", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      selectedRegionId="US-KY"
      viewport="country"
      coveredRegionIds={["US-KY"]}
      onCountrySelect={vi.fn()}
      onRegionSelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/US.geojson");
  });
  map.setPaintProperty.mockClear();
  map.fitBounds.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      selectedRegionId="US-TX"
      viewport="country"
      coveredRegionIds={["US-TX"]}
      onCountrySelect={vi.fn()}
      onRegionSelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "country-regions-fill",
      "fill-color",
      expect.any(Array),
    );
  });
  expect(JSON.stringify(map.setPaintProperty.mock.calls)).toContain("US-TX");
  expect(map.fitBounds).not.toHaveBeenCalled();
});

it("dessine toutes les zones visibles de la categorie active", async () => {
  const visibleZones = [
    {
      id: "zone-1",
      difficulty: "expert" as const,
      selected: true,
      geoJson: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-101, 38],
            [-98, 38],
            [-98, 41],
            [-101, 41],
            [-101, 38],
          ],
        ],
      },
    },
  ];
  render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      viewport="country"
      visibleZones={visibleZones}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  const addSource = vi.spyOn(map, "addSource");
  map.emit("load");

  expect(addSource).toHaveBeenCalledWith(
    "visible-clue-zones",
    expect.objectContaining({
      data: expect.objectContaining({
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({
              id: "zone-1",
              difficulty: "expert",
              selected: true,
            }),
          }),
        ],
      }),
    }),
  );
  expect(map.layers.map((layer) => layer.id)).toEqual(
    expect.arrayContaining([
      "visible-clue-zones-fill",
      "visible-clue-zones-line",
    ]),
  );
});

it("zoome sur le pays quand un focus explicite est demande", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      focusRequestToken={0}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/FR.geojson");
  });
  map.fitBounds.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="country"
      focusRequestToken={1}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [1, 48],
        [3, 49],
      ],
      expect.objectContaining({
        padding: 40,
        duration: 0,
      }),
    );
  });
});

it("zoome sur la region selectionnee quand un focus explicite est demande", async () => {
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      selectedRegionId="US-KY"
      viewport="country"
      focusRequestToken={0}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");

  await waitFor(() => {
    expect(fetch).toHaveBeenCalledWith("/geography/regions/US.geojson");
  });
  map.fitBounds.mockClear();

  rerender(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="US"
      selectedRegionId="US-KY"
      viewport="country"
      focusRequestToken={1}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [-89.6, 36.5],
        [-81.9, 39.2],
      ],
      expect.objectContaining({
        padding: 40,
        duration: 0,
      }),
    );
  });
});

it("evite de remettre a jour les zones visibles quand les donnees ne changent pas", async () => {
  const visibleZones = [
    {
      id: "zone-1",
      difficulty: "medium" as const,
      selected: false,
      geoJson: {
        type: "Polygon" as const,
        coordinates: [[[-1, 44], [0, 44], [0, 45], [-1, 45], [-1, 44]]],
      },
    },
  ];
  const { rerender } = render(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="world"
      visibleZones={visibleZones}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );
  const map = await getMap();
  map.emit("load");
  const source = map.getSource("visible-clue-zones") as MockGeoJSONSource;

  source.setData.mockClear();
  rerender(
    <AtlasMap
      markers={atlasCountries}
      selectedCountryCode="FR"
      viewport="world"
      visibleZones={[...visibleZones]}
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  await waitFor(() => {
    expect(source.setData).not.toHaveBeenCalled();
  });
});
