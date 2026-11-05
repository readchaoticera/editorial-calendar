/* ============================================================
   Chaotic Era — Editorial Calendar
   Static page: reads data/ideas.json. The owner can add/edit ideas
   from the page by saving an Anthropic key (AI cleanup) and a
   GitHub token (commits to data/ideas.json) in their own browser.
   ============================================================ */
(function () {
  "use strict";

  // ---------- Config ----------
  const DEFAULT_REPO = "readchaoticera/editorial-calendar";
  const DATA_PATH = "data/ideas.json";
  const CLAUDE_MODEL = "claude-opus-5-5";
  const SETTINGS_KEY = "ce-editorial-settings";
  const LOCAL_KEY = "ce-editorial-local-ideas";
  const STATUS_ORDER = { upcoming: 0, drafting: 1, idea: 2, published: 3 };
  const STATUS_LABEL = { upcoming: "Upcoming", drafting: "Drafting", idea: "Idea", published: "Published" };

  // ---------- Storage helpers (never throw) ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
    },
    del(key) { try { localStorage.removeItem(key); } catch (e) {} },
  };

  // ---------- State ----------
  let settings = Object.assign({ anthropicKey: "", githubToken: "", repo: DEFAULT_REPO }, store.get(SETTINGS_KEY, {}));
  let published = [];             // ideas from the repo
  let local = store.get(LOCAL_KEY, []); // ideas saved only in this browser
  let view = { status: "all", category: "all", q: "", sortKey: null, sortDir: 1 };
  let editing = null;             // { mode: "new" | "edit", item }
  let flashId = null;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const rowsEl = $("rows");

  // ---------- Utils ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const URL_RE = /https?:\/\/[^\s<>"')\]]+/g;
  const linkify = (s) => esc(s).replace(/https?:\/\/[^\s<>"]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${shortUrl(u)}</a>`);
  function shortUrl(u) {
    try {
      const url = new URL(u.replace(/&amp;/g, "&"));
      const host = url.hostname.replace(/^www\./, "");
      const path = url.pathname.length > 28 ? url.pathname.slice(0, 26) + "…" : url.pathname;
      return esc(host + (path === "/" ? "" : path));
    } catch (e) { return u; }
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "idea";
  const newId = (title) => slug(title) + "-" + Date.now().toString(36);
  const lines = (s) => String(s || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);
  const all = () => local.concat(published);
  const hasGitHub = () => !!(settings.githubToken && settings.repo);
  const hasClaude = () => !!settings.anthropicKey;

  function normalize(item) {
    return {
      id: item.id || newId(item.title || "idea"),
      status: STATUS_ORDER[item.status] != null ? item.status : "idea",
      date: item.date || "",
      series: item.series || "",
      title: (item.title || "").trim(),
      angle: (item.angle || "").trim(),
      notes: Array.isArray(item.notes) ? item.notes.filter(Boolean) : [],
      category: (item.category || "General Politics").trim(),
      links: Array.isArray(item.links) ? item.links.filter(Boolean) : [],
      draftLink: item.draftLink || "",
      dataViz: !!item.dataViz,
    };
  }

  // Category colours: stable hash → palette
  const PALETTE = [
    ["#e7f0ff", "#2563eb", "#c7dbff"], ["#efeaff", "#6c4bd1", "#d9ceff"], ["#fdeede", "#c2621a", "#f6d6ab"],
    ["#e8f6ee", "#15803d", "#bfe5cd"], ["#fdeaea", "#c42525", "#f6cccc"], ["#e6f7f8", "#0e7c86", "#b8e6ea"],
    ["#fff6db", "#946200", "#f0dc9c"], ["#fbe9f5", "#b0287e", "#f2c6e2"], ["#eef1f5", "#3f4a58", "#d8dfe8"],
    ["#eaf0e2", "#4d6b1f", "#cfdcb9"], ["#e9ecff", "#3a47c9", "#cbd1fb"], ["#f6ece4", "#8a4b1c", "#e7cdb6"],
  ];
  function catStyle(name) {
    let h = 0;
    for (const ch of String(name).toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const [bg, fg, bd] = PALETTE[h % PALETTE.length];
    return `background:${bg};color:${fg};border-color:${bd}`;
  }
  function categories() {
    const counts = new Map();
    for (const it of all()) counts.set(it.category, (counts.get(it.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }

  // ---------- UTF-8 base64 (GitHub contents API) ----------
  function b64decode(b64) {
    const bin = atob(String(b64).replace(/\s/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // ---------- Data loading ----------
  async function loadPublished() {
    if (hasGitHub()) {
      try {
        const file = await ghGetFile();
        return file.data.ideas.map(normalize);
      } catch (e) {
        showBanner("Couldn't read from GitHub with your token (" + e.message + "). Showing the public copy.");
      }
    }
    const res = await fetch(DATA_PATH + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    return (json.ideas || []).map(normalize);
  }

  // ---------- GitHub ----------
  function ghHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + settings.githubToken,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }
  async function ghGetFile() {
    const res = await fetch(`https://api.github.com/repos/${settings.repo}/contents/${DATA_PATH}?t=${Date.now()}`, {
      headers: ghHeaders(), cache: "no-store",
    });
    if (!res.ok) throw new Error(await ghError(res));
    const meta = await res.json();
    return { sha: meta.sha, data: JSON.parse(b64decode(meta.content)) };
  }
  async function ghError(res) {
    let msg = "GitHub " + res.status;
    try { const j = await res.json(); if (j.message) msg += ": " + j.message; } catch (e) {}
    return msg;
  }
  /** Fetch the latest file, apply `mutate(ideas)` to it, and commit. Retries once on conflict. */
  async function ghCommit(mutate, message, attempt = 0) {
    const { sha, data } = await ghGetFile();
    data.ideas = mutate((data.ideas || []).slice());
    data.updated = new Date().toISOString().slice(0, 10);
    const res = await fetch(`https://api.github.com/repos/${settings.repo}/contents/${DATA_PATH}`, {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ message, sha, content: b64encode(JSON.stringify(data, null, 2) + "\n") }),
    });
    if ((res.status === 409 || res.status === 422) && attempt === 0) return ghCommit(mutate, message, 1);
    if (!res.ok) throw new Error(await ghError(res));
    published = data.ideas.map(normalize);
  }

  // ---------- Claude cleanup ----------
  const CLEAN_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["title", "angle", "notes", "category", "links"],
    properties: {
      title: { type: "string", description: "Short working headline for the issue, in the author's voice." },
      angle: { type: "string", description: "The overarching question or angle the issue answers, ideally phrased as one question." },
      notes: { type: "array", items: { type: "string" }, description: "Cleaned-up bullet notes: reporting leads, people to interview, data to pull, arguments." },
      category: { type: "string", description: "One topic category." },
      links: { type: "array", items: { type: "string" }, description: "Every URL from the blurb, unchanged." },
    },
  };

  async function cleanWithClaude(blurb) {
    const cats = categories().map(([c]) => c);
    const system =
      "You are the editorial assistant for Chaotic Era, a newsletter by Kyle Tharp about politics, media, creators and online influence. " +
      "Kyle pastes a messy blurb of thoughts for a possible issue. Turn it into a clean pitch:\n" +
      "- title: a punchy working headline in Kyle's voice (keep his phrasing when it's good).\n" +
      "- angle: the one overarching question or argument the issue answers.\n" +
      "- notes: short bullets with every substantive thought, name, source, number or to-do from the blurb. Fix spelling, capitalization and shorthand (dems → Democrats, ppl → people). Don't add facts, claims or names that aren't in the blurb, and don't repeat the title.\n" +
      "- links: every URL in the blurb, exactly as written.\n" +
      "- category: reuse one of the existing categories when it fits: " + (cats.join(", ") || "General Politics") +
      ". If none fits well, create a new short Title Case category (1-3 words, e.g. \"YouTube\", \"Podcasts\", \"Prediction Markets\").";

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": settings.anthropicKey,
        "anthropic-version": "2026-10-21",
        "anthropic-beta": "server-side-fallback-2026-07-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: CLEAN_SCHEMA } },
        system,
        messages: [{ role: "user", content: blurb }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (body.error && body.error.message) || "HTTP " + res.status;
      throw new Error("Claude API: " + msg);
    }
    if (body.stop_reason === "refusal") throw new Error("Claude declined to process this blurb.");
    const text = (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const out = JSON.parse(text);
    // Make sure no URL from the blurb gets lost.
    const urls = blurb.match(URL_RE) || [];
    for (const u of urls) if (!out.links.includes(u)) out.links.push(u);
    return out;
  }

  // ---------- Built-in fallback cleaner (no API key) ----------
  const SHORTHAND = [
    [/\bdems\b/gi, "Democrats"], [/\brepubs?\b/gi, "Republicans"], [/\bgop\b/gi, "GOP"], [/\bppl\b/gi, "people"],
    [/\bw\/o\b/gi, "without"], [/\bw\/\s*/gi, "with "], [/\bbc\b/gi, "because"], [/\babt\b/gi, "about"],
    [/\bgovt\b/gi, "government"], [/\bai\b/g, "AI"], [/\btho\b/gi, "though"], [/\bthru\b/gi, "through"],
    [/\bi\b/g, "I"], [/\btiktok\b/gi, "TikTok"], [/\byoutube\b/gi, "YouTube"], [/\bsubstack\b/gi, "Substack"],
  ];
  const KEYWORDS = [
    ["AI", /\b(ai|a\.i\.|chatgpt|claude|openai|anthropic|llms?|chatbots?|artificial intelligence)\b/i],
    ["YouTube", /\b(youtube|youtubers?|asmongold|twitch|streamers?)\b/i],
    ["Social Media", /\b(tiktok|instagram|twitter|x\.com|facebook|meta|threads|bluesky|reels|social media|viral)\b/i],
    ["Substack & Newsletters", /\b(substack|newsletters?|beehiiv)\b/i],
    ["Prediction Markets", /\b(kalshi|polymarket|betting|bets?|prediction markets?)\b/i],
    ["Fundraising", /\b(fundrais\w*|donors?|pacs?|actblue|winred|raised|small.dollar)\b/i],
    ["Creators", /\b(creators?|influencers?|podcast\w*)\b/i],
    ["Elections & Campaigns", /\b(campaigns?|candidates?|primary|primaries|elections?|midterms?|ballot|polling|polls?)\b/i],
    ["Democratic Party", /\b(democrats?|dems|dnc|democratic party)\b/i],
    ["Think Tanks", /\b(think ?tanks?)\b/i],
  ];
  function tidy(s) {
    let t = s.replace(/\s+/g, " ").replace(/^[-*•·>\d.)\s]+/, "").trim();
    for (const [re, rep] of SHORTHAND) t = t.replace(re, rep);
    t = t.replace(/\s+([,.!?])/g, "$1").replace(/[,;:\s]+$/, "");
    return t ? t[0].toUpperCase() + t.slice(1) : t;
  }
  function cleanLocally(blurb) {
    const links = blurb.match(URL_RE) || [];
    const text = blurb.replace(URL_RE, " ");
    const segs = text
      .split(/\n+|(?:^|\s)[-*•]\s+|;\s+|(?<=[.!?])\s+/)
      .map(tidy)
      .filter((s) => s && s.length > 1);
    const q = segs.find((s) => s.endsWith("?"));
    const title = (segs[0] || "Untitled idea").replace(/[.]$/, "");
    const angle = q || (segs[0] ? segs[0].replace(/[.]$/, "") : "");
    const notes = segs.slice(1).filter((s) => s !== angle);
    const existing = new Set(categories().map(([c]) => c));
    let category = "General Politics";
    for (const [cat, re] of KEYWORDS) if (re.test(blurb)) { category = cat; break; }
    if (!existing.has(category) && category !== "General Politics") {
      // fine: a new category gets created
    }
    return { title: title.length > 110 ? title.slice(0, 107) + "…" : title, angle, notes, category, links };
  }

  // ---------- Rendering ----------
  function filtered() {
    const q = view.q.trim().toLowerCase();
    let items = all().map((it, i) => ({ it, i }));
    if (view.status !== "all") items = items.filter(({ it }) => it.status === view.status);
    if (view.category !== "all") items = items.filter(({ it }) => it.category === view.category);
    if (q) {
      items = items.filter(({ it }) =>
        [it.title, it.angle, it.category, it.series, it.date, ...it.notes, ...it.links].join(" ").toLowerCase().includes(q)
      );
    }
    items.sort((a, b) => {
      if (view.sortKey === "title" || view.sortKey === "category") {
        const c = a.it[view.sortKey].localeCompare(b.it[view.sortKey]);
        if (c) return c * view.sortDir;
      } else if (view.sortKey === "status") {
        const c = STATUS_ORDER[a.it.status] - STATUS_ORDER[b.it.status];
        if (c) return c * view.sortDir;
      } else {
        const c = STATUS_ORDER[a.it.status] - STATUS_ORDER[b.it.status];
        if (c) return c;
      }
      return a.i - b.i;
    });
    return items.map(({ it }) => it);
  }

  function canEdit(it) { return hasGitHub() || local.some((l) => l.id === it.id); }

  function render() {
    const items = filtered();
    const localIds = new Set(local.map((l) => l.id));
    rowsEl.innerHTML = items.map((it) => {
      const notes = it.notes.length
        ? `<ul class="notes">${it.notes.map((n) => `<li>${linkify(n)}</li>`).join("")}</ul>`
        : `<span class="no-notes">No notes yet</span>`;
      const links = it.links.length
        ? `<div class="links">${it.links.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">↗ ${shortUrl(u)}</a>`).join("")}</div>`
        : "";
      const extras = [];
      if (it.draftLink) extras.push(`<a class="mini-tag" href="${esc(it.draftLink)}" target="_blank" rel="noopener">Draft ↗</a>`);
      if (it.dataViz) extras.push(`<span class="mini-tag viz">Original data viz</span>`);
      return `<tr data-id="${esc(it.id)}"${it.id === flashId ? ' class="is-new"' : ""}>
        <td class="col-status">
          <span class="status status-${it.status}">${STATUS_LABEL[it.status]}</span>
          ${it.date ? `<span class="date">${esc(it.date)}</span>` : ""}
          ${localIds.has(it.id) ? `<span class="pending" title="Saved in this browser only">● This browser only</span>` : ""}
        </td>
        <td class="col-angle">
          ${it.series ? `<div class="issue-series">${esc(it.series)}</div>` : ""}
          <div class="issue-title">${esc(it.title)}</div>
          ${it.angle && it.angle !== it.title ? `<div class="issue-angle">${esc(it.angle)}</div>` : ""}
          ${extras.length ? `<div class="issue-extras">${extras.join("")}</div>` : ""}
        </td>
        <td class="col-notes">${notes}${links}</td>
        <td class="col-cat"><span class="cat" style="${catStyle(it.category)}">${esc(it.category)}</span></td>
        <td class="col-edit editor-only">${canEdit(it) ? `<button class="edit-btn" data-edit="${esc(it.id)}" title="Edit">✎</button>` : ""}</td>
      </tr>`;
    }).join("");
    $("empty").hidden = items.length > 0;
    $("meta").textContent = `${items.length} of ${all().length} ideas`;
    flashId = null;
    renderStats();
    renderCats();
    renderMode();
  }

  function renderStats() {
    const list = all();
    const count = (s) => list.filter((i) => i.status === s).length;
    const stats = [
      [count("upcoming") + count("drafting"), "On the calendar"],
      [count("idea"), "In the idea bank"],
      [categories().length, "Categories"],
      [count("published"), "Published"],
    ];
    $("stats").innerHTML = stats.map(([n, l]) => `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${l}</div></div>`).join("");
  }

  function renderCats() {
    const cats = categories();
    if (view.category !== "all" && !cats.some(([c]) => c === view.category)) view.category = "all";
    $("cat-filter").innerHTML =
      `<button class="cat-chip${view.category === "all" ? " is-active" : ""}" data-cat="all">All categories</button>` +
      cats.map(([c, n]) => `<button class="cat-chip${view.category === c ? " is-active" : ""}" data-cat="${esc(c)}">${esc(c)}<span class="count">${n}</span></button>`).join("");
    $("cat-list").innerHTML = cats.map(([c]) => `<option value="${esc(c)}"></option>`).join("");
  }

  function renderMode() {
    const pill = $("mode-pill");
    document.body.classList.toggle("is-editor", hasGitHub() || local.length > 0);
    if (hasGitHub()) {
      pill.className = "mode-pill is-live";
      pill.textContent = (hasClaude() ? "Claude cleanup" : "Basic cleanup") + " · publishes live";
    } else {
      pill.className = "mode-pill is-local";
      pill.textContent = (hasClaude() ? "Claude cleanup" : "Basic cleanup") + " · saves to this browser";
    }
  }

  function showBanner(msg) { const b = $("banner"); b.textContent = msg; b.hidden = !msg; }
  function intakeMsg(msg, isError) {
    const el = $("intake-msg");
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("is-error", !!isError);
  }

  // ---------- Edit dialog ----------
  function openEditor(mode, item, source) {
    editing = { mode, item };
    $("edit-title").textContent = mode === "new" ? "Review the cleaned-up idea" : "Edit idea";
    $("save-btn").textContent = mode === "new" ? "Add to calendar" : "Save changes";
    $("delete-btn").hidden = mode === "new";
    const src = $("edit-source");
    src.hidden = !source;
    src.textContent = source ? "Your note: " + source : "";
    $("f-title").value = item.title || "";
    $("f-angle").value = item.angle || "";
    $("f-notes").value = (item.notes || []).join("\n");
    $("f-links").value = (item.links || []).join("\n");
    $("f-category").value = item.category || "";
    $("f-status").value = item.status || "idea";
    $("f-date").value = item.date || "";
    $("f-series").value = item.series || "";
    $("f-draft").value = item.draftLink || "";
    $("f-viz").checked = !!item.dataViz;
    $("edit-dialog").showModal();
  }

  function readEditor() {
    return normalize({
      id: editing.item.id,
      title: $("f-title").value,
      angle: $("f-angle").value,
      notes: lines($("f-notes").value),
      links: lines($("f-links").value),
      category: $("f-category").value,
      status: $("f-status").value,
      date: $("f-date").value.trim(),
      series: $("f-series").value.trim(),
      draftLink: $("f-draft").value.trim(),
      dataViz: $("f-viz").checked,
    });
  }

  async function saveItem(item, isNew) {
    const isLocal = local.some((l) => l.id === item.id);
    if (hasGitHub() && !isLocal) {
      await ghCommit((ideas) => {
        if (isNew) return [item].concat(ideas);
        const i = ideas.findIndex((x) => x.id === item.id);
        if (i >= 0) ideas[i] = item; else ideas.unshift(item);
        return ideas;
      }, (isNew ? "Add idea: " : "Update idea: ") + item.title);
    } else {
      const i = local.findIndex((x) => x.id === item.id);
      if (i >= 0) local[i] = item; else local.unshift(item);
      store.set(LOCAL_KEY, local);
    }
  }

  async function deleteItem(item) {
    const i = local.findIndex((x) => x.id === item.id);
    if (i >= 0) { local.splice(i, 1); store.set(LOCAL_KEY, local); return; }
    await ghCommit((ideas) => ideas.filter((x) => x.id !== item.id), "Remove idea: " + item.title);
  }

  /** Push ideas that were saved in this browser to GitHub once a token exists. */
  async function publishLocal() {
    if (!hasGitHub() || !local.length) return;
    const pending = local.slice();
    await ghCommit((ideas) => pending.concat(ideas.filter((x) => !pending.some((p) => p.id === x.id))),
      `Add ${pending.length} idea${pending.length > 1 ? "s" : ""} from the calendar page`);
    local = [];
    store.del(LOCAL_KEY);
  }

  // ---------- CSV ----------
  function exportCsv() {
    const cols = ["status", "date", "series", "title", "angle", "notes", "category", "links", "draftLink", "dataViz"];
    const cell = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const rows = filtered().map((it) => cols.map((c) =>
      cell(Array.isArray(it[c]) ? it[c].join(c === "notes" ? " • " : " ") : it[c])).join(","));
    const blob = new Blob([[cols.join(",")].concat(rows).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "chaotic-era-editorial-calendar.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Events ----------
  $("intake-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const blurb = $("blurb").value.trim();
    if (!blurb) return;
    const btn = $("clean-btn");
    btn.disabled = true;
    btn.textContent = hasClaude() ? "Cleaning up with Claude…" : "Cleaning up…";
    intakeMsg("");
    let cleaned;
    try {
      cleaned = hasClaude() ? await cleanWithClaude(blurb) : cleanLocally(blurb);
    } catch (err) {
      intakeMsg(err.message + " Used the basic cleaner instead.", true);
      cleaned = cleanLocally(blurb);
    } finally {
      btn.disabled = false;
      btn.textContent = "Clean it up →";
    }
    const item = normalize(Object.assign({ status: $("blurb-status").value }, cleaned));
    item.id = newId(item.title);
    openEditor("new", item, blurb);
  });

  $("edit-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const item = readEditor();
    const isNew = editing.mode === "new";
    const btn = $("save-btn");
    btn.disabled = true;
    btn.textContent = "Saving…";
    try {
      await saveItem(item, isNew);
      $("edit-dialog").close();
      if (isNew) {
        $("blurb").value = "";
        intakeMsg(hasGitHub()
          ? "Added and committed to GitHub. The public page updates in about a minute."
          : "Added in this browser. Connect a GitHub token in ⚙ Editor to publish it.");
      }
      flashId = item.id;
      render();
    } catch (err) {
      alert("Couldn't save: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = isNew ? "Add to calendar" : "Save changes";
    }
  });

  $("cancel-btn").addEventListener("click", () => $("edit-dialog").close());
  $("delete-btn").addEventListener("click", async () => {
    const item = editing.item;
    if (!confirm(`Delete "${item.title}"?`)) return;
    try {
      await deleteItem(item);
      $("edit-dialog").close();
      render();
    } catch (err) { alert("Couldn't delete: " + err.message); }
  });

  rowsEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const item = all().find((x) => x.id === btn.dataset.edit);
    if (item) openEditor("edit", item);
  });

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("is-active", x === t));
    view.status = t.dataset.status;
    render();
  }));
  $("cat-filter").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-cat]");
    if (!chip) return;
    view.category = chip.dataset.cat;
    render();
  });
  $("search").addEventListener("input", (e) => { view.q = e.target.value; render(); });
  $("export").addEventListener("click", exportCsv);
  document.querySelectorAll("th.sortable").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.key;
    view.sortDir = view.sortKey === key ? -view.sortDir : 1;
    view.sortKey = key;
    document.querySelectorAll("th.sortable").forEach((x) => x.removeAttribute("aria-sort"));
    th.setAttribute("aria-sort", view.sortDir === 1 ? "ascending" : "descending");
    render();
  }));

  // Settings
  $("settings-btn").addEventListener("click", () => {
    $("s-anthropic").value = settings.anthropicKey;
    $("s-github").value = settings.githubToken;
    $("s-repo").value = settings.repo;
    $("settings-dialog").showModal();
  });
  $("s-cancel").addEventListener("click", () => $("settings-dialog").close());
  $("s-clear").addEventListener("click", () => {
    settings = { anthropicKey: "", githubToken: "", repo: DEFAULT_REPO };
    store.del(SETTINGS_KEY);
    $("settings-dialog").close();
    boot();
  });
  $("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    settings = {
      anthropicKey: $("s-anthropic").value.trim(),
      githubToken: $("s-github").value.trim(),
      repo: $("s-repo").value.trim() || DEFAULT_REPO,
    };
    if (!store.set(SETTINGS_KEY, settings)) alert("This browser blocked storage, so the keys will be forgotten when you leave.");
    $("settings-dialog").close();
    await boot();
    if (hasGitHub() && local.length && confirm(`Publish the ${local.length} idea(s) saved in this browser to GitHub?`)) {
      try { await publishLocal(); render(); } catch (err) { alert("Couldn't publish: " + err.message); }
    }
  });

  // ---------- Boot ----------
  async function boot() {
    try {
      published = await loadPublished();
      if (!hasGitHub()) showBanner("");
    } catch (err) {
      showBanner("Couldn't load the calendar (" + err.message + ").");
    }
    render();
  }
  boot();
})();
