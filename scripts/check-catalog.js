"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("child_process");
const Catalog = require("../js/catalog.js");
const { validate, loadTracksFile } = require("./validate-data.js");
const { writeCatalog } = require("./build-catalog.js");

const root = path.join(__dirname, "..");
const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message || "assertion failed");
}

function finish() {
  if (!errors.length) return;
  console.error(errors.join("\n"));
  process.exit(1);
}

const source = loadTracksFile(path.join(root, "data", "tracks.json"));
const facets = JSON.parse(fs.readFileSync(path.join(root, "data", "facets.json"), "utf8"));
const tracks = source.tracks;

assert(source.sample === false, "researched catalog is not sample data");
assert(tracks.length === 82021, "track count");
const facetIndex = Catalog.normalizeFacets(facets);
for (const name of ["heavy metal", "grateful dead", "jazz", "blues", "funk", "rock"]) {
  assert(facetIndex.styles.includes(name), "facets style " + name);
}
for (const name of ["ii-V-I", "minor ii-V-i", "12-bar blues", "rhythm changes", "Coltrane changes", "modal vamp"]) {
  assert(facetIndex.progressions.includes(name), "facets progression " + name);
}
assert(facetIndex.kinds.includes("drone") && facetIndex.kinds.includes("backing track"), "kinds");
assert(facetIndex.labels.practice_instruments.piano === "Piano/Keys", "piano label");
assert(validate(tracks, facets, source).length === 0, validate(tracks, facets, source).slice(0, 8).join("; "));

const channelFile = JSON.parse(fs.readFileSync(path.join(root, "data", "channels.json"), "utf8"));
const reviewIds = new Set(channelFile.filter((item) => item.review_flag).map((item) => item.channel_id));
assert(channelFile.length === 519, "channel file");
assert(reviewIds.size === 14, "channels under review");

const loaded = Catalog.buildIndex(tracks, facets, { reviewChannelIds: [...reviewIds] });
assert(loaded.tracks.length === 82021, "index");
assert(loaded.channels.length === 519, "channel index");

function count(filters) {
  return tracks.reduce((sum, item) => sum + (Catalog.matches(item, filters, loaded) ? 1 : 0), 0);
}

assert(count({}) === 82021 - 4891, "review tracks hidden by default");
assert(count({ includeReview: true }) === 82021, "review toggle shows every track");
assert(count({ practice: "guitar", includeReview: true }) === 27937, "guitar practice");
assert(count({ omitted: "bass", includeReview: true }) === 4479, "bassless");
assert(count({ omitted: "drums", includeReview: true }) === 5381, "drumless");
assert(count({ practice: "piano", includeReview: true }) === 4260, "piano practice");
assert(count({ style: "heavy metal", includeReview: true }) === 4160, "heavy metal");
assert(count({ style: "Heavy metal", includeReview: true }) === 4160, "heavy metal ignores case");
assert(count({ style: "grateful dead", includeReview: true }) === 300, "grateful dead");
assert(count({ style: "jazz", progression: "ii-V-I", includeReview: true }) === 987, "jazz ii-V-I");
assert(count({ style: "jazz", progression: "II–V–I", includeReview: true }) === 987, "progression match ignores case and dash");
assert(count({ kind: "drone", includeReview: true }) === 2822, "drones");
assert(count({ progression: "12-bar blues", includeReview: true }) === 1434, "12-bar blues");
assert(count({ key: "E", includeReview: true }) === 2116, "bare key");
assert(count({ tempoMin: "100", tempoMax: "140", includeReview: true }) > 0, "tempo range");
assert(tracks.some((item) => item.tempo_bpm == null && !Catalog.matches(item, { tempoMin: "100", includeReview: true }, loaded)), "unknown tempo drops out of a range");
const shardPlan = Catalog.planShards(tracks, 400);
assert(shardPlan && shardPlan.length > 1, "large catalog shards");
assert(shardPlan.every((shard) => shard.ids.length <= Catalog.SHARD_CHUNK), "shard chunks stay bounded");
assert(Catalog.planShards(tracks.slice(0, 10), 400) === null, "small catalogs stay inline");

