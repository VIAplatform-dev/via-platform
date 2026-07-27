// VYA Cross-Lister — popup. Loads the seller's VYA queue (formatted for the chosen marketplace) and
// lets them fill one listing at a time, plus sync likes back into VYA.

const statusEl = document.getElementById("status");
const listEl = document.getElementById("list");
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

let platform = "depop"; // which marketplace the queue is formatted for / lists to

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function render(items) {
  listEl.innerHTML = "";
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item";

    const img = document.createElement("img");
    img.src = (item.images && item.images[0]) || "";
    row.appendChild(img);

    const meta = document.createElement("div");
    meta.className = "meta";
    const t = document.createElement("div"); t.className = "t"; t.textContent = item.title || "Untitled";
    const p = document.createElement("div"); p.className = "p"; p.textContent = `$${item.priceDollars}`;
    meta.appendChild(t); meta.appendChild(p);
    row.appendChild(meta);

    const btn = document.createElement("button");
    btn.textContent = `Fill on ${cap(platform)}`;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = `Opening ${cap(platform)}…`;
      const res = await send({ type: "LIST_ITEM", platform, item });
      btn.textContent = res && res.ok ? "Review & publish →" : `Retry (${(res && res.error) || "failed"})`;
      btn.disabled = false;
    });
    row.appendChild(btn);

    listEl.appendChild(row);
  }
}

async function load() {
  statusEl.textContent = "Loading your VYA queue…";
  const r = await send({ type: "GET_QUEUE", platform });
  if (!r || !r.ok) {
    statusEl.innerHTML = r && String(r.error).includes("401")
      ? 'Log into <a href="https://vyaplatform.com/store/dashboard" target="_blank">vyaplatform.com</a> first, then reopen this.'
      : `Couldn't load your queue (${(r && r.error) || "error"}).`;
    return;
  }
  const items = r.items || [];
  statusEl.textContent = items.length
    ? `${items.length} item${items.length === 1 ? "" : "s"} ready to list on ${cap(platform)}`
    : "Nothing to cross-list yet — add listings in VYA first.";
  render(items);
}

// Marketplace toggle — switches which marketplace the queue is formatted for.
function wireTabs() {
  document.querySelectorAll("#tabs button").forEach((b) => {
    b.addEventListener("click", () => {
      platform = b.dataset.platform;
      document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("on", x === b));
      load();
    });
  });
}

// Sync likes: opens the seller's shop/closet page; its content script reads the like counts and
// reports them to VYA. Passive — we never auto-click or submit anything on the marketplace.
function wireSync(id, plat) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Opening…";
    const res = await send({ type: "SYNC_STATS", platform: plat });
    btn.textContent = res && res.ok ? "Reading likes →" : `Retry (${(res && res.error) || "failed"})`;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2500);
  });
}

wireTabs();
wireSync("syncDepop", "depop");
wireSync("syncVestiaire", "vestiaire");
load();
