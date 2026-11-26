"use strict";

const fs = require("fs");
const path = require("path");
const Catalog = require("../js/catalog.js");
const { loadTracksFile } = require("./validate-data.js");

function buildCatalogObject(tracks, facets, generatedAt, options) {
  const shardAt = options && Object.prototype.hasOwnProperty.call(options, "shardAt") ? options.shardAt : Catalog.SHARD_AT;
  const packed = Catalog.packTracks(tracks);
  const plan = Catalog.planShards(tracks, shardAt);
  const catalog = {
    version: Catalog.SCHEMA_VERSION,
    generated_at: generatedAt,
    packing: "rows",
    sample: Boolean(options && options.sample),
    facets: facets || {},
    channels: packed.channels,
    omitted: packed.omitted,
    targets: packed.targets,
    styles: packed.styles,
    keys: packed.keys,
    progressions: packed.progressions,
    scales: packed.scales,
    kinds: packed.kinds,
    tags: packed.tags,
  };
  const channelRecords = (options && options.channels) || [];
  catalog.review_channel_ids = channelRecords.filter((item) => item && item.review_flag).map((item) => item.channel_id);
  catalog.tracks = tracks.length;
  if (!plan) {
    catalog.rows = packed.rows;
    return { catalog, shardFiles: {} };
  }
  const byId = new Map();
  tracks.forEach((track, index) => byId.set(track.id, packed.rows[index]));
  const shardFiles = {};
  catalog.shards = plan.map((shard) => {
    shardFiles[shard.slug] = { rows: shard.ids.map((id) => byId.get(id)) };
    return {
      slug: shard.slug,
      file: "data/shards/" + shard.slug + ".json",
      count: shard.ids.length,
    };
  });
  return { catalog, shardFiles };
}

function loadChannels(root) {
  const file = path.join(root, "data", "channels.json");
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeCatalog(tracks, facets, outDir, options) {
  const generatedAt = (options && options.generatedAt) || new Date().toISOString();
  const built = buildCatalogObject(tracks, facets, generatedAt, options);
  const shardDir = path.join(outDir, "shards");
  fs.rmSync(shardDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  if (Object.keys(built.shardFiles).length) {
    fs.mkdirSync(shardDir, { recursive: true });
    for (const slug of Object.keys(built.shardFiles)) {
      fs.writeFileSync(path.join(shardDir, slug + ".json"), JSON.stringify(built.shardFiles[slug]));
    }
  }
  const version = {
    version: Catalog.SCHEMA_VERSION,
    generated_at: generatedAt,
    tracks: tracks.length,
    sample: Boolean(options && options.sample),
    sharded: Boolean(built.catalog.shards),
  };
  fs.writeFileSync(path.join(outDir, "catalog.json"), JSON.stringify(built.catalog));
  fs.writeFileSync(path.join(outDir, "version.json"), JSON.stringify(version));
  return { catalog: built.catalog, version, shardCount: Object.keys(built.shardFiles).length };
}

function main() {
  const root = path.join(__dirname, "..");
  const outDir = path.resolve(process.argv[2] || path.join(root, "data"));
  const source = loadTracksFile(path.join(root, "data", "tracks.json"));
  const facetPath = path.join(root, "data", "facets.json");
  const facets = fs.existsSync(facetPath) ? JSON.parse(fs.readFileSync(facetPath, "utf8")) : {};
  const written = writeCatalog(source.tracks, facets, outDir, {
    sample: source.sample,
    channels: loadChannels(root),
  });
  console.log(
    "Wrote catalog v" + Catalog.SCHEMA_VERSION +
    " (" + source.tracks.length + " tracks, " + written.shardCount + " shards) to " + outDir
  );
}

module.exports = { buildCatalogObject, writeCatalog };

if (require.main === module) main();