const quickIds = Catalog.QUICK.map((item) => item.id);
for (const id of ["guitar", "bass", "drums", "piano", "metal", "dead", "twofive", "drones"]) {
  assert(quickIds.includes(id), "quick chip " + id);
}
assert(Catalog.sameQuick({ practice: "guitar", query: "" }, Catalog.quickById("guitar").filters), "guitar chip state");
assert(!Catalog.sameQuick({ practice: "guitar", style: "Jazz", query: "" }, Catalog.quickById("guitar").filters), "extra filter leaves the chip");

function channelId(fill) {
  return "UC" + String(fill).repeat(22).slice(0, 22);
}

function track(overrides) {
  const extra = overrides || {};
  const item = Object.assign({
    id: "aaaaaaaaaaa",
    title: "Sample title",
    channel: "Alpha Channel",
    channel_id: channelId("a"),
    url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    duration_s: 200,
    year: 2020,
    omitted_instruments: ["guitar"],
    target_instruments: ["guitar"],
    styles: ["Jazz"],
    key: "C",
    tempo_bpm: 120,
    progression: "ii-V-I",
    scale: "Major",
    kind: "backing track",
    tags: ["swing"],
  }, extra);
  if (!Object.prototype.hasOwnProperty.call(extra, "url")) {
    item.url = "https://www.youtube.com/watch?v=" + item.id;
  }
  return item;
}

const openFacets = { styles: [], progressions: [], keys: [], kinds: [], practice_instruments: [], omitted_instruments: [] };
assert(validate([track()], facets, null).length === 0, validate([track()], facets, null).join("; "));
assert(validate([track({ key: null, tempo_bpm: null, progression: null, scale: null, year: null, tags: [], target_instruments: ["any"], styles: [] })], facets, null).length === 0, "null musical fields");
assert(validate([track({ omitted_instruments: ["none"], target_instruments: ["bass"] })], facets, null).length === 0, "full band");
assert(validate([track({ instrument: "kazoo" })], openFacets, null).some((error) => error.includes("unknown field")), "unknown fields are rejected");
assert(validate([track({ styles: ["Hip-hop"], progression: "custom vamp", key: "F#" })], openFacets, null).length === 0, "empty facet lists stay open");
assert(validate([track(), track()], facets, null).some((error) => error.includes("duplicate id")), "duplicate id");
assert(validate([track({ title: "  " })], facets, null).some((error) => error.includes("title")), "title");
assert(validate([track({ kind: "karaoke" })], facets, null).some((error) => error.includes("kind")), "kind enum");
assert(validate([track({ omitted_instruments: ["none", "guitar"] })], facets, null).some((error) => error.includes("none")), "none is exclusive");
assert(validate([track({ omitted_instruments: ["sax"] })], facets, null).some((error) => error.includes("omitted_instruments")), "omitted token");
assert(validate([track({ target_instruments: ["none"] })], facets, null).some((error) => error.includes("target_instruments")), "target none");
assert(validate([track({ tempo_bpm: 0 })], facets, null).some((error) => error.includes("tempo_bpm")), "tempo");
assert(validate([track({ duration_s: 0 })], facets, null).some((error) => error.includes("duration_s")), "duration");
assert(validate([track({ year: null })], facets, null).length === 0, "unknown year");
assert(validate([track({ url: "https://youtu.be/aaaaaaaaaaa" })], facets, null).length === 0, "youtu.be");
assert(validate([track({ url: "https://www.youtube.com/shorts/aaaaaaaaaaa" })], facets, null).length === 0, "shorts");
assert(validate([track({ url: "https://www.youtube.com/watch?v=bbbbbbbbbbb" })], facets, null).some((error) => error.includes("url")), "url id");
assert(validate([track({ styles: ["not-a-real-style"] })], openFacets, null).length === 0, "styles stay open");
assert(validate([track({ styles: ["Jazz", "Jazz"] })], facets, null).some((error) => error.includes("repeats")), "duplicate style");
assert(validate(tracks, ["Jazz"], source).some((error) => error.includes("object")), "facets shape");

