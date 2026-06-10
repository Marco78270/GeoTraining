import { render, waitFor } from "@testing-library/react";
import type { MapLayerMouseEvent } from "maplibre-gl";
import { beforeEach, expect, it, vi } from "vitest";
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
});

it("configure le GeoJSON local, les couches et les marqueurs", async () => {
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
  const addSource = vi.spyOn(map, "addSource");
  map.emit("load");

  expect(map.options).toMatchObject({ center: [5, 18], zoom: 1.15 });
  expect(addSource).toHaveBeenCalledWith("world-demo", {
    type: "geojson",
    data: "/geography/world-demo.geojson",
    promoteId: "iso2",
  });
  expect(map.layers.map((layer) => layer.id)).toEqual([
    "countries-fill",
    "countries-line",
    "atlas-markers-glow",
    "atlas-markers",
  ]);
  expect(map.getSource("atlas-markers")?.setData).toHaveBeenCalledWith(
    expect.objectContaining({
      features: expect.arrayContaining([
        expect.objectContaining({ properties: expect.objectContaining({ code: "FR" }) }),
      ]),
    }),
  );
});

it("sélectionne un pays documenté et ignore un pays GeoJSON non documenté", async () => {
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

it("réserve le curseur et le survol interactifs aux pays documentés", async () => {
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

it("zoome, revient au monde et met à jour la source marqueurs", async () => {
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

  rerender(
    <AtlasMap
      markers={atlasCountries.slice(0, 2)}
      selectedCountryCode="FR"
      viewport="country"
      onCountrySelect={vi.fn()}
      onViewportChange={vi.fn()}
    />,
  );

  expect(map.flyTo).toHaveBeenCalledWith({
    center: atlasCountries[0].coordinates,
    zoom: 3.2,
    duration: 900,
  });
  expect(map.getSource("atlas-markers")?.setData).toHaveBeenLastCalledWith(
    expect.objectContaining({ features: expect.any(Array) }),
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

  expect(map.fitBounds).toHaveBeenCalled();
});
