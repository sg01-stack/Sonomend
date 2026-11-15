import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { usable } from "../trip";
import { scoreTrip } from "../scoring";
import type { Fix, Trip } from "../types";
import { NavigationServices, MAP_SERVICES } from "./services";
import {
  demoRoute,
  guidance,
  meters,
  type Destination,
  type DrivingRoute,
} from "./routing";
const textNode = (text: string) => {
  const node = document.createElement("span");
  node.textContent = text;
  return node;
};

export class LiveNavigation {
  readonly element = document.createElement("section");
  private map: L.Map;
  private position?: L.CircleMarker;
  private accuracy?: L.Circle;
  private tiles?: L.TileLayer;
  private trace = L.polyline([], { color: "#668b80", weight: 3, opacity: 0.6 });
  private routeLine = L.polyline([], {
    color: "#217f68",
    weight: 7,
    opacity: 0.85,
  });
  private events = L.layerGroup();
  private eventIds = new Set<string>();
  private services = new NavigationServices();
  private searchAbort?: AbortController;
  private routeAbort?: AbortController;
  private online = false;
  private disposed = false;
  private follow = true;
  private current?: Fix;
  private gpsUsable = false;
  private route?: DrivingRoute;
  private destination?: Destination;
  private offset = 0;
  private offRouteFixes = 0;
  private lastFixAt = 0;
  private lastReroute = -Infinity;
  private routeBusy = false;
  private selected?: L.CircleMarker;
  private redraw = false;
  constructor(private trip: Trip) {
    this.element.className = "card navigation-card";
    this.element.setAttribute("aria-label", "Trip navigation");
    this.element.innerHTML = `<div class="card-heading"><div><p class="eyebrow">YOUR ROUTE + YOUR POINTS</p><h2>Trip navigation</h2></div><span class="pill">${trip.mode === "live" ? "GPS" : "Demo GPS"}</span></div>
   <div class="turn-card" aria-live="polite"><svg class="turn-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg><div><strong data-nav="instruction">Waiting for a usable GPS position</strong><small data-nav="eta">Position view · streets are optional</small></div></div>
   <div class="map-wrap"><div class="navigation-map" role="region" aria-label="Live GPS map"></div><div class="map-score" aria-label="Live net points"><strong data-nav="points">0</strong><span>net points</span></div></div>
   <div class="map-toolbar"><button class="button outline" data-nav="follow">Follow me</button><span data-nav="gps" class="small muted">GPS waiting</span><button class="button text-button" data-nav="online">Enable online map</button></div>
   <p class="small muted" data-nav="privacy">Online streets and routing use free OpenStreetMap, Nominatim and OSRM services. Enabling them shares your map area, searches and route coordinates with those providers. Audio stays on-device. Configure your destination while parked.</p>
   <p class="small warning-text" data-nav="tiles" role="status"></p>
   <form class="destination-form"><label for="destination-query">Where to?</label><div><input id="destination-query" maxlength="180" placeholder="Place name or latitude, longitude" autocomplete="off" disabled><button class="button primary" data-nav="search" disabled>Find destination</button></div></form>
   <div class="destination-results" aria-label="Destination results"></div><p class="navigation-error" role="status"></p>
   <div class="route-summary" hidden><span data-nav="destination"></span><button class="button text-button" data-nav="clear" type="button">Clear route</button></div>
   <p class="small muted navigation-disclaimer">Beta on-screen guidance · no live traffic or offline street maps. Follow road signs and conditions. GPS loss pauses directions; horn scoring continues independently.</p>`;
    this.map = L.map(
      this.element.querySelector<HTMLElement>(".navigation-map")!,
      { zoomControl: true, attributionControl: true },
    ).setView([0, 0], 2);
    this.trace.addTo(this.map);
    this.routeLine.addTo(this.map);
    this.events.addTo(this.map);
    for (const zone of trip.zones) {
      L.circle([zone.latitude, zone.longitude], {
        radius: zone.radius,
        color: zone.type === "quiet zone" ? "#668c40" : "#b67330",
        weight: 2,
        fillOpacity: 0.1,
      })
        .bindTooltip(textNode(zone.name))
        .addTo(this.map);
    }
    this.map.on("dragstart", () => {
      this.follow = false;
      this.node<HTMLButtonElement>("follow").textContent = "Recenter";
    });
    this.map.on("click", (e: L.LeafletMouseEvent) => {
      if (!this.online || trip.mode !== "live") return;
      const d = {
        latitude: e.latlng.lat,
        longitude: e.latlng.lng,
        name: "Selected map point",
      };
      this.showResults([d]);
    });
    this.node("follow").addEventListener("click", () => {
      this.follow = true;
      this.node("follow").textContent = "Following GPS";
      if (this.current)
        this.map.setView([this.current.latitude, this.current.longitude], 16);
    });
    this.node("online").addEventListener("click", () => this.toggleOnline());
    this.element.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.search();
    });
    this.node("clear").addEventListener("click", () => this.clearRoute());
    if (trip.mode !== "live") {
      this.applyRoute(demoRoute());
      this.map.setView([12.9716, 77.596], 15);
      this.setText(
        "privacy",
        "Simulated navigation rehearsal: local route and demo zones; no street-map or routing requests are made unless you enable the online map.",
      );
      this.setText("instruction", "Head east on the simulated route");
    }
  }
  mount(host: HTMLElement) {
    host.append(this.element);
    if (!this.redraw) {
      this.redraw = true;
      requestAnimationFrame(() => {
        this.redraw = false;
        if (!this.disposed) this.map.invalidateSize({ pan: false });
      });
    }
  }
  update(trip: Trip, gpsAvailable: boolean, now: number) {
    if (this.disposed) return;
    this.trip = trip;
    this.setText("points", String(scoreTrip(trip).totalPoints));
    const latest = [...trip.fixes].reverse().find((f) => usable(f));
    this.gpsUsable = !!latest && gpsAvailable && now - latest.at <= 5000;
    this.current = latest;
    this.setText(
      "gps",
      this.gpsUsable
        ? `GPS ±${Math.round(latest!.accuracy)} m`
        : "GPS interrupted · last position retained",
    );
    this.node<HTMLButtonElement>("follow").disabled = !latest;
    if (latest) {
      const latlng: L.LatLngTuple = [latest.latitude, latest.longitude];
      if (!this.position) {
        this.position = L.circleMarker(latlng, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#245ca6",
          fillOpacity: 1,
        }).addTo(this.map);
        this.accuracy = L.circle(latlng, {
          radius: latest.accuracy,
          color: "#245ca6",
          weight: 1,
          fillOpacity: 0.06,
        }).addTo(this.map);
        this.map.setView(latlng, 16);
      } else {
        this.position
          .setLatLng(latlng)
          .setStyle({ fillColor: this.gpsUsable ? "#245ca6" : "#869087" });
        this.accuracy!.setLatLng(latlng).setRadius(latest.accuracy);
      }
      if (this.gpsUsable && this.follow && latest.at !== this.lastFixAt)
        this.map.setView(latlng, Math.max(15, this.map.getZoom()), {
          animate: false,
        });
    }
    const segments: L.LatLngTuple[][] = [];
    let segment: L.LatLngTuple[] = [];
    let previous: Fix | undefined;
    for (const fix of trip.fixes) {
      if (!usable(fix)) {
        if (segment.length) segments.push(segment);
        segment = [];
        previous = undefined;
        continue;
      }
      if (
        previous &&
        (fix.at - previous.at > 5000 ||
          trip.gaps.some(
            (g) =>
              g.kind === "gps" &&
              g.start < fix.at &&
              (g.end ?? Infinity) > previous!.at,
          ))
      ) {
        segments.push(segment);
        segment = [];
      }
      segment.push([fix.latitude, fix.longitude]);
      previous = fix;
    }
    if (segment.length) segments.push(segment);
    this.trace.setLatLngs(segments);
    for (const event of trip.events)
      if (event.location && !this.eventIds.has(event.id)) {
        this.eventIds.add(event.id);
        L.circleMarker([event.location.latitude, event.location.longitude], {
          radius: 6,
          color: "#fff",
          weight: 2,
          fillOpacity: 1,
          fillColor: event.review ? "#d86c42" : "#b79830",
        })
          .bindTooltip(
            textNode(`${event.label}${event.review ? " · Review" : ""}`),
          )
          .addTo(this.events);
      }
    if (!this.gpsUsable) {
      this.setText("instruction", "GPS unavailable · directions paused");
      this.setText("eta", "Waiting for a fresh position with accuracy ≤35 m");
      return;
    }
    if (this.route) {
      const g = guidance(this.route, latest!, this.offset);
      this.offset = g.offset;
      this.setText("instruction", g.instruction);
      this.setText(
        "eta",
        g.arrived
          ? "Destination reached · End Trip when safely parked"
          : `${meters(g.toTurn)} to next instruction · ${meters(g.remaining)} remaining · about ${Math.max(1, Math.ceil(g.seconds / 60))} min (no traffic)`,
      );
      if (latest!.at !== this.lastFixAt)
        this.offRouteFixes = g.offRoute ? this.offRouteFixes + 1 : 0;
      if (
        g.offRoute &&
        this.offRouteFixes >= 3 &&
        this.online &&
        !this.route.demo &&
        !this.routeBusy &&
        now - this.lastReroute > 20000
      ) {
        this.lastReroute = now;
        void this.select(this.destination!, true);
      }
    } else {
      this.setText(
        "instruction",
        this.online
          ? "Choose a destination or tap the map"
          : "Your GPS position · enable streets and directions",
      );
      this.setText("eta", "Horn monitoring and points are active");
    }
    this.lastFixAt = latest!.at;
  }
  destroy() {
    this.disposed = true;
    this.searchAbort?.abort();
    this.routeAbort?.abort();
    this.map.remove();
    this.element.remove();
  }
  private node<T extends HTMLElement = HTMLElement>(name: string) {
    return this.element.querySelector<T>(`[data-nav="${name}"]`)!;
  }
  private setText(name: string, text: string) {
    const node = this.node(name);
    if (node.textContent !== text) node.textContent = text;
  }
  private message(text: string) {
    this.element.querySelector<HTMLElement>(".navigation-error")!.textContent =
      text;
  }
  private toggleOnline() {
    this.online = !this.online;
    this.node("online").textContent = this.online
      ? "Disable online map"
      : "Enable online map";
    this.element.querySelector<HTMLInputElement>("input")!.disabled =
      !this.online;
    this.node<HTMLButtonElement>("search").disabled = !this.online;
    if (this.online) {
      this.tiles = L.tileLayer(MAP_SERVICES.tiles, {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
        updateWhenIdle: true,
        keepBuffer: 1,
      });
      this.tiles.on("tileerror", () =>
        this.setText(
          "tiles",
          "Street tiles unavailable. Position, route lines and horn scoring still work; retry your connection.",
        ),
      );
      this.tiles.on("tileload", () => this.setText("tiles", ""));
      this.tiles.addTo(this.map);
      this.tiles.bringToBack();
      this.setText(
        "privacy",
        "Online map enabled. Map area/searches go to OpenStreetMap/Nominatim; route coordinates go to OSRM. No audio is sent. Set your destination while parked.",
      );
    } else {
      this.searchAbort?.abort();
      this.routeAbort?.abort();
      this.tiles?.remove();
      this.tiles = undefined;
      this.setText("tiles", "");
      this.setText(
        "privacy",
        "Online map disabled. Loaded route guidance and local GPS tracking remain available. New routes need online access.",
      );
    }
  }
  private async search() {
    if (!this.online) return;
    this.searchAbort?.abort();
    const controller = (this.searchAbort = new AbortController());
    this.message("Searching…");
    this.node<HTMLButtonElement>("search").disabled = true;
    try {
      const results = await this.services.search(
        this.element.querySelector<HTMLInputElement>("input")!.value,
        controller.signal,
      );
      if (this.disposed || controller.signal.aborted) return;
      this.showResults(results);
      this.message(
        results.length
          ? "Choose a destination below."
          : "No places found. Try a different name or coordinates.",
      );
    } catch (e) {
      if (!this.disposed && !controller.signal.aborted)
        this.message(e instanceof Error ? e.message : "Search failed");
    } finally {
      if (this.searchAbort === controller && !this.disposed)
        this.node<HTMLButtonElement>("search").disabled = !this.online;
    }
  }
  private showResults(results: Destination[]) {
    const list = this.element.querySelector(".destination-results")!;
    list.replaceChildren();
    for (const result of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "destination-result";
      button.textContent = result.name;
      button.addEventListener("click", () => void this.select(result));
      list.append(button);
    }
  }
  private async select(destination: Destination, reroute = false) {
    if (!this.online) return;
    if (!this.gpsUsable || !this.current) {
      this.message("A fresh, accurate GPS position is needed to plan a route.");
      return;
    }
    this.routeAbort?.abort();
    const controller = (this.routeAbort = new AbortController());
    this.routeBusy = true;
    this.message(reroute ? "Updating route…" : "Finding a driving route…");
    try {
      const route = await this.services.route(
        this.current,
        destination,
        controller.signal,
      );
      if (this.disposed || controller.signal.aborted) return;
      this.applyRoute(route);
      this.message("Route ready · choose your destination while parked.");
      this.element.querySelector(".destination-results")!.replaceChildren();
      this.update(this.trip, this.gpsUsable, Date.now());
    } catch (e) {
      if (!this.disposed && !controller.signal.aborted)
        this.message(e instanceof Error ? e.message : "Route failed");
    } finally {
      if (this.routeAbort === controller) this.routeBusy = false;
    }
  }
  private applyRoute(route: DrivingRoute) {
    this.route = route;
    this.destination = route.destination;
    this.offset = 0;
    this.offRouteFixes = 0;
    this.routeLine.setLatLngs(route.coordinates.map((p) => [p[1], p[0]]));
    this.selected?.remove();
    this.selected = L.circleMarker(
      [route.destination.latitude, route.destination.longitude],
      { radius: 8, color: "#153c32", fillColor: "#d0f59c", fillOpacity: 1 },
    )
      .bindTooltip(textNode(route.destination.name))
      .addTo(this.map);
    this.setText("destination", route.destination.name);
    this.element.querySelector<HTMLElement>(".route-summary")!.hidden = false;
    this.map.fitBounds(this.routeLine.getBounds(), {
      padding: [30, 30],
      maxZoom: 16,
    });
  }
  private clearRoute() {
    this.routeAbort?.abort();
    this.route = undefined;
    this.destination = undefined;
    this.routeLine.setLatLngs([]);
    this.selected?.remove();
    this.selected = undefined;
    this.element.querySelector<HTMLElement>(".route-summary")!.hidden = true;
    this.message("Route cleared. Your trip and points are still recording.");
    this.update(this.trip, this.gpsUsable, Date.now());
  }
}
