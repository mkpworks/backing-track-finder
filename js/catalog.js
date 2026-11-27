"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Catalog = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PER_PAGE = 12;
  const SCHEMA_VERSION = "1";
  const SHARD_AT = 400;
  const SHARD_CHUNK = 2500;
  const YT_TRAINER_BASE = "https://ytmusictrainer.com/?video_id=";
  const INSTRUMENTS = ["guitar", "bass", "drums", "piano", "vocals"];
  const OMITTED = ["guitar", "bass", "drums", "piano", "vocals", "none"];
  const PRACTICE_INSTRUMENTS = ["guitar", "bass", "drums", "piano"];
  const KINDS = ["backing track", "drone", "play-along", "looper"];
  const MODES = ["channel", "style", "kind", "key", "progression", "list"];
  const DURATION_FILTERS = [
    ["under-3", "Under 3 min"],
    ["3-6", "3–6 min"],
    ["6-10", "6–10 min"],
    ["10-20", "10–20 min"],
    ["over-20", "Over 20 min"],
  ];
  const QUICK = [
    { id: "guitar", label: "Guitar", filters: { practice: "guitar" } },
    { id: "bass", label: "Bass (bassless)", filters: { omitted: "bass" } },
    { id: "drums", label: "Drums (drumless)", filters: { omitted: "drums" } },
    { id: "piano", label: "Piano", filters: { practice: "piano" } },
    { id: "metal", label: "Heavy metal", filters: { style: "heavy metal" } },
    { id: "dead", label: "Grateful Dead", filters: { style: "grateful dead" } },
    { id: "twofive", label: "Jazz ii-V-I", filters: { style: "jazz", progression: "ii-V-I" } },
    { id: "drones", label: "Drones", filters: { kind: "drone" } },
  ];
  const DEFAULT_LABELS = {
    practice_instruments: {
      guitar: "Guitar",
      bass: "Bass",
      drums: "Drums",
      piano: "Piano/Keys",
    },
    omitted_instruments: {
      guitar: "No guitar",
      bass: "No bass",
      drums: "Drumless",
      piano: "No piano",
      vocals: "No vocals",
      none: "Full band",
    },
    kinds: {
      "backing track": "Backing track",
      drone: "Drone",
      "play-along": "Play-along",
      looper: "Looper",
    },
    styles: {
      "r&b": "R&B",
      lofi: "Lo-fi",
      "hip hop": "Hip hop",
    },
  };
  const FILTER_KEYS = ["practice", "omitted", "style", "key", "progression", "kind", "channel", "duration"];

  function compareNames(a, b) {
    return String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }

  // Menu labels: case-insensitive, and "8-bar" before "12-bar". "funk" sorts before "Triads".
  function compareOptions(a, b) {
    return String(a == null ? "" : a).localeCompare(String(b == null ? "" : b), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  function optionLabel(value, labeler) {
    if (typeof labeler === "function") {
      const label = labeler(value);
      if (label != null && String(label).trim()) return String(label);
    }
    return String(value == null ? "" : value);
  }

  function isPlaceholderOption(text) {
    const folded = fold(text).trim();
    return folded === "all" || folded === "any" || folded === "all instruments";
  }

  function sortOptions(values, labeler) {
    const placeholders = [];
    const rest = [];
    for (const value of values || []) {
      const label = optionLabel(value, labeler);
      if (isPlaceholderOption(label) || isPlaceholderOption(value)) placeholders.push(value);
      else rest.push(value);
    }
    rest.sort((a, b) => compareOptions(optionLabel(a, labeler), optionLabel(b, labeler)) || compareOptions(a, b));
    return placeholders.concat(rest);
  }

  function sortFacets(facets) {
    if (!facets || typeof facets !== "object" || Array.isArray(facets)) return facets || {};
    const out = {};
    for (const group of Object.keys(facets)) {
      const value = facets[group];
      if (Array.isArray(value)) {
        out[group] = sortOptions(value);
      } else if (value && typeof value === "object") {
        const sorted = {};
        for (const key of sortOptions(Object.keys(value))) sorted[key] = value[key];
        out[group] = sorted;
      } else {
        out[group] = value;
      }
    }
    return out;
  }

  function fold(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function slugify(value) {
    const slug = fold(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug || "unsorted";
  }

  function isSlug(value) {
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value || ""));
  }

  function labelOf(value, labels) {
    const text = String(value || "");
    if (!text) return "";
    if (labels && typeof labels === "object" && typeof labels[text] === "string" && labels[text].trim()) return labels[text];
    if (isSlug(text)) {
      return text.split("-").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }
    if (text === text.toLowerCase()) {
      return text.split(/[\s/]+/).map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part)).join(" ");
    }
    return text;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }

  function yearKey(year) {
    return year ? year : 9999;
  }

  function listOf(value) {
    if (Array.isArray(value)) {
      const out = [];
      const seen = new Set();
      for (const item of value) {
        if (typeof item !== "string") continue;
        const text = item.trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push(text);
      }
      return out;
    }
    if (value && typeof value === "object") return Object.keys(value);
    return [];
  }

  function noteMap(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out = {};
    for (const key of Object.keys(value)) {
      if (typeof value[key] === "string" && value[key].trim()) out[key] = value[key].trim();
    }
    return out;
  }

  function normalizeFacets(facets) {
    const source = facets && typeof facets === "object" && !Array.isArray(facets) ? facets : {};
    const notes = source.notes && typeof source.notes === "object" && !Array.isArray(source.notes) ? source.notes : {};
    const labels = source.labels && typeof source.labels === "object" && !Array.isArray(source.labels) ? source.labels : {};
    return {
      practice_instruments: listOf(source.practice_instruments),
      omitted_instruments: listOf(source.omitted_instruments),
      targets: listOf(source.targets || source.target_instruments).filter((name) => name !== "any" && name !== "none"),
      styles: listOf(source.styles),
      kinds: listOf(source.kinds || source.kind),
      progressions: listOf(source.progressions || source.progression),
      keys: listOf(source.keys || source.key),
      scales: listOf(source.scales || source.scale),
      tags: listOf(source.tags),
      notes: {
        practice_instruments: noteMap(notes.practice_instruments),
        kinds: noteMap(notes.kinds),
      },
      labels: {
        practice_instruments: Object.assign({}, DEFAULT_LABELS.practice_instruments, noteMap(labels.practice_instruments)),
        omitted_instruments: Object.assign({}, DEFAULT_LABELS.omitted_instruments, noteMap(labels.omitted_instruments)),
        styles: Object.assign({}, DEFAULT_LABELS.styles, noteMap(labels.styles)),
        kinds: Object.assign({}, DEFAULT_LABELS.kinds, noteMap(labels.kinds)),
        progressions: noteMap(labels.progressions),
        keys: noteMap(labels.keys),
      },
    };
  }

  function orderedUnion(preferred, extra) {
    const out = [];
    const seen = new Set();
    for (const item of preferred) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    const rest = [];
    for (const item of extra) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      rest.push(item);
    }
    rest.sort(compareNames);
    return out.concat(rest);
  }

  function textOf(track, field) {
    const value = track && track[field];
    return typeof value === "string" ? value.trim() : "";
  }

  function stylesOf(track) {
    return listOf(track && track.styles);
  }

  function omittedOf(track) {
    return listOf(track && track.omitted_instruments);
  }

  function targetsOf(track) {
    return listOf(track && track.target_instruments);
  }

  function tagsOf(track) {
    return listOf(track && track.tags);
  }

  function nullableText(track, field) {
    const value = track && track[field];
    if (value == null) return null;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  function trainerUrl(id) {
    return YT_TRAINER_BASE + encodeURIComponent(id || "");
  }

  function videoIdFromUrl(value) {
    let url;
    try {
      url = new URL(String(value || ""));
    } catch (error) {
      return "";
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.pathname === "/watch" || parts[0] === "watch") return url.searchParams.get("v") || "";
      if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") return parts[1] || "";
    }
    return "";
  }

  function youtubeUrl(track) {
    const stored = track && track.url;
    if (typeof stored === "string" && videoIdFromUrl(stored)) return stored;
    const id = track && track.id ? track.id : "";
    return "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
  }

  function safeHttpUrl(value, fallback) {
    try {
      const url = new URL(String(value || ""));
      if (url.protocol === "https:" || url.protocol === "http:") return url.href;
    } catch (error) {}
    return fallback;
  }

  function practiceToken(value) {
    const folded = fold(value);
    if (folded === "keys" || folded === "piano/keys" || folded === "piano / keys") return "piano";
    return folded;
  }

  function normProgression(value) {
    return fold(value).replace(/[–—]/g, "-").replace(/\s+/g, "");
  }

  function countValues(items, getValues) {
    const counts = {};
    for (const track of items) {
      const values = getValues(track);
      const seen = new Set(Array.isArray(values) ? values : [values]);
      for (const value of seen) {
        if (!value) continue;
        counts[value] = (counts[value] || 0) + 1;
      }
    }
    return counts;
  }

  function instrumentHits(track, token) {
    const name = practiceToken(token);
    if (!name || name === "all") return true;
    return omittedOf(track).includes(name) || targetsOf(track).includes(name);
  }

  function primaryStyle(track) {
    const styles = stylesOf(track);
    return styles[0] || "Unsorted";
  }

  function labelsFor(index, group) {
    return index && index.facets && index.facets.labels && index.facets.labels[group];
  }

  function searchBlob(track, labels) {
    const maps = labels || {};
    const omitted = omittedOf(track);
    const targets = targetsOf(track);
    return fold([
      track.title,
      track.channel,
      stylesOf(track).join(" "),
      stylesOf(track).map((style) => labelOf(style, maps.styles)).join(" "),
      omitted.join(" "),
      omitted.map((name) => labelOf(name, maps.omitted_instruments)).join(" "),
      targets.join(" "),
      targets.map((name) => labelOf(name, maps.practice_instruments)).join(" "),
      track.key || "",
      track.progression || "",
      track.scale || "",
      track.kind || "",
      labelOf(track.kind, maps.kinds),
      tagsOf(track).join(" "),
      track.tempo_bpm ? String(track.tempo_bpm) : "",
      track.year ? String(track.year) : "",
    ].join(" "));
  }

  function rememberChannel(index, id, name) {
    if (!id || index.channelById[id]) return;
    const channel = {
      channel_id: id,
      channel: name || id,
      review: index.reviewIds.has(id),
    };
    index.channelById[id] = channel;
    index.channels.push(channel);
  }

  function bump(counts, value) {
    if (!value) return;
    counts[value] = (counts[value] || 0) + 1;
  }

  function ensureListed(list, value) {
    if (value && list.indexOf(value) === -1) list.push(value);
  }

  function extendIndex(index, more) {
    const items = Array.isArray(more) ? more : [];
    let addedChannel = false;
    for (const track of items) {
      if (!track || !track.id || index.trackIds.has(track.id)) continue;
      index.trackIds.add(track.id);
      track._search = searchBlob(track, index.facets.labels);
      index.tracks.push(track);
      if (!index.channelById[track.channel_id]) addedChannel = true;
      rememberChannel(index, track.channel_id, textOf(track, "channel") || track.channel_id);
      bump(index.channelCount, track.channel_id);
      for (const style of stylesOf(track)) {
        bump(index.styleCount, style);
        ensureListed(index.styles, style);
      }
      const kind = textOf(track, "kind");
      bump(index.kindCount, kind);
      ensureListed(index.kinds, kind);
      if (track.key) {
        bump(index.keyCount, track.key);
        ensureListed(index.keys, track.key);
      }
      if (track.progression) {
        bump(index.progressionCount, track.progression);
        if (!index.facets.progressions.length) ensureListed(index.progressions, track.progression);
      }
      if (track.scale) {
        bump(index.scaleCount, track.scale);
        ensureListed(index.scales, track.scale);
      }
      for (const name of omittedOf(track).concat(targetsOf(track))) {
        if (name && name !== "none" && name !== "any") ensureListed(index.practice, name);
      }
    }
    if (addedChannel) {
      index.channels.sort((a, b) => compareNames(a.channel, b.channel) || compareNames(a.channel_id, b.channel_id));
    }
    return index;
  }

  function buildIndex(tracks, facets, meta) {
    const facet = normalizeFacets(facets);
    const reviewIds = new Set((meta && meta.reviewChannelIds) || []);
    const index = {
      tracks: [],
      trackIds: new Set(),
      facets: facet,
      notes: facet.notes,
      reviewIds,
      channels: [],
      channelById: {},
      channelCount: {},
      practice: (facet.practice_instruments.length ? facet.practice_instruments : PRACTICE_INSTRUMENTS).slice(),
      styles: facet.styles.slice(),
      kinds: (facet.kinds.length ? facet.kinds : KINDS).slice(),
      keys: facet.keys.slice(),
      progressions: facet.progressions.slice(),
      scales: facet.scales.slice(),
      styleCount: {},
      kindCount: {},
      keyCount: {},
      progressionCount: {},
      scaleCount: {},
    };
    for (const entry of (meta && meta.channels) || []) {
      const id = Array.isArray(entry) ? entry[0] : entry && entry.channel_id;
      const name = Array.isArray(entry) ? entry[1] : entry && entry.channel;
      rememberChannel(index, id, name);
    }
    for (const name of facet.targets) ensureListed(index.practice, name);
    index.channels.sort((a, b) => compareNames(a.channel, b.channel) || compareNames(a.channel_id, b.channel_id));
    return extendIndex(index, tracks);
  }

  function facetNote(index, group, value) {
    if (!index || !value || value === "All") return "";
    const notes = index.notes && index.notes[group];
    return notes && notes[value] ? notes[value] : "";
  }

  function inDuration(seconds, bucket) {
    if (!bucket || bucket === "All") return true;
    const total = Number(seconds) || 0;
    if (bucket === "under-3") return total < 180;
    if (bucket === "3-6") return total >= 180 && total < 360;
    if (bucket === "6-10") return total >= 360 && total < 600;
    if (bucket === "10-20") return total >= 600 && total < 1200;
    if (bucket === "over-20") return total >= 1200;
    return true;
  }

  function boundNumber(value) {
    if (value == null || value === "") return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return num;
  }

  function sameQuick(state, filters) {
    const source = state || {};
    const wanted = filters || {};
    for (const key of FILTER_KEYS) {
      if ((source[key] || "All") !== (wanted[key] || "All")) return false;
    }
    if ((source.tempoMin || "") !== (wanted.tempoMin || "")) return false;
    if ((source.tempoMax || "") !== (wanted.tempoMax || "")) return false;
    if (String(source.query || "").trim()) return false;
    return true;
  }

  function blankFilters() {
    return {
      practice: "All",
      omitted: "All",
      style: "All",
      key: "All",
      progression: "All",
      kind: "All",
      channel: "All",
      duration: "All",
      tempoMin: "",
      tempoMax: "",
      query: "",
    };
  }

  function quickById(id) {
    return QUICK.find((item) => item.id === id) || null;
  }

  function matches(track, filters, index) {
    const source = filters || {};
    const practice = source.practice || "All";
    const omitted = source.omitted || "All";
    const style = source.style || "All";
    const key = source.key || "All";
    const progression = source.progression || "All";
    const kind = source.kind || "All";
    const channel = source.channel || "All";
    const duration = source.duration || "All";
    const query = fold(source.query || "").trim();
    const minTempo = boundNumber(source.tempoMin);
    const maxTempo = boundNumber(source.tempoMax);
    if (index && index.reviewIds && index.reviewIds.has(track.channel_id) && source.includeReview !== true) return false;
    if (practice !== "All" && !instrumentHits(track, practice)) return false;
    if (omitted !== "All" && !omittedOf(track).includes(omitted)) return false;
    if (style !== "All" && !stylesOf(track).some((item) => fold(item) === fold(style))) return false;
    if (key !== "All" && fold(track.key || "") !== fold(key)) return false;
    if (progression !== "All" && normProgression(track.progression || "") !== normProgression(progression)) return false;
    if (kind !== "All" && fold(track.kind) !== fold(kind)) return false;
    if (channel !== "All" && track.channel_id !== channel && fold(track.channel) !== fold(channel)) return false;
    if (!inDuration(track.duration_s, duration)) return false;
    if (minTempo != null || maxTempo != null) {
      if (track.tempo_bpm == null) return false;
      if (minTempo != null && track.tempo_bpm < minTempo) return false;
      if (maxTempo != null && track.tempo_bpm > maxTempo) return false;
    }
    if (query) {
      const labels = index && index.facets && index.facets.labels;
      if (!track._search) track._search = searchBlob(track, labels);
      if (!track._search.includes(query)) return false;
    }
    return true;
  }

  function sortTracks(list, sort) {
    const copy = list.slice();
    copy.sort((a, b) => {
      if (sort === "year") {
        return yearKey(a.year) - yearKey(b.year) || compareNames(a.channel, b.channel) || compareNames(a.title, b.title);
      }
      if (sort === "time") {
        return (b.duration_s || 0) - (a.duration_s || 0) || compareNames(a.channel, b.channel) || compareNames(a.title, b.title);
      }
      if (sort === "tempo") {
        const left = a.tempo_bpm == null ? -Infinity : a.tempo_bpm;
        const right = b.tempo_bpm == null ? -Infinity : b.tempo_bpm;
        return right - left || compareNames(a.channel, b.channel) || compareNames(a.title, b.title);
      }
      return compareNames(a.channel, b.channel) || compareNames(a.title, b.title) || yearKey(a.year) - yearKey(b.year);
    });
    return copy;
  }

  function groupLabel(key, mode, index) {
    if (mode === "channel") {
      const channel = index && index.channelById && index.channelById[key];
      return channel ? channel.channel : key;
    }
    const group = {
      style: "styles",
      kind: "kinds",
      key: "keys",
      progression: "progressions",
    }[mode];
    const labels = index && index.facets && index.facets.labels && group ? index.facets.labels[group] : null;
    return labelOf(key, labels);
  }

  function orderFor(mode, index) {
    if (!index) return [];
    if (mode === "style") return index.styles;
    if (mode === "kind") return index.kinds;
    if (mode === "key") return index.keys;
    if (mode === "progression") return index.progressions;
    return [];
  }

  function groupKeys(track, mode) {
    if (mode === "channel") return track.channel_id ? [track.channel_id] : [];
    if (mode === "style") return stylesOf(track);
    if (mode === "kind") return textOf(track, "kind") ? [track.kind] : [];
    if (mode === "key") return track.key ? [track.key] : [];
    if (mode === "progression") return track.progression ? [track.progression] : [];
    return [];
  }

  function groupTracks(rows, mode, sort, options) {
    if (mode === "list") return [];
    const index = options && options.index;
    const map = new Map();
    for (const track of rows) {
      for (const key of new Set(groupKeys(track, mode))) {
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(track);
      }
    }
    const keys = [...map.keys()];
    keys.sort((a, b) => {
      const left = map.get(a);
      const right = map.get(b);
      if (sort === "time") {
        const leftSeconds = left.reduce((sum, track) => sum + (track.duration_s || 0), 0);
        const rightSeconds = right.reduce((sum, track) => sum + (track.duration_s || 0), 0);
        return rightSeconds - leftSeconds || compareNames(groupLabel(a, mode, index), groupLabel(b, mode, index));
      }
      if (sort === "year") {
        const leftYear = Math.min(...left.map((track) => yearKey(track.year)));
        const rightYear = Math.min(...right.map((track) => yearKey(track.year)));
        return leftYear - rightYear || compareNames(groupLabel(a, mode, index), groupLabel(b, mode, index));
      }
      const order = orderFor(mode, index);
      if (order.length && mode !== "channel") {
        const leftAt = order.indexOf(a);
        const rightAt = order.indexOf(b);
        const leftRank = leftAt === -1 ? order.length : leftAt;
        const rightRank = rightAt === -1 ? order.length : rightAt;
        return leftRank - rightRank || compareNames(groupLabel(a, mode, index), groupLabel(b, mode, index));
      }
      return compareNames(groupLabel(a, mode, index), groupLabel(b, mode, index));
    });
    return keys.map((key) => {
      const items = map.get(key);
      return {
        key,
        label: groupLabel(key, mode, index),
        items,
        count: items.length,
        seconds: items.reduce((sum, track) => sum + (track.duration_s || 0), 0),
      };
    });
  }

  function related(track, tracks, limit) {
    const max = limit || 5;
    return (tracks || [])
      .filter((other) => other && other.id !== track.id)
      .map((other) => {
        let score = 0;
        const sharedStyles = stylesOf(other).filter((style) => stylesOf(track).some((item) => fold(item) === fold(style)));
        const sharedTargets = targetsOf(other).filter((name) => targetsOf(track).includes(name));
        if (other.channel_id && other.channel_id === track.channel_id) score += 5;
        if (other.progression && normProgression(other.progression) === normProgression(track.progression)) score += 3;
        score += sharedStyles.length * 2;
        if (other.kind && fold(other.kind) === fold(track.kind)) score += 2;
        if (other.key && fold(other.key) === fold(track.key)) score += 2;
        score += sharedTargets.length;
        return { track: other, score, sharedStyles, sharedTargets };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || compareNames(a.track.channel, b.track.channel) || compareNames(a.track.title, b.track.title))
      .slice(0, max);
  }

  function relatedReason(item, track) {
    const other = item.track;
    if (other.channel_id && other.channel_id === track.channel_id) return "Same channel: " + other.channel;
    if (other.progression && track.progression && normProgression(other.progression) === normProgression(track.progression)) {
      return "Same progression: " + other.progression;
    }
    if (item.sharedStyles.length) return "Same style: " + item.sharedStyles[0];
    if (other.kind && fold(other.kind) === fold(track.kind)) return "Same kind: " + labelOf(other.kind, DEFAULT_LABELS.kinds);
    if (other.key && track.key && fold(other.key) === fold(track.key)) return "Same key: " + other.key;
    if (item.sharedTargets.length) return "Same instrument: " + labelOf(item.sharedTargets[0], DEFAULT_LABELS.practice_instruments);
    return "";
  }

  function appearances(query, items) {
    const needle = fold(query).trim();
    if (needle.length < 2) return [];
    const map = new Map();
    function add(name) {
      if (!name || !fold(name).includes(needle)) return;
      map.set(name, (map.get(name) || 0) + 1);
    }
    for (const track of items || []) {
      add(track.channel);
      for (const style of stylesOf(track)) add(style);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || compareNames(a.name, b.name));
  }

  function pageCount(total) {
    return Math.max(1, Math.ceil(total / PER_PAGE));
  }

  const CSV_HEADERS = [
    "id",
    "title",
    "channel",
    "channel_id",
    "url",
    "duration_s",
    "duration",
    "year",
    "omitted_instruments",
    "target_instruments",
    "styles",
    "key",
    "tempo_bpm",
    "progression",
    "scale",
    "kind",
    "tags",
    "ytmusictrainer_url",
  ];

  function csvField(value) {
    const text = value == null ? "" : String(value);
    if (/[",\r\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function csvRow(track) {
    const seconds = Math.max(0, Math.floor(Number(track && track.duration_s) || 0));
    const values = [
      (track && track.id) || "",
      (track && track.title) || "",
      (track && track.channel) || "",
      (track && track.channel_id) || "",
      youtubeUrl(track),
      String(seconds),
      formatDuration(seconds),
      track && track.year ? String(track.year) : "",
      omittedOf(track).join("; "),
      targetsOf(track).join("; "),
      stylesOf(track).join("; "),
      (track && track.key) || "",
      track && track.tempo_bpm != null ? String(track.tempo_bpm) : "",
      (track && track.progression) || "",
      (track && track.scale) || "",
      (track && track.kind) || "",
      tagsOf(track).join("; "),
      trainerUrl(track && track.id),
    ];
    return values.map(csvField).join(",");
  }

  function toCsv(items) {
    const lines = [CSV_HEADERS.join(",")];
    for (const track of items || []) lines.push(csvRow(track));
    return "\uFEFF" + lines.join("\r\n") + "\r\n";
  }

  function dictionary() {
    const map = new Map();
    const list = [];
    return {
      list,
      id(value) {
        if (value == null || value === "") return -1;
        let at = map.get(value);
        if (at == null) {
          at = list.length;
          map.set(value, at);
          list.push(value);
        }
        return at;
      },
    };
  }

  function many(list, indexes) {
    const out = [];
    for (const index of indexes || []) {
      const value = list[index];
      if (value) out.push(value);
    }
    return out;
  }

  function textAt(list, index) {
    if (index == null || index < 0) return null;
    const value = list[index];
    return value == null || value === "" ? null : value;
  }

  function packTracks(tracks) {
    const omitted = dictionary();
    const targets = dictionary();
    const styles = dictionary();
    const keys = dictionary();
    const progressions = dictionary();
    const scales = dictionary();
    const kinds = dictionary();
    const tags = dictionary();
    const channels = [];
    const channelAt = new Map();
    const rows = [];
    for (const track of tracks || []) {
      let channelIndex = channelAt.get(track.channel_id);
      if (channelIndex == null) {
        channelIndex = channels.length;
        channelAt.set(track.channel_id, channelIndex);
        channels.push([track.channel_id, track.channel]);
      }
      rows.push([
        track.id,
        track.title,
        channelIndex,
        track.year == null ? null : track.year,
        track.duration_s || 0,
        omittedOf(track).map((name) => omitted.id(name)),
        targetsOf(track).map((name) => targets.id(name)),
        stylesOf(track).map((name) => styles.id(name)),
        keys.id(track.key),
        track.tempo_bpm == null ? null : track.tempo_bpm,
        progressions.id(track.progression),
        scales.id(track.scale),
        kinds.id(track.kind),
        tagsOf(track).map((name) => tags.id(name)),
      ]);
    }
    return {
      channels,
      omitted: omitted.list,
      targets: targets.list,
      styles: styles.list,
      keys: keys.list,
      progressions: progressions.list,
      scales: scales.list,
      kinds: kinds.list,
      tags: tags.list,
      rows,
    };
  }

  function rowToTrack(catalog, row) {
    const channel = (catalog.channels || [])[row[2]] || ["", ""];
    const key = textAt(catalog.keys, row[8]);
    const progression = textAt(catalog.progressions, row[10]);
    const scale = textAt(catalog.scales, row[11]);
    return {
      id: row[0],
      title: row[1],
      channel_id: channel[0],
      channel: channel[1],
      url: "https://www.youtube.com/watch?v=" + row[0],
      year: row[3] == null ? null : row[3],
      duration_s: row[4] || 0,
      omitted_instruments: many(catalog.omitted, row[5]),
      target_instruments: many(catalog.targets, row[6]),
      styles: many(catalog.styles, row[7]),
      key,
      tempo_bpm: row[9] == null ? null : row[9],
      progression,
      scale,
      kind: textAt(catalog.kinds, row[12]) || "",
      tags: many(catalog.tags, row[13]),
    };
  }

  function unpackRows(catalog, rows) {
    return (rows || []).map((row) => rowToTrack(catalog, row));
  }

  function catalogMeta(catalog, tracks, lazy) {
    return {
      tracks,
      facets: catalog.facets || {},
      sample: catalog.sample === true,
      lazy,
      channels: Array.isArray(catalog.channels) ? catalog.channels : [],
      reviewChannelIds: Array.isArray(catalog.review_channel_ids) ? catalog.review_channel_ids : [],
      total: catalog.tracks || tracks.length,
    };
  }

  function unpackCatalog(catalog) {
    if (!catalog || String(catalog.version) !== SCHEMA_VERSION) throw new Error("catalog shape");
    if (Array.isArray(catalog.rows)) return catalogMeta(catalog, unpackRows(catalog, catalog.rows), false);
    if (Array.isArray(catalog.tracks) && !catalog.shards) return catalogMeta(catalog, catalog.tracks, false);
    if (Array.isArray(catalog.shards) && catalog.shards.length) return catalogMeta(catalog, [], true);
    throw new Error("catalog shape");
  }

  function planShards(tracks, shardAt, chunkSize) {
    const limit = shardAt == null ? SHARD_AT : shardAt;
    const chunk = chunkSize || SHARD_CHUNK;
    const items = tracks || [];
    if (!limit || items.length < limit) return null;
    const groups = new Map();
    for (const track of items) {
      const slug = slugify(primaryStyle(track));
      if (!groups.has(slug)) groups.set(slug, []);
      groups.get(slug).push(track.id);
    }
    const plan = [];
    for (const slug of [...groups.keys()].sort(compareNames)) {
      const ids = groups.get(slug);
      const parts = Math.max(1, Math.ceil(ids.length / chunk));
      for (let part = 0; part < parts; part += 1) {
        plan.push({
          slug: parts === 1 ? slug : slug + "-" + (part + 1),
          ids: ids.slice(part * chunk, (part + 1) * chunk),
        });
      }
    }
    return plan;
  }

  function fetchShards(catalog, assetBase, onRows) {
    const prefer = slugify((catalog && catalog.preferStyle) || "");
    const shards = ((catalog && catalog.shards) || []).slice().sort((a, b) => {
      const rank = (slug) => (prefer && (slug === prefer || slug.startsWith(prefer + "-")) ? 0 : 1);
      return rank(a.slug) - rank(b.slug) || compareNames(a.slug, b.slug);
    });
    const queue = shards.slice();
    function take() {
      const shard = queue.shift();
      if (!shard) return Promise.resolve();
      let url;
      try {
        url = new URL(shard.file, assetBase || (typeof document !== "undefined" ? document.baseURI : undefined)).href;
      } catch (error) {
        return Promise.reject(error);
      }
      return fetch(url).then((res) => {
        if (!res.ok) throw new Error("shard");
        return res.json();
      }).then((body) => {
        const rows = body && Array.isArray(body.rows) ? body.rows : [];
        if (onRows) onRows(rows, shard);
        return take();
      });
    }
    const width = Math.min(6, queue.length);
    if (!width) return Promise.resolve([]);
    return Promise.all(Array.from({ length: width }, take));
  }

  return {
    PER_PAGE,
    SCHEMA_VERSION,
    SHARD_AT,
    SHARD_CHUNK,
    YT_TRAINER_BASE,
    INSTRUMENTS,
    OMITTED,
    PRACTICE_INSTRUMENTS,
    KINDS,
    MODES,
    DURATION_FILTERS,
    QUICK,
    CSV_HEADERS,
    FILTER_KEYS,
    compareNames,
    compareOptions,
    sortOptions,
    sortFacets,
    fold,
    slugify,
    isSlug,
    labelOf,
    formatDuration,
    yearKey,
    normalizeFacets,
    stylesOf,
    omittedOf,
    targetsOf,
    tagsOf,
    trainerUrl,
    videoIdFromUrl,
    youtubeUrl,
    safeHttpUrl,
    practiceToken,
    normProgression,
    buildIndex,
    extendIndex,
    facetNote,
    inDuration,
    boundNumber,
    sameQuick,
    blankFilters,
    quickById,
    instrumentHits,
    matches,
    sortTracks,
    groupTracks,
    related,
    relatedReason,
    appearances,
    pageCount,
    toCsv,
    primaryStyle,
    searchBlob,
    packTracks,
    unpackRows,
    unpackCatalog,
    planShards,
    fetchShards,
  };
});