assert(Catalog.formatDuration(0) === "0:00:00");
assert(Catalog.formatDuration(61) === "0:01:01");
assert(Catalog.formatDuration(7474) === "2:04:34");
assert(Catalog.pageCount(0) === 1 && Catalog.pageCount(12) === 1 && Catalog.pageCount(13) === 2);
assert(Catalog.PER_PAGE === 12);
assert(Catalog.YT_TRAINER_BASE === "https://ytmusictrainer.com/?video_id=");
assert(Catalog.trainerUrl("aaaaaaaaaaa") === "https://ytmusictrainer.com/?video_id=aaaaaaaaaaa");
assert(Catalog.fold("José") === "jose");
assert(Catalog.labelOf("play-along", facetIndex.labels.kinds) === "Play-along");
assert(Catalog.normProgression("II – V – I") === "ii-v-i");

const alpha = track({
  id: "aaaaaaaaaaa",
  channel: "Alpha Channel",
  channel_id: channelId("a"),
  styles: ["Jazz"],
  progression: "ii-V-I",
  year: 2019,
  duration_s: 180,
  tempo_bpm: 100,
});
const alphaAgain = track({
  id: "bbbbbbbbbbb",
  channel: "Alpha Channel",
  channel_id: channelId("a"),
  title: "Second track",
  styles: ["Blues"],
  progression: "12-bar blues",
  key: null,
  tempo_bpm: null,
  year: null,
  duration_s: 600,
  omitted_instruments: ["drums"],
  target_instruments: ["drums"],
  kind: "play-along",
  tags: [],
  scale: null,
});
const beta = track({
  id: "ccccccccccc",
  channel: "José Lessons",
  channel_id: channelId("b"),
  title: 'Hello, "world"',
  styles: ["Funk"],
  progression: null,
  key: "A minor",
  tempo_bpm: 90,
  year: 2024,
  duration_s: 120,
  omitted_instruments: ["none"],
  target_instruments: ["piano"],
  kind: "drone",
  tags: ["room"],
  scale: "Dorian",
});
const catalogTracks = [alpha, alphaAgain, beta];
assert(validate(catalogTracks, facets, null).length === 0, validate(catalogTracks, facets, null).join("; "));
const index = Catalog.buildIndex(catalogTracks, facets);
assert(index.channelCount[channelId("a")] === 2, "channel count");
assert(Catalog.matches(beta, { query: "jose lessons" }, index), "accent-insensitive search");
assert(Catalog.matches(alpha, { query: "ii-v-i" }, index), "search progression");
assert(Catalog.matches(beta, { practice: "piano" }, index) && !Catalog.matches(beta, { omitted: "piano" }, index), "target counts as practice, not omitted");
assert(!Catalog.matches(alphaAgain, { key: "C" }, index), "null key misses a key filter");
assert(Catalog.matches(alphaAgain, { key: "All" }, index), "null key stays in All");
const byTime = Catalog.sortTracks(catalogTracks, "time");
assert(byTime[0].id === alphaAgain.id, "longest first");
const byYear = Catalog.sortTracks(catalogTracks, "year");
assert(byYear[0].year === 2019 && byYear[byYear.length - 1].year == null, "unknown years sort last");
const byTempo = Catalog.sortTracks(catalogTracks, "tempo");
assert(byTempo[0].id === alpha.id && byTempo[byTempo.length - 1].id === alphaAgain.id, "unknown tempo sorts last");
const channelGroups = Catalog.groupTracks(catalogTracks, "channel", "channel", { index });
assert(channelGroups.length === 2 && channelGroups.find((group) => group.key === channelId("a")).count === 2);
const keyGroups = Catalog.groupTracks(catalogTracks, "key", "channel", { index });
assert(!keyGroups.some((group) => group.items.some((item) => item.id === alphaAgain.id)), "null keys leave that view");
const related = Catalog.related(alpha, catalogTracks, 5);
assert(related[0].track.id === alphaAgain.id, "same channel ranks first");
assert(Catalog.relatedReason(related[0], alpha).includes("Alpha Channel"));
assert(Catalog.appearances("alpha", catalogTracks).some((item) => item.name === "Alpha Channel"));

