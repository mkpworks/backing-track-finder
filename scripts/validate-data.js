"use strict";

const fs = require("fs");
const path = require("path");
const Catalog = require("../js/catalog.js");

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
const PHRASE_RE = /^[\p{L}\p{N}][\p{L}\p{N} '&+./:,()\-]{0,79}$/u;
const KEY_RE = /^[\p{L}\p{N}][\p{L}\p{N} #b♯♭./-]{0,40}$/u;
const WRAPPER_KEYS = new Set(["_comment", "sample", "tracks"]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value, max) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text || text !== value || text.length > max) return false;
  if (/[\u0000-\u001f]/.test(text)) return false;
  return true;
}

function allowed(value, list, openPattern) {
  if (list && list.length) return list.includes(value);
  if (openPattern) return openPattern.test(value);
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

function parseSource(parsed) {
  if (Array.isArray(parsed)) return { tracks: parsed, sample: false, comment: "" };
  if (!isPlainObject(parsed) || !Array.isArray(parsed.tracks)) return null;
  return {
    tracks: parsed.tracks,
    sample: parsed.sample === true,
    comment: typeof parsed._comment === "string" ? parsed._comment : "",
    wrapper: parsed,
  };
}

function validateFacets(facets) {
  const errors = [];
  if (facets === undefined) return errors;
  if (!isPlainObject(facets)) {
    errors.push("facets must be an object");
    return errors;
  }
  for (const key of Object.keys(facets)) {
    const value = facets[key];
    if (Array.isArray(value)) continue;
    if (isPlainObject(value)) continue;
    errors.push("facets." + key + " must be a list or a count map");
  }
  return errors;
}

function validateList(track, where, field, options) {
  const errors = [];
  const value = track[field];
  if (!Array.isArray(value)) {
    errors.push(where + " " + field + " must be an array");
    return errors;
  }
  if (options.nonEmpty && value.length === 0) {
    errors.push(where + " " + field + " must not be empty");
    return errors;
  }
  const seen = new Set();
  value.forEach((entry, index) => {
    if (!cleanText(entry, options.max || 80)) {
      errors.push(where + " " + field + "[" + index + "] must be a short name");
      return;
    }
    if (seen.has(entry)) errors.push(where + " " + field + " repeats " + entry);
    seen.add(entry);
    if (options.closed && !options.closed.includes(entry)) {
      errors.push(where + " " + field + "[" + index + "] must be one of " + options.closed.join(", "));
    } else if (options.allow && options.allow.length && !options.allow.includes(entry)) {
      errors.push(where + " " + field + "[" + index + "] must be listed in facets");
    } else if (!options.closed && options.pattern && !options.pattern.test(entry)) {
      errors.push(where + " " + field + "[" + index + "] must be a short name");
    }
  });
  if (field === "omitted_instruments" && value.includes("none") && value.length !== 1) {
    errors.push(where + " omitted_instruments uses none only by itself");
  }
  return errors;
}

function validate(tracks, facets, source) {
  const errors = [];
  if (!Array.isArray(tracks)) {
    errors.push("tracks must be an array");
    return errors;
  }
  if (source && source.wrapper) {
    for (const key of Object.keys(source.wrapper)) {
      if (!WRAPPER_KEYS.has(key)) errors.push("unknown tracks wrapper key " + key);
    }
    if (source.wrapper._comment !== undefined && !cleanText(source.wrapper._comment, 2000)) {
      errors.push("_comment must be a non-empty string");
    }
    if (source.wrapper.sample !== undefined && typeof source.wrapper.sample !== "boolean") {
      errors.push("sample must be true or false");
    }
    if (source.sample && !/sample/i.test(source.comment || "")) {
      errors.push("sample data needs a _comment that says it is sample data");
    }
  }
  errors.push(...validateFacets(facets || {}));
  const seen = new Set();
  tracks.forEach((track, index) => {
    const where = "tracks[" + index + "]";
    if (!isPlainObject(track)) {
      errors.push(where + " must be an object");
      return;
    }
    if (typeof track.id !== "string" || !ID_RE.test(track.id)) {
      errors.push(where + " id must be an 11-character YouTube id");
    } else if (seen.has(track.id)) {
      errors.push("duplicate id " + track.id);
    } else {
      seen.add(track.id);
    }
    const fields = ["id", "title", "channel", "channel_id", "url", "duration_s", "year", "omitted_instruments", "target_instruments", "styles", "key", "tempo_bpm", "progression", "scale", "kind", "tags"];
    for (const field of fields) if (!(field in track)) errors.push(where + " missing " + field);
    for (const key of Object.keys(track)) if (!fields.includes(key)) errors.push(where + " unknown field " + key);
    if (typeof track.url !== "string" || Catalog.videoIdFromUrl(track.url) !== track.id) {
      errors.push(where + " url must be a YouTube URL for id");
    }
    if (typeof track.title !== "string" || !track.title.trim()) errors.push(where + " title is required");
    if (typeof track.channel !== "string" || !track.channel.trim()) errors.push(where + " channel is required");
    if (typeof track.channel_id !== "string" || !CHANNEL_ID_RE.test(track.channel_id)) {
      errors.push(where + " channel_id must be a YouTube channel id");
    }
    if (!Number.isInteger(track.duration_s) || track.duration_s < 60 || track.duration_s > 14400) {
      errors.push(where + " duration_s must be an integer from 60 through 14400");
    }
    if (!("year" in track) || !(track.year === null || (Number.isInteger(track.year) && track.year >= 2005 && track.year <= 2030))) {
      errors.push(where + " year must be a year from 2005 through 2030, or null");
    }
    errors.push(...validateList(track, where, "omitted_instruments", {
      nonEmpty: true,
      closed: Catalog.OMITTED,
    }));
    errors.push(...validateList(track, where, "target_instruments", { nonEmpty: true }));
    errors.push(...validateList(track, where, "styles", {}));
    errors.push(...validateList(track, where, "tags", {}));
    if (!("key" in track) || !(track.key === null || typeof track.key === "string")) {
      errors.push(where + " key must be a string or null");
    } else if (track.key && !KEY_RE.test(track.key)) {
      errors.push(where + " key must be a key name");
    }
    if (!("tempo_bpm" in track) || !(track.tempo_bpm === null || (Number.isInteger(track.tempo_bpm) && track.tempo_bpm >= 30 && track.tempo_bpm <= 300))) {
      errors.push(where + " tempo_bpm must be an integer from 30 through 300, or null");
    }
    if (!("progression" in track) || !(track.progression === null || (typeof track.progression === "string" && track.progression))) {
      errors.push(where + " progression must be a string or null");
    }
    if (!("scale" in track) || !(track.scale === null || (typeof track.scale === "string" && track.scale))) {
      errors.push(where + " scale must be a string or null");
    }
    if (typeof track.kind !== "string" || !Catalog.KINDS.includes(track.kind)) {
      errors.push(where + " kind must be backing track, drone, play-along, or looper");
    }
    if (Array.isArray(track.target_instruments) && track.target_instruments.includes("none")) {
      errors.push(where + " target_instruments must not include none");
    }
  });
  return errors;
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error("Could not read " + file + ": " + error.message);
  }
}

function loadTracksFile(file) {
  const parsed = loadJson(file);
  const source = parseSource(parsed);
  if (!source) throw new Error("Could not read tracks from " + file);
  return source;
}

function main() {
  const root = path.join(__dirname, "..");
  const trackFile = process.argv[2] || path.join(root, "data", "tracks.json");
  const facetFile = process.argv[3] || path.join(root, "data", "facets.json");
  let source;
  let facets = {};
  try {
    source = loadTracksFile(trackFile);
    if (fs.existsSync(facetFile)) facets = loadJson(facetFile);
    else if (process.argv[3]) throw new Error("Could not read " + facetFile);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  const errors = validate(source.tracks, facets, source);
  if (errors.length) {
    console.error("Invalid backing-track data (" + errors.length + ")");
    for (const error of errors) console.error(" - " + error);
    process.exit(1);
  }
  const facet = Catalog.normalizeFacets(facets);
  console.log(
    "OK: " + source.tracks.length + " tracks, " +
    facet.styles.length + " styles, " +
    facet.kinds.length + " kinds" +
    (source.sample ? " (sample)" : "")
  );
}

module.exports = { validate, validateFacets, parseSource, loadTracksFile };

if (require.main === module) main();
