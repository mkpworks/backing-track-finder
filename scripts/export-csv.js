"use strict";

const fs = require("fs");
const path = require("path");
const Catalog = require("../js/catalog.js");
const { loadTracksFile } = require("./validate-data.js");

const root = path.join(__dirname, "..");
const outPath = path.resolve(process.argv[2] || path.join(root, "data", "catalog.csv"));
const source = loadTracksFile(path.join(root, "data", "tracks.json"));
const rows = Catalog.sortTracks(source.tracks, "channel");
const csv = Catalog.toCsv(rows);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, csv);
console.log("Wrote " + rows.length + " rows to " + outPath);
