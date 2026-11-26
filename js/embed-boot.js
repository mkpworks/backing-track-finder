const script = document.currentScript;
const base = new URL("./", (script && script.src) || "https://mkpworks.github.io/backing-track-finder/embed.js");
let catalogPromise = null;

function cssHeight(value) {
  const text = String(value == null ? "" : value).trim();
  if (!text) return "";
  if (/^\d+(\.\d+)?$/.test(text)) return text + "px";
  return text;
}

function accentInk(hex) {
  let body = String(hex || "").replace("#", "");
  if (body.length === 3) body = body.split("").map((ch) => ch + ch).join("");
  if (body.length < 6) return "#1c1406";
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  if ([r, g, b].some((part) => Number.isNaN(part))) return "#1c1406";
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.62 ? "#1c1406" : "#fff8ea";
}

function readOptions(el, extra) {
  const fromEl = el ? {
    theme: el.getAttribute("data-theme"),
    accent: el.getAttribute("data-accent"),
    height: el.getAttribute("data-height"),
    channel: el.getAttribute("data-channel"),
    practice: el.getAttribute("data-practice") || el.getAttribute("data-instrument"),
    instrument: el.getAttribute("data-instrument"),
    style: el.getAttribute("data-style"),
    key: el.getAttribute("data-key"),
    progression: el.getAttribute("data-progression"),
    kind: el.getAttribute("data-kind"),
    omitted: el.getAttribute("data-omitted"),
    duration: el.getAttribute("data-duration"),
    tempoMin: el.getAttribute("data-tempo-min"),
    tempoMax: el.getAttribute("data-tempo-max"),
    quick: el.getAttribute("data-quick"),
    includeReview: el.getAttribute("data-include-review") === "true",
  } : {};
  return Object.assign({}, fromEl, extra || {});
}

function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = (async function () {
      const versionUrl = new URL("data/version.json", base);
      versionUrl.searchParams.set("t", String(Date.now()));
      const versionRes = await fetch(versionUrl.href, { cache: "no-store" });
      if (!versionRes.ok) throw new Error("version");
      const version = await versionRes.json();
      const catalogUrl = new URL("data/catalog.json", base);
      catalogUrl.searchParams.set("v", version.generated_at || version.version || "1");
      const catalogRes = await fetch(catalogUrl.href);
      if (!catalogRes.ok) throw new Error("catalog");
      const catalog = await catalogRes.json();
      if (!catalog || String(catalog.version) !== "1") throw new Error("catalog shape");
      if (!Array.isArray(catalog.rows) && !Array.isArray(catalog.tracks) && !(Array.isArray(catalog.shards) && catalog.shards.length)) {
        throw new Error("catalog shape");
      }
      if (catalog.facets !== undefined && (typeof catalog.facets !== "object" || Array.isArray(catalog.facets))) {
        throw new Error("catalog facets");
      }
      return catalog;
    })().catch((error) => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

function mount(el, extra) {
  if (!el) return null;
  if (el.__backingTrackFinder) return el.__backingTrackFinder;
  const options = readOptions(el, extra);
  const shadow = el.shadowRoot || el.attachShadow({ mode: "open" });
  const theme = options.theme === "light" || options.theme === "dark"
    ? options.theme
    : (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  el.setAttribute("data-theme", theme);
  el.style.display = "block";
  if (options.accent && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(options.accent)) {
    el.style.setProperty("--accent", options.accent);
    el.style.setProperty("--accent-ink", accentInk(options.accent));
  }
  const height = cssHeight(options.height);
  if (height) {
    el.style.maxHeight = height;
    el.style.overflow = "auto";
  }
  const styleUrl = new URL("css/styles.css", base).href;
  const home = new URL("./", base).href;
  const csv = new URL("data/catalog.csv", base).href;
  shadow.innerHTML = '<link rel="stylesheet" href="' + styleUrl + '">' + FinderView.shellHtml({ home: home, csv: csv });
  const api = { element: el };
  el.__backingTrackFinder = api;
  loadCatalog().then((catalog) => {
    const unpacked = Catalog.unpackCatalog(catalog);
    const view = FinderView.mount(shadow, {
      tracks: unpacked.tracks,
      facets: unpacked.facets,
      channels: unpacked.channels,
      reviewChannelIds: unpacked.reviewChannelIds,
      total: unpacked.total,
      sample: unpacked.sample,
      pending: unpacked.lazy,
      assetBase: base.href,
      themeTarget: el,
      persistTheme: false,
      channel: options.channel,
      practice: options.practice,
      instrument: options.instrument,
      style: options.style,
      key: options.key,
      progression: options.progression,
      kind: options.kind,
      omitted: options.omitted,
      duration: options.duration,
      tempoMin: options.tempoMin,
      tempoMax: options.tempoMax,
      quick: options.quick,
    });
    api.view = view;
    if (!unpacked.lazy) return;
    const prefer = options.style && options.style !== "All" ? options.style : "";
    return Catalog.fetchShards(Object.assign({ preferStyle: prefer }, catalog), base.href, (rows) => {
      view.addTracks(Catalog.unpackRows(catalog, rows));
    }).then(() => {
      view.setPending(false);
    });
  }).catch(() => {
    const status = shadow.getElementById("status");
    if (status) status.textContent = "Could not load the Backing Track Finder catalog.";
  });
  return api;
}

function boot() {
  const nodes = [];
  const byId = document.getElementById("backing-track-finder");
  if (byId) nodes.push(byId);
  document.querySelectorAll("[data-backing-track-finder]").forEach((el) => {
    if (nodes.indexOf(el) === -1) nodes.push(el);
  });
  nodes.forEach((el) => mount(el));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();

window.BackingTrackFinder = { mount: mount };
