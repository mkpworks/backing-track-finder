"use strict";

(function () {
  const status = document.getElementById("status");
  if (typeof Catalog === "undefined" || typeof FinderView === "undefined") {
    if (status) status.textContent = "The page scripts did not load.";
    return;
  }
  const versionUrl = new URL("data/version.json", document.baseURI);
  versionUrl.searchParams.set("t", String(Date.now()));
  fetch(versionUrl.href, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("version");
    return res.json();
  }).then((version) => {
    const catalogUrl = new URL("data/catalog.json", document.baseURI);
    catalogUrl.searchParams.set("v", version.generated_at || version.version || "1");
    return fetch(catalogUrl.href).then((res) => {
      if (!res.ok) throw new Error("catalog");
      return res.json();
    });
  }).then((catalog) => {
    const unpacked = Catalog.unpackCatalog(catalog);
    const view = FinderView.mount(document, {
      tracks: unpacked.tracks,
      facets: unpacked.facets,
      channels: unpacked.channels,
      reviewChannelIds: unpacked.reviewChannelIds,
      total: unpacked.total,
      sample: unpacked.sample,
      pending: unpacked.lazy,
      assetBase: document.baseURI,
      themeTarget: document.documentElement,
      persistTheme: true,
    });
    if (!unpacked.lazy) return;
    return Catalog.fetchShards(catalog, document.baseURI, (rows) => {
      view.addTracks(Catalog.unpackRows(catalog, rows));
    }).then(() => {
      view.setPending(false);
    });
  }).catch(() => {
    if (status) status.textContent = "Could not load the backing-track catalog. Serve this folder with a local web server so the JSON can be read.";
  });
})();