global.Catalog = Catalog;
const FinderView = require("../js/view.js");
const cleared = FinderView.clearedFilters(index, {
  channel: channelId("b"),
  style: "Funk",
  practice: "piano",
  kind: "drone",
}, "Alpha Channel");
assert(cleared.query === "Alpha Channel");
assert(cleared.channel === "All" && cleared.style === "All" && cleared.practice === "All" && cleared.kind === "All", "a name search clears filters that hide hits");
const preset = FinderView.presets({
  practice: "Piano/Keys",
  instrument: "guitar",
  channel: "Alpha Channel",
  kind: "Drone",
  progression: "II-V-I",
  quick: "drones",
}, index);
assert(preset.practice === "piano" && preset.channel === channelId("a"), "preset labels");
assert(preset.kind === "drone", "quick chip overrides kind");
const keyPreset = FinderView.presets({ instrument: "keys" }, index);
assert(keyPreset.practice === "piano", "keys alias");

const packed = Catalog.packTracks(catalogTracks);
const round = Catalog.unpackRows(Object.assign({ version: "1" }, packed), packed.rows);
assert(round.length === 3, "unpack count");
for (const original of catalogTracks) {
  const again = round.find((item) => item.id === original.id);
  for (const field of ["title", "channel", "channel_id", "duration_s", "year", "key", "tempo_bpm", "progression", "scale", "kind"]) {
    assert(again[field] === original[field], "roundtrip " + field + " " + original.id);
  }
  assert(JSON.stringify(again.styles) === JSON.stringify(original.styles), "roundtrip styles");
  assert(JSON.stringify(again.omitted_instruments) === JSON.stringify(original.omitted_instruments), "roundtrip omitted");
  assert(JSON.stringify(again.target_instruments) === JSON.stringify(original.target_instruments), "roundtrip targets");
  assert(JSON.stringify(again.tags) === JSON.stringify(original.tags), "roundtrip tags");
  assert(again.url === "https://www.youtube.com/watch?v=" + original.id, "canonical url");
}
const inlineRound = Catalog.unpackCatalog(Object.assign({ version: "1", sample: false, facets }, packed));
assert(inlineRound.lazy === false && inlineRound.tracks.length === 3, "inline unpack");

function parseCsv(text) {
  assert(text.charCodeAt(0) === 0xFEFF, "csv starts with a UTF-8 BOM");
  const body = text.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      if (field.endsWith("\r")) field = field.slice(0, -1);
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    if (field.endsWith("\r")) field = field.slice(0, -1);
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.length > 1 || cells[0] !== "");
}

const sheet = parseCsv(Catalog.toCsv(Catalog.sortTracks(catalogTracks, "channel")));
assert(sheet[0].join(",") === Catalog.CSV_HEADERS.join(","), "csv header");
const betaRow = sheet.slice(1).find((row) => row[0] === beta.id);
const alphaRow = sheet.slice(1).find((row) => row[0] === alphaAgain.id);
assert(betaRow[sheet[0].indexOf("title")] === 'Hello, "world"');
assert(betaRow[sheet[0].indexOf("key")] === "A minor");
assert(alphaRow[sheet[0].indexOf("year")] === "", "unknown year is blank");
assert(alphaRow[sheet[0].indexOf("tempo_bpm")] === "", "unknown tempo is blank");
assert(alphaRow[sheet[0].indexOf("omitted_instruments")] === "drums");
assert(betaRow[sheet[0].indexOf("ytmusictrainer_url")] === Catalog.trainerUrl(beta.id));
assert(Catalog.toCsv([beta]).includes('"Hello, ""world"""'), "quotes are doubled");
const filteredSheet = parseCsv(Catalog.toCsv(catalogTracks.filter((item) => Catalog.matches(item, { kind: "drone" }, index))));
assert(filteredSheet.length === 2, "filtered csv is one row per track");
assert(parseCsv(Catalog.toCsv([])).length === 1, "empty catalog csv is a header");

