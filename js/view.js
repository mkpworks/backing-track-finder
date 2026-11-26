"use strict";

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FinderView = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const STYLE_COLORS = ["#e07a5f", "#3aa99a", "#e6a23c", "#7ea2e0", "#c46bdc", "#8fbf6a", "#e09ab2", "#d98a4a"];
  const PIVOT_KEYS = ["practice", "omitted", "style", "key", "progression", "kind"];
  const SELECTS = [
    ["practice", "practice"],
    ["style", "style"],
    ["key", "key"],
    ["progression", "progression"],
    ["kind", "kind"],
    ["channel", "channel"],
    ["duration", "duration"],
    ["sort", "sort"],
  ];
  const MODE_NOTES = {
    channel: "Each group is a YouTube channel. Choose a channel name to fill the search.",
    style: "A track is listed under each of its styles. Choose a style to filter.",
    kind: "Drones, backing tracks, play-alongs, and loopers are separate kinds.",
    key: "Tracks with no key are left out of this view.",
    progression: "Tracks with no progression are left out of this view.",
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[\r\n]+/g, " ").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function trainerSiteHost() {
    try {
      return new URL(Catalog.YT_TRAINER_BASE).hostname.replace(/\.+$/, "").toLowerCase();
    } catch (error) {
      return "";
    }
  }

  function isTrainerHost(hostname) {
    const base = trainerSiteHost();
    const host = String(hostname || "").trim().toLowerCase().replace(/\.+$/, "");
    return Boolean(base) && Boolean(host) && (host === base || host.endsWith("." + base));
  }

  function pageHostname() {
    try {
      if (typeof window === "undefined" || !window.location) return "";
      return window.location.hostname || "";
    } catch (error) {
      return "";
    }
  }

  function linkHostname(href) {
    const raw = String(href == null ? "" : href).trim();
    if (!raw) return "";
    try {
      if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return new URL(raw).hostname;
      if (raw.startsWith("//")) return new URL("https:" + raw).hostname;
      if (typeof window !== "undefined" && window.location && window.location.href) {
        return new URL(raw, window.location.href).hostname;
      }
    } catch (error) {
      return "";
    }
    return "";
  }

  function newTabAttrs() {
    return ' target="_blank" rel="noopener noreferrer"';
  }

  // Links to the trainer site open in this tab when the page is already on that
  // site (apex or any subdomain). From every other host they open in a new tab.
  function trainerAnchorAttrs(href) {
    if (isTrainerHost(linkHostname(href)) && isTrainerHost(pageHostname())) return "";
    return newTabAttrs();
  }

  function siteLinkAttrs(href) {
    return isTrainerHost(linkHostname(href)) ? trainerAnchorAttrs(href) : "";
  }

  function pickValue(value, allowed, labels) {
    const choices = allowed || [];
    if (value == null) return "All";
    const text = String(value).trim();
    if (!text || Catalog.fold(text) === "all") return "All";
    if (choices.includes(text)) return text;
    const folded = Catalog.fold(text);
    const found = choices.find((item) => Catalog.fold(item) === folded || Catalog.fold(Catalog.labelOf(item, labels)) === folded);
    return found || "All";
  }

  function presets(options, index) {
    const source = Catalog.quickById(options && options.quick)
      ? Object.assign({}, options, Catalog.quickById(options.quick).filters)
      : (options || {});
    const idx = index || {};
    let channel = "All";
    if (source.channel) {
      const folded = Catalog.fold(source.channel);
      const match = (idx.channels || []).find((item) => item.channel_id === source.channel || Catalog.fold(item.channel) === folded);
      if (match) channel = match.channel_id;
    }
    const labels = (idx.facets && idx.facets.labels) || {};
    const practiceRaw = source.practice || source.instrument;
    const practiceToken = Catalog.practiceToken(practiceRaw);
    const practiceValue = Catalog.PRACTICE_INSTRUMENTS.includes(practiceToken) ? practiceToken : (practiceRaw || "All");
    return {
      channel,
      practice: pickValue(practiceValue, idx.practice, labels.practice_instruments),
      omitted: pickValue(source.omitted, Catalog.OMITTED, labels.omitted_instruments),
      style: pickValue(source.style, idx.styles, labels.styles),
      key: pickValue(source.key, idx.keys, labels.keys),
      progression: pickValue(source.progression, idx.progressions, labels.progressions),
      kind: pickValue(source.kind, idx.kinds, labels.kinds),
      duration: pickValue(source.duration, Catalog.DURATION_FILTERS.map((item) => item[0])),
      tempoMin: source.tempoMin == null ? "" : String(source.tempoMin),
      tempoMax: source.tempoMax == null ? "" : String(source.tempoMax),
    };
  }

  function clearedFilters(index, filters, query) {
    const next = Object.assign(Catalog.blankFilters(), filters || {}, { query: query || "" });
    const hits = index.tracks.filter((item) => Catalog.matches(item, { query: next.query }, index));
    if (!hits.length) return next;
    if (next.channel !== "All" && hits.some((item) => item.channel_id !== next.channel && Catalog.fold(item.channel) !== Catalog.fold(next.channel))) next.channel = "All";
    if (next.practice !== "All" && hits.some((item) => !Catalog.instrumentHits(item, next.practice))) next.practice = "All";
    if (next.omitted !== "All" && hits.some((item) => !Catalog.omittedOf(item).includes(next.omitted))) next.omitted = "All";
    if (next.style !== "All" && hits.some((item) => !Catalog.stylesOf(item).some((style) => Catalog.fold(style) === Catalog.fold(next.style)))) next.style = "All";
    if (next.key !== "All" && hits.some((item) => Catalog.fold(item.key || "") !== Catalog.fold(next.key))) next.key = "All";
    if (next.progression !== "All" && hits.some((item) => Catalog.normProgression(item.progression || "") !== Catalog.normProgression(next.progression))) next.progression = "All";
    if (next.kind !== "All" && hits.some((item) => Catalog.fold(item.kind) !== Catalog.fold(next.kind))) next.kind = "All";
    if (next.duration !== "All" && hits.some((item) => !Catalog.inDuration(item.duration_s, next.duration))) next.duration = "All";
    if ((next.tempoMin || next.tempoMax) && hits.some((item) => !Catalog.matches(item, { tempoMin: next.tempoMin, tempoMax: next.tempoMax }, index))) {
      next.tempoMin = "";
      next.tempoMax = "";
    }
    return next;
  }

  function shellHtml(options) {
    const home = (options && options.home) || "https://mkpworks.github.io/backing-track-finder/";
    const csv = (options && options.csv) || (home + "data/catalog.csv");
    const quick = Catalog.QUICK.map((item) =>
      '<button type="button" data-action="quick" data-quick="' + esc(item.id) + '" aria-pressed="false">' + esc(item.label) + "</button>"
    ).join("");
    const durations = Catalog.DURATION_FILTERS.map((item) =>
      '<option value="' + esc(item[0]) + '">' + esc(item[1]) + "</option>"
    ).join("");
    return (
      '<div class="finder">' +
        '<header class="site-header"><div class="wrap header-row"><div>' +
          '<p class="eyebrow">YouTube practice</p>' +
          "<h1>Backing Track Finder</h1>" +
          '<p class="lede" id="summary">Practice backing tracks, drones, play-alongs, and loopers on YouTube.</p>' +
          '<p id="sample-banner" class="banner" hidden>Sample catalog — about 15 public videos, with illustrative practice tags. The researched list replaces this data.</p>' +
          '<dl class="stats" id="stats"></dl>' +
        "</div>" +
        '<button type="button" class="btn" id="theme" data-action="theme">Light theme</button>' +
        "</div></header>" +
        '<div class="wrap">' +
          '<section class="panel" aria-labelledby="browse-heading">' +
            '<div class="panel-head">' +
              '<h2 id="browse-heading">Browse</h2>' +
              '<div class="modes" role="group" aria-label="Browse mode">' +
                '<button type="button" data-action="mode" data-mode="channel" aria-pressed="true">Browse by channel</button>' +
                '<button type="button" data-action="mode" data-mode="style" aria-pressed="false">Style</button>' +
                '<button type="button" data-action="mode" data-mode="kind" aria-pressed="false">Kind</button>' +
                '<button type="button" data-action="mode" data-mode="key" aria-pressed="false">Key</button>' +
                '<button type="button" data-action="mode" data-mode="progression" aria-pressed="false">Progression</button>' +
                '<button type="button" data-action="mode" data-mode="list" aria-pressed="false">All tracks</button>' +
              "</div>" +
            "</div>" +
            '<div class="quick" id="quick" role="group" aria-label="Quick filters">' + quick + "</div>" +
            '<div class="filters">' +
              '<label class="field field-search"><span>Search <kbd>/</kbd></span><input id="q" type="search" placeholder="Channel, style, key, progression, tag" autocomplete="off"></label>' +
              '<label class="field">Practice instrument <select id="practice"></select></label>' +
              '<label class="field">Style <select id="style"></select></label>' +
              '<label class="field">Key <select id="key"></select></label>' +
              '<label class="field">Tempo min <input id="tempo-min" type="number" inputmode="numeric" min="1" max="400" placeholder="Any"></label>' +
              '<label class="field">Tempo max <input id="tempo-max" type="number" inputmode="numeric" min="1" max="400" placeholder="Any"></label>' +
              '<label class="field">Progression <select id="progression"></select></label>' +
              '<label class="field">Kind <select id="kind"></select></label>' +
              '<label class="field">Channel <select id="channel"></select></label>' +
              '<label class="field">Duration <select id="duration"><option value="All">All</option>' + durations + "</select></label>" +
              '<label class="field">Sort by <select id="sort"><option value="channel">Channel A–Z</option><option value="year">Year (oldest first)</option><option value="time">Running time (longest)</option><option value="tempo">Tempo (fastest)</option></select></label>' +
              '<label class="field review-toggle"><input id="review" type="checkbox"> Include channels under review</label>' +
            "</div>" +
          "</section>" +
          '<div class="toolbar"><p class="status" id="status" aria-live="polite">Loading the catalog…</p>' +
            '<div class="toolbar-actions">' +
              '<button type="button" class="btn" data-action="prev">Previous</button>' +
              '<button type="button" class="btn" data-action="next">Next</button>' +
              '<button type="button" class="btn" data-action="expand" data-group-only>Expand all</button>' +
              '<button type="button" class="btn" data-action="collapse" data-group-only>Collapse all</button>' +
              '<button type="button" class="btn" data-action="clear">Clear filters</button>' +
              '<button type="button" class="btn" data-action="csv">Download this list</button>' +
            "</div>" +
          "</div>" +
          '<p id="facet-note" class="section-note" hidden></p>' +
          '<div id="results" tabindex="-1"></div>' +
          '<section class="discover" id="discover" aria-labelledby="discover-heading"><div class="discover-head"><h2 id="discover-heading">Discover</h2>' +
            '<button type="button" class="btn btn-primary" data-action="random">Random track</button></div>' +
            '<p class="section-note">Related tracks share a channel, style, progression, kind, or key.</p>' +
            '<div id="discover-body"></div></section>' +
          '<details class="fold"><summary>' +
            '<span class="chev" aria-hidden="true">▸</span>' +
            '<span class="cross-title" id="channel-heading">Channels</span>' +
            '<span class="cross-count" id="channel-count"></span>' +
            "</summary>" +
            '<p class="section-note">Choose a channel name to fill the search. The number is how many tracks are on that channel.</p>' +
            '<div id="channel-list" class="chips"></div></details>' +
          '<details class="fold"><summary>' +
            '<span class="chev" aria-hidden="true">▸</span>' +
            '<span class="cross-title" id="style-heading">Styles</span>' +
            '<span class="cross-count" id="style-count"></span>' +
            "</summary>" +
            '<p class="section-note">Choose a style to filter every view.</p>' +
            '<div id="style-list" class="chips"></div></details>' +
          '<footer class="site-footer">' +
            "<p>Watch links open YouTube uploads. Those videos are not hosted here, and the uploads can change or be removed.</p>" +
            '<p><a href="' + esc(csv) + '"' + siteLinkAttrs(csv) + ">Download full spreadsheet</a></p>" +
            '<p class="powered">Powered by <a href="' + esc(home) + '"' + siteLinkAttrs(home) + ">Backing Track Finder</a></p>" +
          "</footer>" +
        "</div>" +
      "</div>"
    );
  }

  function mount(root, options) {
    const opts = options || {};
    const byId = (id) => root.getElementById(id);
    const themeTarget = opts.themeTarget || (typeof document !== "undefined" ? document.documentElement : { getAttribute() { return "dark"; }, setAttribute() {} });
    const persistTheme = Boolean(opts.persistTheme);
    const state = Object.assign(Catalog.blankFilters(), {
      mode: "channel",
      sort: "channel",
      includeReview: Boolean(opts.includeReview),
      page: 0,
      open: {},
      pickId: "",
      seedMode: true,
      groupPage: {},
    });
    let index = null;
    let storedFacets = opts.facets || {};
    let defaults = presets({}, null);
    let channelStamp = "";
    let styleStamp = "";
    let pending = Boolean(opts.pending);
    const totalTracks = Number(opts.total) || 0;
    let discoverStamp = "";

    function styleColor(style) {
      const at = Math.max(0, index.styles.indexOf(style));
      return STYLE_COLORS[at % STYLE_COLORS.length];
    }

    function groupDomId(key) {
      return state.mode + ":" + key;
    }

    function currentRows() {
      return Catalog.sortTracks(
        index.tracks.filter((track) => Catalog.matches(track, state, index)),
        state.sort
      );
    }

    function currentGroups(rows) {
      if (state.mode === "list") return [];
      return Catalog.groupTracks(rows, state.mode, state.sort, { index });
    }

    function filtersAreClear() {
      return Catalog.sameQuick(state, {});
    }

    function fillSelect(id, values, labeler, titleFor) {
      const select = byId(id);
      if (!select) return;
      const choices = ['<option value="All">All</option>'];
      for (const value of values) {
        const label = labeler ? labeler(value) : value;
        const title = titleFor ? titleFor(value) : "";
        const titleAttr = title ? ' title="' + esc(title) + '"' : "";
        choices.push('<option value="' + esc(value) + '"' + titleAttr + ">" + esc(label) + "</option>");
      }
      select.innerHTML = choices.join("");
    }

    function facetLabel(value, key) {
      const group = {
        practice: "practice_instruments",
        omitted: "omitted_instruments",
        style: "styles",
        kind: "kinds",
        key: "keys",
        progression: "progressions",
      }[key] || key;
      const labels = index.facets && index.facets.labels && index.facets.labels[group];
      return Catalog.labelOf(value, labels);
    }

    function searchButton(name, className, label) {
      const on = Catalog.fold(state.query) === Catalog.fold(name) ? " is-on" : "";
      const text = label || name;
      return '<button type="button" class="' + className + on + '" data-action="search" data-query="' + esc(name) + '" aria-label="Search for ' + esc(name) + '">' + esc(text) + "</button>";
    }

    function pivotButton(key, value, className, label) {
      const on = state[key] === value ? " is-on" : "";
      const text = label || facetLabel(value, key);
      return '<button type="button" class="' + className + on + '" data-action="pivot" data-key="' + esc(key) + '" data-value="' + esc(value) + '" aria-label="Filter by ' + esc(text) + '">' + esc(text) + "</button>";
    }

    function trackArticle(track, articleOptions) {
      const grouped = Boolean(articleOptions && articleOptions.grouped);
      const feature = Boolean(articleOptions && articleOptions.feature);
      const showRelated = Boolean(articleOptions && articleOptions.related);
      const shared = articleOptions && articleOptions.shared;
      const titleTag = feature || !grouped ? "h3" : "h4";
      const yearHtml = track.year ? "<span>" + esc(track.year) + "</span>" : "";
      const styles = Catalog.stylesOf(track);
      const styleHtml = styles.length
        ? '<button type="button" class="style-mark" data-action="pivot" data-key="style" data-value="' + esc(styles[0]) + '"><i style="background:' + styleColor(styles[0]) + '"></i>' + esc(facetLabel(styles[0], "style")) + "</button>"
        : "";
      const chips = [];
      for (const style of styles.slice(1)) chips.push(pivotButton("style", style, "chip-btn"));
      for (const name of Catalog.omittedOf(track)) chips.push(pivotButton("omitted", name, "chip-btn"));
      for (const name of Catalog.targetsOf(track)) chips.push(pivotButton("practice", name, "chip-btn", "For " + facetLabel(name, "practice")));
      if (track.progression) chips.push(pivotButton("progression", track.progression, "chip-btn"));
      if (track.scale) chips.push('<span class="chip">' + searchButton(track.scale, "chip-btn", track.scale) + "</span>");
      for (const tag of Catalog.tagsOf(track)) chips.push('<span class="chip">' + searchButton(tag, "chip-btn") + "</span>");
      const wrapped = chips.map((chip) => chip.startsWith("<span") ? chip : '<span class="chip">' + chip + "</span>").join("");
      const watchUrl = Catalog.safeHttpUrl(Catalog.youtubeUrl(track), "https://www.youtube.com/watch?v=" + encodeURIComponent(track.id || ""));
      const trainer = Catalog.trainerUrl(track.id);
      const links =
        '<div class="video-links">' +
          '<a class="watch" href="' + esc(watchUrl) + '" target="_blank" rel="noopener noreferrer" aria-label="View ' + esc(track.title) + ' on YouTube">View on YouTube</a>' +
          '<a class="trainer" href="' + esc(trainer) + '"' + trainerAnchorAttrs(trainer) + ' aria-label="Open ' + esc(track.title) + ' on YT Trainer">Open on YT Trainer</a>' +
        "</div>";
      const relatedHtml = showRelated
        ? '<button type="button" class="text-btn" data-action="similar" data-id="' + esc(track.id) + '">Related</button>'
        : "";
      const sharedHtml = shared ? '<p class="shared">' + esc(shared) + "</p>" : "";
      const tempoHtml = track.tempo_bpm != null ? "<span>" + esc(track.tempo_bpm) + " BPM</span>" : "";
      const keyHtml = track.key
        ? pivotButton("key", track.key, "name-link")
        : "";
      return (
        '<article class="track' + (feature ? " is-feature" : "") + '">' +
          '<div class="thumb-wrap"><button type="button" class="play" data-action="play" data-id="' + esc(track.id) + '" aria-label="Play ' + esc(track.title) + '">' +
            '<img class="thumb" alt="" width="320" height="180" loading="lazy" decoding="async" src="https://i.ytimg.com/vi/' + encodeURIComponent(track.id || "") + '/mqdefault.jpg">' +
            '<span class="play-mark" aria-hidden="true">Play</span>' +
          "</button></div>" +
          '<div class="track-body">' +
            '<div class="track-top">' +
              "<" + titleTag + ' class="track-title">' + esc(track.title) + "</" + titleTag + ">" +
              links +
            "</div>" +
            '<p class="meta">' +
              searchButton(track.channel, "name-link") +
              yearHtml +
              (track.kind ? '<span class="type-badge">' + pivotButton("kind", track.kind, "name-link") + "</span>" : "") +
              keyHtml +
              tempoHtml +
              styleHtml +
              '<span class="time">' + esc(Catalog.formatDuration(track.duration_s)) + "</span>" +
            "</p>" +
            (wrapped ? '<div class="chips">' + wrapped + "</div>" : "") +
            sharedHtml +
            relatedHtml +
          "</div>" +
        "</article>"
      );
    }

    function groupBlock(group) {
      const id = groupDomId(group.key);
      const open = Boolean(state.open[id]);
      const named = state.mode === "channel";
      const titleHtml = named
        ? searchButton(group.label, "group-title")
        : pivotButton(state.mode, group.key, "group-title", group.label);
      const meta = group.count + " track" + (group.count === 1 ? "" : "s") + " · " + Catalog.formatDuration(group.seconds) + " total";
      const windowed = open ? groupWindow(group, id) : null;
      const body = open
        ? '<div class="group-body">' + windowed.items.map((track) => trackArticle(track, { grouped: true, related: true })).join("") + groupPager(id, windowed, group.count) + "</div>"
        : "";
      return (
        '<section class="group' + (open ? " is-open" : "") + '">' +
          '<h3 class="group-head">' +
            '<span class="group-main">' +
              '<button type="button" class="chev-btn" data-action="group" data-group="' + esc(id) + '" aria-expanded="' + (open ? "true" : "false") + '" aria-label="' + (open ? "Collapse " : "Expand ") + esc(group.label) + '">' +
                '<span class="chev" aria-hidden="true">▸</span>' +
              "</button>" +
              titleHtml +
            "</span>" +
            '<button type="button" class="group-meta" data-action="group" data-group="' + esc(id) + '">' + esc(meta) + "</button>" +
          "</h3>" +
          body +
        "</section>"
      );
    }

    function appearsHtml(rows) {
      const found = Catalog.appearances(state.query, rows);
      if (!found.length) return "";
      return '<div class="appears">' + found.slice(0, 3).map((item) => {
        const noun = item.count === 1 ? "track" : "tracks";
        return "<p>" + searchButton(item.name, "name-link") + " matches " + item.count + " " + noun + " in this list.</p>";
      }).join("") + "</div>";
    }

    function emptyState(message) {
      return '<div class="empty"><p>' + esc(message) + '</p><button type="button" class="btn" data-action="clear">Clear filters</button></div>';
    }

    function groupWindow(group, id) {
      const pages = Catalog.pageCount(group.items.length);
      let page = state.groupPage[id] || 0;
      if (page > pages - 1) page = pages - 1;
      if (page < 0) page = 0;
      state.groupPage[id] = page;
      const start = page * Catalog.PER_PAGE;
      return { page, pages, start, items: group.items.slice(start, start + Catalog.PER_PAGE) };
    }

    function groupPager(id, windowed, total) {
      if (!windowed || windowed.pages < 2) return "";
      const prev = windowed.page === 0 ? " disabled" : "";
      const next = windowed.page >= windowed.pages - 1 ? " disabled" : "";
      const from = windowed.start + 1;
      const to = windowed.start + windowed.items.length;
      return '<nav class="pager" aria-label="Tracks in this group"><button type="button" class="btn" data-action="group-prev" data-group="' + esc(id) + '"' + prev + ">Previous</button><span class=\"status\">" + from + "–" + to + " of " + total + "</span><button type=\"button\" class=\"btn\" data-action=\"group-next\" data-group=\"" + esc(id) + "\"" + next + ">Next</button></nav>";
    }

    function pager(pages) {
      if (pages < 2) return "";
      const prev = state.page === 0 ? " disabled" : "";
      const next = state.page >= pages - 1 ? " disabled" : "";
      return '<nav class="pager" aria-label="Pagination"><button type="button" class="btn" data-action="prev"' + prev + ">Previous</button><button type=\"button\" class=\"btn\" data-action=\"next\"" + next + ">Next</button></nav>";
    }

    function renderLists() {
      const channelKey = state.query + "\0" + state.channel;
      if (channelKey !== channelStamp) {
        channelStamp = channelKey;
        const host = byId("channel-list");
        if (host) {
          const channels = listedChannels();
          host.innerHTML = channels.length
            ? channels.map((channel) => '<span class="chip">' + searchButton(channel.channel, "chip-btn") + '<span class="chip-count">' + (index.channelCount[channel.channel_id] || 0) + "</span></span>").join("")
            : "";
        }
      }
      const styleKey = state.style;
      if (styleKey !== styleStamp) {
        styleStamp = styleKey;
        const host = byId("style-list");
        if (host) {
          host.innerHTML = index.styles.map((style) => '<span class="chip">' + pivotButton("style", style, "chip-btn") + '<span class="chip-count">' + (index.styleCount[style] || 0) + "</span></span>").join("");
        }
      }
    }

    function render(scroll) {
      if (!index) return;
      const active = root.activeElement;
      const focusGroup = active && active.getAttribute && active.getAttribute("data-group");
      const rows = currentRows();
      const groups = currentGroups(rows);
      if (state.seedMode && state.mode !== "list" && groups.length) {
        const anyOpen = groups.some((group) => state.open[groupDomId(group.key)]);
        if (!anyOpen) state.open[groupDomId(groups[0].key)] = true;
        state.seedMode = false;
      }
      const totalUnits = state.mode === "list" ? rows.length : groups.length;
      const pages = Catalog.pageCount(totalUnits);
      if (state.page > pages - 1) state.page = pages - 1;
      if (state.page < 0) state.page = 0;
      const start = state.page * Catalog.PER_PAGE;
      const pageRows = rows.slice(start, start + Catalog.PER_PAGE);
      const pageGroups = groups.slice(start, start + Catalog.PER_PAGE);
      const units = {
        channel: ["channel", "channels"],
        style: ["style", "styles"],
        kind: ["kind", "kinds"],
        key: ["key", "keys"],
        progression: ["progression", "progressions"],
      };
      const counted = rows.length === 1 ? "1 track" : rows.length + " tracks";
      const visibleTotal = shownTotal();
      const trackLabel = rows.length === visibleTotal ? counted : counted + " of " + visibleTotal;
      const pair = units[state.mode] || ["group", "groups"];
      const groupLabel = state.mode === "list" ? "" : " · " + groups.length + " " + (groups.length === 1 ? pair[0] : pair[1]);
      const status = byId("status");
      if (status) {
        const progress = pending ? "Loading tracks… " + index.tracks.length.toLocaleString() + " of " + (totalTracks || index.tracks.length).toLocaleString() + " · " : "";
        status.textContent = pending && !index.tracks.length
          ? "Loading tracks…"
          : progress + "Page " + (state.page + 1) + " of " + pages + " · " + trackLabel + groupLabel;
      }

      let results = "";
      if (pending && !index.tracks.length) {
        results = '<p class="section-note">Loading tracks…</p>';
      } else if (!index.tracks.length && filtersAreClear()) {
        results = emptyState("No tracks in the catalog yet.");
      } else if (state.mode === "list") {
        results = rows.length
          ? pageRows.map((track) => trackArticle(track, { related: true })).join("") + pager(pages)
          : emptyState("Nothing matches these filters.");
      } else if (!groups.length) {
        results = emptyState("Nothing matches these filters.");
      } else {
        results = pageGroups.map(groupBlock).join("") + pager(pages);
      }
      const resultsHost = byId("results");
      if (resultsHost) resultsHost.innerHTML = appearsHtml(rows) + results;
      renderLists();

      const discoverBody = byId("discover-body");
      if (discoverBody && state.pickId !== discoverStamp) {
        discoverStamp = state.pickId;
        const pick = index.tracks.find((track) => track.id === state.pickId);
        if (!pick) {
          discoverBody.innerHTML = '<p class="section-note">' + (pending ? "Loading tracks…" : "No tracks in the catalog yet.") + "</p>";
        } else {
          const similar = Catalog.related(pick, index.tracks, 5);
          const relatedHtml = similar.length
            ? '<h3 class="subhead">Related</h3>' + similar.map((item) => trackArticle(item.track, { shared: Catalog.relatedReason(item, pick) })).join("")
            : '<p class="section-note">No related tracks yet.</p>';
          discoverBody.innerHTML = trackArticle(pick, { feature: true }) + relatedHtml;
        }
      }

      syncControls(pages);
      if (focusGroup && root.querySelectorAll) {
        const again = [...root.querySelectorAll("[data-group]")].find((node) => node.getAttribute("data-group") === focusGroup);
        if (again && again.focus) again.focus();
      }
      if (scroll && resultsHost && resultsHost.scrollIntoView) {
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        resultsHost.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }
    }

    function formatLong(seconds) {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      if (hours >= 48) {
        const days = Math.floor(hours / 24);
        return days + "d " + (hours % 24) + "h";
      }
      if (hours >= 24) return hours + "h " + String(minutes).padStart(2, "0") + "m";
      return Catalog.formatDuration(seconds);
    }

    function stat(label, value) {
      return "<div><dt>" + esc(label) + "</dt><dd>" + esc(value) + "</dd></div>";
    }

    function listedChannels() {
      return index.channels.filter((channel) => state.includeReview || !channel.review);
    }

    function shownTotal() {
      if (state.includeReview || !index.reviewIds || !index.reviewIds.size) return index.tracks.length;
      let count = 0;
      for (const track of index.tracks) if (!index.reviewIds.has(track.channel_id)) count += 1;
      return count;
    }

    function hiddenTrackCount() {
      return index.tracks.length - shownTotal();
    }

    function refillSelects() {
      const channelSelect = byId("channel");
      if (channelSelect) {
        channelSelect.innerHTML = '<option value="All">All</option>' + listedChannels().map((channel) => {
          const count = index.channelCount[channel.channel_id] || 0;
          return '<option value="' + esc(channel.channel_id) + '">' + esc(channel.channel) + " · " + count + "</option>";
        }).join("");
      }
      fillSelect("practice", index.practice, (value) => facetLabel(value, "practice"), (value) => Catalog.facetNote(index, "practice_instruments", value));
      fillSelect("style", index.styles, (value) => facetLabel(value, "style"));
      fillSelect("key", index.keys, (value) => facetLabel(value, "key"));
      const progressions = index.progressions.slice();
      if (state.progression !== "All" && progressions.indexOf(state.progression) === -1) progressions.push(state.progression);
      fillSelect("progression", progressions, (value) => facetLabel(value, "progression"));
      fillSelect("kind", index.kinds, (value) => facetLabel(value, "kind"), (value) => Catalog.facetNote(index, "kinds", value));
      fillSelect("duration", Catalog.DURATION_FILTERS.map((item) => item[0]), (value) => {
        const found = Catalog.DURATION_FILTERS.find((item) => item[0] === value);
        return found ? found[1] : value;
      });
    }

    function syncControls(pages) {
      const query = byId("q");
      if (query && query.value !== state.query) query.value = state.query;
      for (const [id, key] of SELECTS) {
        const el = byId(id);
        if (el && el.value !== state[key]) el.value = state[key];
      }
      const activeEl = typeof document !== "undefined" ? document.activeElement : null;
      for (const [id, key] of [["tempo-min", "tempoMin"], ["tempo-max", "tempoMax"]]) {
        const el = byId(id);
        if (el && el !== activeEl && el.value !== state[key]) el.value = state[key];
      }
      if (root.querySelectorAll) {
        root.querySelectorAll("[data-mode]").forEach((button) => {
          button.setAttribute("aria-pressed", button.getAttribute("data-mode") === state.mode ? "true" : "false");
        });
        root.querySelectorAll("[data-group-only]").forEach((button) => {
          button.hidden = state.mode === "list";
        });
        root.querySelectorAll("[data-quick]").forEach((button) => {
          const spec = Catalog.quickById(button.getAttribute("data-quick"));
          button.setAttribute("aria-pressed", spec && Catalog.sameQuick(state, spec.filters) ? "true" : "false");
        });
        root.querySelectorAll('[data-action="prev"]').forEach((button) => {
          button.disabled = state.page === 0;
        });
        root.querySelectorAll('[data-action="next"]').forEach((button) => {
          button.disabled = state.page >= pages - 1;
        });
      }
      const note = byId("facet-note");
      if (note) {
        const bits = [];
        if (MODE_NOTES[state.mode]) bits.push(MODE_NOTES[state.mode]);
        const practiceNote = Catalog.facetNote(index, "practice_instruments", state.practice);
        const kindNote = Catalog.facetNote(index, "kinds", state.kind);
        if (practiceNote) bits.push(practiceNote);
        if (kindNote) bits.push(kindNote);
        if (state.tempoMin || state.tempoMax) bits.push("Tracks without a listed tempo drop out of a tempo range.");
        const hiddenTracks = hiddenTrackCount();
        const hiddenChannels = index.reviewIds ? index.reviewIds.size : 0;
        if (hiddenTracks && !state.includeReview) {
          bits.push(hiddenTracks.toLocaleString() + " tracks on " + hiddenChannels + " channels are hidden until you include channels under review.");
        }
        note.hidden = bits.length === 0;
        note.textContent = bits.join(" ");
      }
      const review = byId("review");
      if (review) review.checked = state.includeReview;
      const theme = themeTarget.getAttribute("data-theme") === "light" ? "light" : "dark";
      const themeButton = byId("theme");
      if (themeButton) {
        themeButton.textContent = theme === "light" ? "Dark theme" : "Light theme";
        themeButton.setAttribute("aria-label", theme === "light" ? "Switch to dark theme" : "Switch to light theme");
      }
    }

    function toggleTheme() {
      const next = themeTarget.getAttribute("data-theme") === "light" ? "dark" : "light";
      themeTarget.setAttribute("data-theme", next);
      if (persistTheme) {
        try { localStorage.setItem("btf-theme", next); } catch (error) {}
        if (typeof document !== "undefined") {
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute("content", next === "light" ? "#f4f0e7" : "#12100d");
        }
      }
      render(false);
    }

    function applyCleared(next) {
      for (const key of Catalog.FILTER_KEYS) state[key] = next[key];
      state.tempoMin = next.tempoMin || "";
      state.tempoMax = next.tempoMax || "";
    }

    function runSearch(query, scroll) {
      state.query = query;
      state.page = 0;
      state.seedMode = true;
      applyCleared(clearedFilters(index, state, query));
      render(Boolean(scroll));
    }

    function clearFilters() {
      for (const key of Catalog.FILTER_KEYS) state[key] = defaults[key] || "All";
      state.tempoMin = defaults.tempoMin || "";
      state.tempoMax = defaults.tempoMax || "";
      state.query = "";
      state.page = 0;
      state.seedMode = true;
    }

    function pivot(key, value) {
      if (!PIVOT_KEYS.includes(key) || !value) return;
      const keep = value;
      clearFilters();
      state[key] = keep;
    }

    function applyQuick(id) {
      const spec = Catalog.quickById(id);
      if (!spec) return;
      if (Catalog.sameQuick(state, spec.filters)) {
        clearFilters();
        return;
      }
      clearFilters();
      for (const key of Object.keys(spec.filters)) state[key] = spec.filters[key];
      state.page = 0;
      state.seedMode = true;
    }

    function downloadCsv(filename, text) {
      const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function scrollToDiscover() {
      const discover = byId("discover");
      if (!discover || !discover.scrollIntoView) return;
      const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      discover.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }

    function onClick(event) {
      const el = event.target.closest("[data-action]");
      if (!el || el.disabled) return;
      const action = el.getAttribute("data-action");
      if (action === "mode") {
        state.mode = el.getAttribute("data-mode");
        state.page = 0;
        state.seedMode = true;
        render(false);
      } else if (action === "group") {
        const id = el.getAttribute("data-group");
        state.open[id] = !state.open[id];
        render(false);
      } else if (action === "group-prev" || action === "group-next") {
        const id = el.getAttribute("data-group");
        const current = state.groupPage[id] || 0;
        state.groupPage[id] = action === "group-prev" ? current - 1 : current + 1;
        render(false);
      } else if (action === "prev") {
        state.page -= 1;
        render(true);
      } else if (action === "next") {
        state.page += 1;
        render(true);
      } else if (action === "expand") {
        for (const group of currentGroups(currentRows())) state.open[groupDomId(group.key)] = true;
        render(false);
      } else if (action === "collapse") {
        state.open = {};
        state.seedMode = false;
        render(false);
      } else if (action === "search") {
        runSearch(el.getAttribute("data-query") || "", true);
      } else if (action === "clear") {
        clearFilters();
        render(false);
      } else if (action === "csv") {
        if (!index) return;
        downloadCsv("backing-track-finder.csv", Catalog.toCsv(currentRows()));
      } else if (action === "play") {
        const wrap = el.closest(".thumb-wrap");
        const id = el.getAttribute("data-id") || "";
        if (!wrap || !id) return;
        wrap.innerHTML = '<iframe class="player" title="YouTube video player" width="320" height="180" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1"></iframe>';
      } else if (action === "pivot") {
        pivot(el.getAttribute("data-key"), el.getAttribute("data-value"));
        render(false);
      } else if (action === "quick") {
        applyQuick(el.getAttribute("data-quick"));
        render(false);
      } else if (action === "similar") {
        state.pickId = el.getAttribute("data-id");
        render(false);
        scrollToDiscover();
      } else if (action === "random") {
        const list = index.tracks.filter((track) => Catalog.matches(track, { includeReview: state.includeReview }, index));
        if (!list.length) return;
        let next = list[Math.floor(Math.random() * list.length)];
        let guard = 0;
        while (list.length > 1 && next.id === state.pickId && guard < 8) {
          next = list[Math.floor(Math.random() * list.length)];
          guard += 1;
        }
        state.pickId = next.id;
        render(false);
        scrollToDiscover();
      } else if (action === "theme") {
        toggleTheme();
      }
    }

    function bind() {
      root.addEventListener("click", onClick);
      root.addEventListener("error", (event) => {
        const img = event.target;
        if (img && img.classList && img.classList.contains("thumb")) img.classList.add("is-broken");
      }, true);
      const query = byId("q");
      if (query) {
        query.addEventListener("input", (event) => {
          state.query = event.target.value;
          state.page = 0;
          render(false);
        });
      }
      for (const [id, key] of SELECTS) {
        const el = byId(id);
        if (!el) continue;
        el.addEventListener("change", (event) => {
          state[key] = event.target.value;
          state.page = 0;
          state.seedMode = true;
          render(false);
        });
      }
      for (const [id, key] of [["tempo-min", "tempoMin"], ["tempo-max", "tempoMax"]]) {
        const el = byId(id);
        if (!el) continue;
        el.addEventListener("input", (event) => {
          state[key] = event.target.value;
          state.page = 0;
          render(false);
        });
      }
      const review = byId("review");
      if (review) {
        review.addEventListener("change", () => {
          state.includeReview = Boolean(review.checked);
          if (!state.includeReview) {
            const current = index.channelById[state.channel];
            if (current && current.review) state.channel = "All";
          }
          state.page = 0;
          state.seedMode = true;
          channelStamp = "";
          refillSelects();
          paintSummary();
          render(false);
        });
      }
      root.addEventListener("keydown", (event) => {
        if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
        const tag = event.target && event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        event.preventDefault();
        if (query) query.focus();
      });
    }

    function paintSummary() {
      let count = 0;
      let seconds = 0;
      const channelIds = new Set();
      for (const track of index.tracks) {
        if (!state.includeReview && index.reviewIds && index.reviewIds.has(track.channel_id)) continue;
        count += 1;
        seconds += track.duration_s || 0;
        if (track.channel_id) channelIds.add(track.channel_id);
      }
      const tracks = { length: count };
      const stats = byId("stats");
      if (stats) {
        stats.innerHTML =
          stat("Tracks", String(count)) +
          stat("Channels", String(channelIds.size || listedChannels().length)) +
          stat("Listening time", formatLong(seconds)) +
          stat("Styles", String(index.styles.length)) +
          stat("Kinds", String(index.kinds.length));
      }
      const summary = byId("summary");
      if (summary && !summary.dataset) summary.dataset = {};
      if (summary) {
        summary.textContent = tracks.length
          ? tracks.length + " practice backing tracks on YouTube. Filter by the instrument you want to play, style, key, tempo, progression, kind, channel, and duration."
          : (pending ? "Loading the catalog…" : "No tracks in the catalog yet.");
      }
      const channelCount = byId("channel-count");
      if (channelCount) {
        const count = listedChannels().length;
        channelCount.textContent = count + " channel" + (count === 1 ? "" : "s");
      }
      const styleCount = byId("style-count");
      if (styleCount) {
        const count = index.styles.length;
        styleCount.textContent = count + " style" + (count === 1 ? "" : "s");
      }
      const banner = byId("sample-banner");
      if (banner) banner.hidden = opts.sample !== true;
    }

    let paintTimer = null;
    function flushPaint() {
      if (paintTimer) {
        clearTimeout(paintTimer);
        paintTimer = null;
      }
      refillSelects();
      paintSummary();
      render(false);
    }
    function schedulePaint() {
      if (paintTimer) return;
      paintTimer = setTimeout(flushPaint, 200);
    }

    const tracks = Array.isArray(opts.tracks) ? opts.tracks : null;
    if (!tracks) throw new Error("tracks");
    index = Catalog.buildIndex(tracks, storedFacets, {
      channels: opts.channels,
      reviewChannelIds: opts.reviewChannelIds,
    });
    defaults = presets(opts, index);
    for (const key of Catalog.FILTER_KEYS) state[key] = defaults[key] || "All";
    state.tempoMin = defaults.tempoMin || "";
    state.tempoMax = defaults.tempoMax || "";
    state.pickId = tracks[0] ? tracks[0].id : "";
    bind();
    refillSelects();
    paintSummary();
    render(false);

    return {
      root,
      addTracks(more) {
        const incoming = Array.isArray(more) ? more : [];
        const before = index.tracks.length;
        Catalog.extendIndex(index, incoming);
        if (index.tracks.length === before) return;
        if (!state.pickId && index.tracks[0]) state.pickId = index.tracks[0].id;
        channelStamp = "";
        styleStamp = "";
        schedulePaint();
      },
      setPending(value) {
        pending = Boolean(value);
        if (!pending) discoverStamp = "";
        flushPaint();
      },
    };
  }

  return { mount, shellHtml, presets, clearedFilters };
});