const exported = path.join(os.tmpdir(), "btf-catalog-" + process.pid + ".csv");
const exportRun = spawnSync(process.execPath, [path.join(root, "scripts", "export-csv.js"), exported], { encoding: "utf8" });
assert(exportRun.status === 0, exportRun.stderr || "export-csv failed");
assert(fs.readFileSync(exported, "utf8") === Catalog.toCsv(Catalog.sortTracks(tracks, "channel")), "export script matches the catalog csv");
fs.unlinkSync(exported);

const validateRun = spawnSync(process.execPath, [path.join(root, "scripts", "validate-data.js")], { encoding: "utf8" });
assert(validateRun.status === 0, validateRun.stderr || validateRun.stdout || "validate-data failed");

for (const file of ["index.html", "embed-demo.html", "css/styles.css", "js/app.js", "js/view.js", "js/catalog.js", "js/embed-boot.js", "README.md", "SCHEMA.md"]) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/(?:href|src|url\()\s*["']?\//.test(text)) errors.push(file + " has a root-absolute path");
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const shell = FinderView.shellHtml();
const elementIds = ["summary", "sample-banner", "stats", "theme", "q", "quick", "practice", "style", "key", "tempo-min", "tempo-max", "progression", "kind", "channel", "duration", "sort", "review", "status", "facet-note", "results", "discover", "discover-body", "channel-heading", "channel-count", "channel-list", "style-heading", "style-count", "style-list"];
for (const id of elementIds) {
  assert(html.includes('id="' + id + '"'), "page missing " + id);
  assert(shell.includes('id="' + id + '"'), "shell missing " + id);
}
for (const chip of Catalog.QUICK) {
  assert(html.includes(chip.label) && shell.includes(chip.label), "quick label " + chip.label);
  assert(html.includes('data-quick="' + chip.id + '"') && shell.includes('data-quick="' + chip.id + '"'), "quick id " + chip.id);
}
assert(html.includes("Browse by channel") && shell.includes("Browse by channel"));
assert(html.includes("All tracks") && shell.includes("All tracks"));
assert(html.includes("Download this list") && html.includes("Download full spreadsheet") && html.includes("data/catalog.csv"));
assert(shell.includes("Download this list") && shell.includes("Powered by"));
assert(html.includes('id="sample-banner" class="banner" hidden'), "sample banner starts hidden");
assert(fs.readFileSync(path.join(root, "js", "app.js"), "utf8").includes("data/catalog.json"), "the page loads the packed catalog");
assert(!fs.readFileSync(path.join(root, "js", "app.js"), "utf8").includes("data/tracks.json"), "the page does not download the raw track file");
assert(html.includes("data/facets.json") === false, "page does not fetch facets directly");

const viewSource = fs.readFileSync(path.join(root, "js", "view.js"), "utf8");
assert(viewSource.includes("View on YouTube") && viewSource.includes("Open on YT Trainer"), "video links");
assert(viewSource.includes("Catalog.trainerUrl") && !viewSource.includes("ytmusictrainer.com"), "trainer url stays in catalog.js");
assert(viewSource.includes("youtube-nocookie.com/embed/"), "inline player");
assert(viewSource.includes("location.hostname"), "trainer tab follows the host page");
assert(/class="watch"[^>]*target="_blank" rel="noopener noreferrer"/.test(viewSource), "watch links stay in a new tab");
assert(viewSource.includes('data-action="search"') && viewSource.includes('data-key="style"'), "channel search and style filter");

function withPage(hostname, href, fn) {
  const previous = global.window;
  global.window = {
    location: {
      hostname: hostname,
      href: href || ("https://" + (hostname || "example.com") + "/"),
    },
    matchMedia() { return { matches: false }; },
  };
  try {
    return fn();
  } finally {
    if (previous === undefined) delete global.window;
    else global.window = previous;
  }
}

function finderMarkup(hostname) {
  return withPage(hostname, "https://" + (hostname || "example.com") + "/backing-track-finder/", () => {
    const nodes = new Map();
    function el() {
      return {
        value: "",
        hidden: false,
        disabled: false,
        textContent: "",
        innerHTML: "",
        classList: { add() {}, contains() { return false; } },
        setAttribute() {},
        getAttribute() { return null; },
        addEventListener() {},
        focus() {},
        scrollIntoView() {},
      };
    }
    const host = {
      activeElement: null,
      getElementById(id) {
        if (!nodes.has(id)) nodes.set(id, el());
        return nodes.get(id);
      },
      querySelectorAll() { return []; },
      addEventListener() {},
    };
    FinderView.mount(host, {
      tracks: [track()],
      facets,
      themeTarget: { getAttribute() { return "dark"; }, setAttribute() {} },
      persistTheme: false,
    });
    return host.getElementById("results").innerHTML + host.getElementById("discover-body").innerHTML;
  });
}

function anchors(markup, className) {
  const found = [];
  const re = new RegExp('<a class="' + className + '" href="([^"]*)"([^>]*)>', "g");
  let match;
  while ((match = re.exec(markup))) found.push({ href: match[1], attrs: match[2] });
  return found;
}

function assertSameTab(found, label) {
  assert(found.length > 0, label + " missing");
  for (const link of found) {
    assert(!/\btarget\s*=/.test(link.attrs), label + " should omit target on " + link.href + " attrs:" + link.attrs);
    assert(!/\brel\s*=/.test(link.attrs), label + " should omit rel when it stays in this tab");
  }
}

function assertNewTab(found, label) {
  assert(found.length > 0, label + " missing");
  for (const link of found) {
    assert(link.attrs.includes('target="_blank"') && link.attrs.includes('rel="noopener noreferrer"'), label + " should open in a new tab: " + link.attrs);
  }
}

const offSite = finderMarkup("mkpworks.github.io");
assertNewTab(anchors(offSite, "trainer"), "trainer link off the trainer site");
assertNewTab(anchors(offSite, "watch"), "watch link off the trainer site");
assert(offSite.includes('data-action="search" data-query="Alpha Channel"'), "channel name fills the search");
assert(offSite.includes('data-action="pivot" data-key="style" data-value="Jazz"'), "style click filters");
for (const hostname of ["ytmusictrainer.com", "www.ytmusictrainer.com", "play.ytmusictrainer.com", "WWW.YTMUSICTRAINER.COM", "ytmusictrainer.com."]) {
  const markup = finderMarkup(hostname);
  assertSameTab(anchors(markup, "trainer"), "trainer link on " + hostname);
  assertNewTab(anchors(markup, "watch"), "watch link on " + hostname);
}
for (const hostname of ["", "localhost", "example.com", "notytmusictrainer.com", "ytmusictrainer.com.evil.com", "www.ytmusictrainer.com.evil.com"]) {
  const markup = finderMarkup(hostname);
  assertNewTab(anchors(markup, "trainer"), "trainer link on " + (hostname || "(empty host)"));
  assertNewTab(anchors(markup, "watch"), "watch link on " + (hostname || "(empty host)"));
}
assert(anchors(offSite, "trainer").every((link) => link.href === Catalog.trainerUrl("aaaaaaaaaaa")), "trainer href");

function anchorTag(markup, href) {
  const needle = 'href="' + href.replace(/&/g, "&amp;") + '"';
  const at = markup.indexOf(needle);
  assert(at > -1, "missing href " + href);
  return markup.slice(markup.lastIndexOf("<a ", at), markup.indexOf(">", at) + 1);
}

function assertTagNewTab(tag, label) {
  assert(tag.includes('target="_blank"') && tag.includes('rel="noopener noreferrer"'), label + " should open in a new tab: " + tag);
}

function assertTagSameTab(tag, label) {
  assert(!/\btarget\s*=/.test(tag) && !/\brel\s*=/.test(tag), label + " should stay in this tab: " + tag);
}

const trainerHome = "https://www.ytmusictrainer.com/backing-tracks/";
const trainerCsv = "https://cdn.ytmusictrainer.com/data/catalog.csv";
const githubHome = "https://mkpworks.github.io/backing-track-finder/";
const offShell = withPage("example.com", "https://example.com/", () => FinderView.shellHtml({ home: trainerHome, csv: trainerCsv }));
assertTagNewTab(anchorTag(offShell, trainerHome), "powered-by link off the trainer site");
assertTagNewTab(anchorTag(offShell, trainerCsv), "spreadsheet link off the trainer site");
const onShell = withPage("www.ytmusictrainer.com", "https://www.ytmusictrainer.com/tracks/", () => FinderView.shellHtml({ home: trainerHome, csv: trainerCsv }));
assertTagSameTab(anchorTag(onShell, trainerHome), "powered-by link on the trainer site");
assertTagSameTab(anchorTag(onShell, trainerCsv), "spreadsheet link on the trainer site");
const lookalike = withPage("ytmusictrainer.com", "https://ytmusictrainer.com/", () => FinderView.shellHtml({
  home: "https://ytmusictrainer.com.evil.com/finder/",
  csv: "https://notytmusictrainer.com/data/catalog.csv",
}));
assertTagSameTab(anchorTag(lookalike, "https://ytmusictrainer.com.evil.com/finder/"), "lookalike host");
assertTagSameTab(anchorTag(lookalike, "https://notytmusictrainer.com/data/catalog.csv"), "suffix lookalike");
const defaultShell = withPage("mkpworks.github.io", githubHome, () => FinderView.shellHtml());
assertTagSameTab(anchorTag(defaultShell, githubHome), "powered-by link to this site");
assertTagSameTab(anchorTag(defaultShell, githubHome + "data/catalog.csv"), "default spreadsheet link");

const demo = fs.readFileSync(path.join(root, "embed-demo.html"), "utf8");
assert(demo.includes('id="backing-track-finder"') || demo.includes("&lt;div id=\"backing-track-finder\"&gt;&lt;/div&gt;"), "demo snippet");
assert(demo.includes("https://mkpworks.github.io/backing-track-finder/embed.js") && demo.includes("defer"), "demo script url");
assert(demo.includes('src="embed.js"'), "demo runs the local embed");
assert(demo.includes("data-theme") && demo.includes("data-accent") && demo.includes("data-height") && demo.includes("data-quick"));
const boot = fs.readFileSync(path.join(root, "js", "embed-boot.js"), "utf8");
assert(boot.includes("document.currentScript") && boot.includes("data/version.json") && boot.includes("data/catalog.json"), "embed resolves data from its own src");
assert(boot.includes("attachShadow") && boot.includes("[data-backing-track-finder]") && boot.includes("window.BackingTrackFinder"), "embed contract");
assert(boot.includes('cache: "no-store"'), "version fetch bypasses the pages cache");
assert(boot.includes("data-practice") && boot.includes("data-kind") && boot.includes("data-tempo-min"), "embed presets");
const workflow = fs.readFileSync(path.join(root, ".github/workflows/pages.yml"), "utf8");
for (const name of ["actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages", "scripts/validate-data.js", "scripts/validate-tracks.js", "scripts/check-catalog.js", "scripts/build-catalog.js", "scripts/build-embed.js", "embed-demo.html", "workflow_dispatch", "needs: build", "pull_request"]) {
  assert(workflow.includes(name), name);
}
const deployJob = workflow.split(/\n {2}deploy:\n/)[1] || "";
assert(deployJob.length > 0, "deploy job");
assert(!deployJob.includes("actions/upload-pages-artifact"), "deploy job only deploys");
assert(deployJob.includes("pages: write") && deployJob.includes("id-token: write"), "deploy permissions");
assert(workflow.includes("scripts/export-csv.js") && workflow.includes("_site/data/catalog.csv"), "pages build publishes the csv");
assert(/Configure GitHub Pages\n\s+if: github\.event_name != 'pull_request'\n\s+uses: actions\/configure-pages/.test(workflow), "pull requests do not require a Pages site");
assert(workflow.includes("github.event_name != 'pull_request'") && workflow.includes("github.ref == 'refs/heads/main'"), "deploy only from main");

const shardDir = fs.mkdtempSync(path.join(os.tmpdir(), "btf-shards-"));
const sharded = writeCatalog(catalogTracks, facets, shardDir, { shardAt: 2, sample: false, generatedAt: "2026-11-26T00:00:00.000Z" });
assert(!sharded.catalog.rows, "sharded catalog omits inline rows");
assert(sharded.catalog.shards.length >= 2, "one shard per style");
assert(sharded.version.sharded === true, "version flags shards");
let shardRows = [];
for (const shard of sharded.catalog.shards) {
  const body = JSON.parse(fs.readFileSync(path.join(shardDir, "shards", shard.slug + ".json"), "utf8"));
  assert(body.rows.length === shard.count, "shard count " + shard.slug);
  shardRows = shardRows.concat(body.rows);
}
const fromShards = Catalog.unpackRows(sharded.catalog, shardRows);
assert(fromShards.map((item) => item.id).sort().join() === catalogTracks.map((item) => item.id).sort().join(), "shards cover every track");
const inlineDir = fs.mkdtempSync(path.join(os.tmpdir(), "btf-inline-"));
const inline = writeCatalog(catalogTracks, facets, inlineDir, { shardAt: 400, sample: true, generatedAt: "2026-11-26T00:00:00.000Z" });
assert(Array.isArray(inline.catalog.rows) && inline.catalog.rows.length === 3 && !inline.catalog.shards, "small catalogs stay inline");
assert(inline.catalog.sample === true, "sample flag reaches catalog.json");

const built = fs.mkdtempSync(path.join(os.tmpdir(), "btf-site-"));
const catalogBuild = spawnSync(process.execPath, [path.join(root, "scripts", "build-catalog.js"), built], { encoding: "utf8" });
assert(catalogBuild.status === 0, catalogBuild.stderr || catalogBuild.stdout || "build-catalog failed");
const versionFile = JSON.parse(fs.readFileSync(path.join(built, "version.json"), "utf8"));
const catalogFile = JSON.parse(fs.readFileSync(path.join(built, "catalog.json"), "utf8"));
assert(versionFile.version === "1" && catalogFile.version === "1", "schema version 1");
assert(versionFile.generated_at === catalogFile.generated_at && /^\d{4}-\d{2}-\d{2}T/.test(versionFile.generated_at), "generated_at");
assert(versionFile.sample === false && catalogFile.sample === false && versionFile.sharded === true, "researched build is sharded");
assert(versionFile.tracks === 82021 && catalogFile.tracks === 82021, "built track count");
assert(!Array.isArray(catalogFile.rows) && catalogFile.shards.length > 1, "built catalog keeps rows in shards");
assert(catalogFile.review_channel_ids.length === 14, "review channel ids");
const unpackedBuild = Catalog.unpackCatalog(catalogFile);
assert(unpackedBuild.lazy === true && unpackedBuild.tracks.length === 0 && unpackedBuild.total === 82021, "lazy catalog");
assert(catalogFile.facets.styles["heavy metal"] === 4160, "built facets");
assert(fs.existsSync(path.join(built, "shards", catalogFile.shards[0].slug + ".json")), "shard file is written");

const embedOut = path.join(built, "embed.js");
const embedBuild = spawnSync(process.execPath, [path.join(root, "scripts", "build-embed.js"), embedOut], { encoding: "utf8" });
assert(embedBuild.status === 0, embedBuild.stderr || "build-embed failed");
const embedCheck = spawnSync(process.execPath, ["--check", embedOut], { encoding: "utf8" });
assert(embedCheck.status === 0, embedCheck.stderr || "embed.js syntax");
const embedSource = fs.readFileSync(embedOut, "utf8");
for (const needle of ["window.BackingTrackFinder", "attachShadow", "[data-backing-track-finder]", "data/version.json", "data/catalog.json", "Open on YT Trainer", "youtube-nocookie.com/embed/", "Powered by", 'id="practice"', "Browse by channel", "location.hostname", "trainerAnchorAttrs", "Jazz ii-V-I", "fetchShards"]) {
  assert(embedSource.includes(needle), "embed bundle missing " + needle);
}

if (errors.length) finish();
console.log("OK: " + tracks.length + " tracks, filters, pack, shards, csv, embed");
