import { createServer } from "node:http";
import { readFile, writeFile, stat, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "assets", "uploads");
const siteFile = path.join(dataDir, "site.json");
const applicationsFile = path.join(dataDir, "applications.json");
const usersFile = path.join(dataDir, "users.json");
const sessions = new Map();
const maxImageUploadBytes = 8 * 1024 * 1024;

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const imageUploadTypes = new Map([
  ["image/png", ".png"],
  ["image/jpeg", ".jpg"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"]
]);

const staticImageTargets = new Set(["logo", "mainBanner", "bottomBannerLeft", "bottomBannerRight"]);

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function safeHtml(value = "") {
  return String(value);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  return cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function getSession(req) {
  const token = getCookie(req, "gijang_admin");
  return token ? sessions.get(token) : undefined;
}

function isAuthed(req) {
  return Boolean(getSession(req));
}

function isAdmin(req) {
  return getSession(req)?.role === "admin";
}

function canViewApplication(user, application) {
  return Boolean(user?.role === "admin" || application.consultantId === user?.id);
}

async function readUsers() {
  return readJson(usersFile, [
    { id: "admin", name: "관리자", role: "admin", password: "0000" },
    { id: "andong3", name: "김재형소장", role: "consultant", password: "0000" }
  ]);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function sendHead(res, headers = {}, status = 200) {
  res.writeHead(status, headers);
  res.end();
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

const deploymentAssetPaths = [
  "/styles.css",
  "/assets/logo.png",
  "/assets/popup-1.png",
  "/assets/popup-2.png",
  "/assets/banner-main.jpg",
  "/assets/banner-left.jpg",
  "/assets/banner-right.jpg"
];

function notFound(res) {
  sendHtml(res, renderSimplePage("준비 중", "<p>해당 페이지는 준비 중입니다.</p>"), 404);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    return raw ? JSON.parse(raw) : {};
  }
  const params = new URLSearchParams(raw);
  return Object.fromEntries(params.entries());
}

async function readRequestBuffer(req, maxBytes) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      const error = new Error("이미지는 8MB 이하만 업로드할 수 있습니다.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.slice(1).find(Boolean);
  if (!boundary) {
    const error = new Error("업로드 형식이 올바르지 않습니다.");
    error.status = 400;
    throw error;
  }
  const body = await readRequestBuffer(req, maxImageUploadBytes);
  const marker = Buffer.from(`--${boundary}`);
  const nextMarker = Buffer.from(`\r\n--${boundary}`);
  const fields = {};
  const files = {};
  let cursor = 0;
  while (cursor < body.length) {
    let start = body.indexOf(marker, cursor);
    if (start === -1) break;
    start += marker.length;
    if (body.slice(start, start + 2).toString() === "--") break;
    if (body.slice(start, start + 2).toString() === "\r\n") start += 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;
    const headers = Object.fromEntries(body.slice(start, headerEnd).toString("utf8").split("\r\n").map((line) => {
      const split = line.indexOf(":");
      return split === -1 ? ["", ""] : [line.slice(0, split).toLowerCase(), line.slice(split + 1).trim()];
    }).filter(([key]) => key));
    const disposition = headers["content-disposition"] || "";
    const name = disposition.match(/name="([^"]+)"/)?.[1];
    const filename = disposition.match(/filename="([^"]*)"/)?.[1];
    const dataStart = headerEnd + 4;
    const dataEnd = body.indexOf(nextMarker, dataStart);
    if (!name || dataEnd === -1) break;
    const data = body.slice(dataStart, dataEnd);
    if (filename) {
      files[name] = {
        filename: filename.split(/[\\/]/).pop() || "upload",
        contentType: (headers["content-type"] || "").split(";")[0].toLowerCase(),
        data
      };
    } else {
      fields[name] = data.toString("utf8");
    }
    cursor = dataEnd + 2;
  }
  return { fields, files };
}

function imageExtension(file) {
  if (imageUploadTypes.has(file.contentType)) return imageUploadTypes.get(file.contentType);
  const ext = path.extname(file.filename || "").toLowerCase();
  return [...imageUploadTypes.values()].includes(ext) ? ext : "";
}

function isImageTarget(target) {
  return staticImageTargets.has(target) || /^popupImage:\d+$/.test(target);
}

function uploadTargetFilename(target) {
  return String(target).replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
}

function setSiteImage(site, target, value) {
  if (target === "logo") site.logo = value;
  if (target === "mainBanner") {
    site.home ||= {};
    site.home.mainBanner = value;
  }
  if (target === "bottomBannerLeft") {
    site.home ||= {};
    site.home.bottomBannerLeft = value;
  }
  if (target === "bottomBannerRight") {
    site.home ||= {};
    site.home.bottomBannerRight = value;
  }
  if (target.startsWith("popupImage:")) {
    const index = Number(target.split(":")[1]);
    site.popups ||= [];
    while (site.popups.length <= index) {
      const next = site.popups.length;
      site.popups.push({ id: `popup${next + 1}`, enabled: false, image: "", left: 10 + (next % 3) * 470, top: 10 + Math.floor(next / 3) * 70, width: 450, height: 800 });
    }
    site.popups[index].image = value;
  }
}

async function saveUploadedImage(req) {
  const { fields, files } = await parseMultipart(req);
  const target = String(fields.target || "").trim();
  if (!isImageTarget(target)) {
    const error = new Error("이미지 위치를 확인할 수 없습니다.");
    error.status = 400;
    throw error;
  }
  const file = files.file;
  if (!file?.data?.length) {
    const error = new Error("업로드할 이미지 파일을 선택해주세요.");
    error.status = 400;
    throw error;
  }
  const ext = imageExtension(file);
  if (!ext) {
    const error = new Error("PNG, JPG, GIF, WEBP 이미지만 업로드할 수 있습니다.");
    error.status = 400;
    throw error;
  }
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${uploadTargetFilename(target)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  await writeFile(path.join(uploadsDir, filename), file.data);
  const publicPath = `/assets/uploads/${filename}`;
  const site = await readJson(siteFile, {});
  setSiteImage(site, target, publicPath);
  await writeJson(siteFile, site);
  return { ok: true, path: publicPath, site };
}

function pageShell(site, title, body, extra = "") {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} | ${escapeHtml(site.siteName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css?family=Lato:100,300,400,700|Noto+Sans+KR:300,400,700" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  ${renderHeader(site)}
  ${body}
  ${renderFooter(site)}
  ${renderSharedScript()}
  ${extra}
</body>
</html>`;
}

function renderHeader(site) {
  const navItems = Array.isArray(site.nav) ? site.nav : [];
  const nav = navItems
    .map((item) => `<li class="gnb-item">
      <a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a>
      <ul class="lnb">${(item.children || []).map((child) => `<li><a href="${escapeHtml(child.href)}">${escapeHtml(child.title)}</a></li>`).join("")}</ul>
    </li>`)
    .join("");
  const mobile = navItems
    .map((item) => `<details><summary>${escapeHtml(item.title)}</summary>${(item.children || []).map((child) => `<a href="${escapeHtml(child.href)}">${escapeHtml(child.title)}</a>`).join("")}</details>`)
    .join("");
  return `<header class="site-header">
    <div class="header-inner">
      <a class="logo" href="/"><img src="${escapeHtml(site.logo)}" alt="${escapeHtml(site.siteName)}"></a>
      <nav aria-label="메인메뉴"><ul class="gnb">${nav}</ul></nav>
      <button class="mobile-menu-button" type="button" data-mobile-menu><span></span><span class="sound-only">메뉴</span></button>
    </div>
    <nav class="mobile-panel" data-mobile-panel>${mobile}<a href="/admin" data-auth-link data-auth-label="plain">로그인</a></nav>
  </header>`;
}

function renderFooter(site) {
  return `<footer class="site-footer">
    <div class="footer-inner">
      <strong>${escapeHtml(site.siteName)}</strong>
      <div>${escapeHtml(site.footerAddress)}</div>
      <div class="footer-copy">${escapeHtml(site.copyright)} <a href="/admin" data-auth-link data-auth-label="bracket">[로그인]</a></div>
    </div>
  </footer>`;
}

function renderSharedScript() {
  return `<script>
document.querySelector("[data-mobile-menu]")?.addEventListener("click", () => {
  document.querySelector("[data-mobile-panel]")?.classList.toggle("open");
});
async function updateAuthLinks() {
  const links = document.querySelectorAll("[data-auth-link]");
  const authedOnly = document.querySelectorAll("[data-authed-only]");
  if (!links.length && !authedOnly.length) return;
  try {
    const response = await fetch("/api/session");
    const session = await response.json();
    if (!session.authed) return;
    authedOnly.forEach((item) => {
      item.hidden = false;
      item.closest("[data-authed-group]")?.classList.add("show-authed-items");
    });
    links.forEach((link) => {
      if (session.role === "admin" && !link.parentElement?.querySelector('[data-admin-shortcut="' + link.dataset.authLabel + '"]')) {
        const shortcut = document.createElement("a");
        shortcut.href = "/admin";
        shortcut.dataset.adminShortcut = link.dataset.authLabel || "plain";
        shortcut.className = "admin-shortcut-link";
        shortcut.textContent = link.dataset.authLabel === "bracket" ? "[관리자 페이지]" : "관리자 페이지";
        link.before(shortcut, " ");
      }
      link.textContent = link.dataset.authLabel === "bracket" ? "[로그아웃]" : "로그아웃";
      link.href = "/admin/logout?next=/";
    });
  } catch {}
}
updateAuthLinks();
</script>`;
}

function renderPopups(site) {
  return (Array.isArray(site.popups) ? site.popups : [])
    .filter((popup) => popup && popup.enabled && popup.image)
    .map((popup, index) => `<div class="popup-layer" data-popup="${escapeHtml(popup.id || `popup${index + 1}`)}" hidden style="--popup-index:${index};left:${Number(popup.left) || 0}px;top:${Number(popup.top) || 0}px;width:${Number(popup.width) || 450}px;height:${Number(popup.height) || 800}px">
      <img src="${escapeHtml(popup.image)}" alt="팝업 알림">
      <div class="popup-footer">
        <button type="button" data-popup-hide="${escapeHtml(popup.id || `popup${index + 1}`)}"><strong>24</strong>시간 동안 다시 열람하지 않습니다.</button>
        <button type="button" data-popup-close="${escapeHtml(popup.id || `popup${index + 1}`)}">닫기</button>
      </div>
    </div>`)
    .join("");
}

function renderPopupScript() {
  return `<script>
function findPopupLayer(id) {
  var layers = document.querySelectorAll("[data-popup]");
  for (var i = 0; i < layers.length; i += 1) {
    if (layers[i].getAttribute("data-popup") === id) return layers[i];
  }
  return null;
}
function popupMatches(element, selector) {
  var matches = element.matches || element.webkitMatchesSelector || element.msMatchesSelector;
  return matches ? matches.call(element, selector) : false;
}
function popupClosest(element, selector) {
  var current = element;
  while (current && current !== document) {
    if (popupMatches(current, selector)) return current;
    current = current.parentElement;
  }
  return null;
}
function popupStorageGet(key) {
  try {
    return window.localStorage ? localStorage.getItem(key) : "";
  } catch (error) {
    return "";
  }
}
function popupStorageSet(key, value) {
  try {
    if (window.localStorage) localStorage.setItem(key, value);
  } catch (error) {}
}
function popupStorageRemove(key) {
  try {
    if (window.localStorage) localStorage.removeItem(key);
  } catch (error) {}
}
var popupLayers = document.querySelectorAll("[data-popup]");
for (var i = 0; i < popupLayers.length; i += 1) {
  var layer = popupLayers[i];
  var id = layer.getAttribute("data-popup");
  var hiddenUntil = Number(popupStorageGet("hide_" + id) || 0);
  if (hiddenUntil > Date.now()) {
    layer.hidden = true;
  } else {
    if (hiddenUntil) popupStorageRemove("hide_" + id);
    layer.hidden = false;
  }
}
document.addEventListener("click", function(event) {
  var close = popupClosest(event.target, "[data-popup-close]");
  var hide = popupClosest(event.target, "[data-popup-hide]");
  if (close) {
    var closeLayer = findPopupLayer(close.getAttribute("data-popup-close"));
    if (closeLayer) closeLayer.hidden = true;
  }
  if (hide) {
    var popupId = hide.getAttribute("data-popup-hide");
    popupStorageSet("hide_" + popupId, String(Date.now() + 24 * 60 * 60 * 1000));
    var hideLayer = findPopupLayer(popupId);
    if (hideLayer) hideLayer.hidden = true;
  }
});
</script>`;
}

function daysBetween(start, end) {
  const result = new Set();
  const current = new Date(`${start}T00:00:00`);
  const last = new Date(`${end || start}T00:00:00`);
  while (!Number.isNaN(current.getTime()) && current <= last) {
    result.add(dateToIso(current));
    current.setDate(current.getDate() + 1);
  }
  return result;
}

function dateToIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function scheduleEntries(site) {
  return (site.schedule || []).map((event, index) => ({ ...event, index, end: event.end || event.start }));
}

function eventsByDate(site) {
  const result = new Map();
  for (const event of scheduleEntries(site)) {
    for (const day of daysBetween(event.start, event.end)) {
      if (!result.has(day)) result.set(day, []);
      result.get(day).push(event);
    }
  }
  return result;
}

function compactKoreanDate(value = "") {
  const [year = "", month = "", day = ""] = String(value).split("-");
  return year && month && day ? `${year}.${month}.${day}` : value;
}

function shortKoreanDate(value = "") {
  const [year = "", month = "", day = ""] = String(value).split("-");
  return year && month && day ? `${year.slice(2)}.${month}.${day}` : value;
}

function defaultScheduleBody(event) {
  return `${event.title || ""} 16시~22시`;
}

function schedulePublishedDate(event) {
  const date = new Date(`${event.start}T00:00:00`);
  if (Number.isNaN(date.getTime())) return event.start || "";
  date.setDate(date.getDate() - 6);
  return dateToIso(date);
}

function renderCalendar(site) {
  const year = 2026;
  const month = 5;
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const eventDays = eventsByDate(site);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push("");
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(String(day));
  while (cells.length % 7 !== 0) cells.push("");
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return `<div class="calendar-shell">
    <div class="calendar-title">2026.06</div>
    <table class="calendar">
      <thead><tr>${["일", "월", "화", "수", "목", "금", "토"].map((d) => `<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${rows
	        .map((row) => `<tr>${row
	          .map((day, index) => {
	            const iso = day ? isoDate(year, month, Number(day)) : "";
	            const hasEvent = eventDays.has(iso);
	            const cls = [index === 0 ? "sunday" : "", index === 6 ? "saturday" : "", hasEvent ? "has-event" : ""].filter(Boolean).join(" ");
	            return `<td class="${cls}">${day ? (hasEvent ? `<a class="calendar-day-link" href="/05sub06?date=${escapeHtml(iso)}"><strong>${day}</strong><span class="dot">●</span></a>` : day) : ""}</td>`;
	          })
	          .join("")}</tr>`)
	        .join("")}</tbody>
    </table>
  </div>`;
}

function renderSchedule(site) {
  return `<ul class="schedule-list">${(site.schedule || [])
    .map((event, index) => `<li><a href="/05sub06/schedule/${index}"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(event.start)} ~ ${escapeHtml(event.end || event.start)}</span></a></li>`)
    .join("")}</ul>`;
}

function renderHome(site) {
  const tabs = site.noticeTabs || [];
  const noticeButtons = tabs.map((tab, index) => `<button class="${index === 0 ? "active" : ""}" type="button" data-notice-button="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join("");
  const noticePanels = tabs
    .map((tab, index) => `<div class="notice-panel ${index === 0 ? "active" : ""}" data-notice-panel="${escapeHtml(tab.id)}">
      <div class="notice-grid">${tab.items?.length ? tab.items.map((item) => `<a href="${escapeHtml(item.href)}"><div class="notice-card"><span class="notice-tag">${escapeHtml(item.tag)}</span><p>${escapeHtml(item.title)}</p></div></a>`).join("") : `<div class="notice-empty">등록된 게시물이 없습니다.</div>`}</div>
      <a class="notice-more-link" href="${escapeHtml(tab.href)}">${escapeHtml(tab.moreLabel)}</a>
    </div>`)
    .join("");
  const body = `<main id="container">
    ${renderPopups(site)}
    <div class="container">
      <div class="home-grid">
        <div><img class="banner-image" src="${escapeHtml(site.home.mainBanner)}" alt="메인배너"></div>
        <div class="right-content">
          <div class="action-box"><a href="/content/11맞춤형컨설팅/">${escapeHtml(site.home.ctaText)}</a></div>
          <div class="calendar-panel">${renderCalendar(site)}${renderSchedule(site)}</div>
        </div>
      </div>
      <div class="notice-container">
        <div class="notice-menu">${noticeButtons}</div>
        <div class="notice-tab-content">${noticePanels}</div>
      </div>
      <section class="business-section">
        <div class="text-content">
          <h2>${escapeHtml(site.home.businessTitle)}</h2>
          <div class="business-info">${safeHtml(site.home.businessHtml)}</div>
        </div>
        <div class="image-gallery">
          <img class="gallery-image" src="${escapeHtml(site.home.bottomBannerLeft)}" alt="메인하단 좌측배너">
          <img class="gallery-image" src="${escapeHtml(site.home.bottomBannerRight)}" alt="메인하단 우측배너">
        </div>
      </section>
    </div>
  </main>`;
  const extra = `${renderPopupScript()}<script>
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-notice-button]");
  if (!button) return;
  document.querySelectorAll("[data-notice-button]").forEach((node) => node.classList.remove("active"));
  document.querySelectorAll("[data-notice-panel]").forEach((node) => node.classList.remove("active"));
  button.classList.add("active");
  document.querySelector('[data-notice-panel="' + button.dataset.noticeButton + '"]')?.classList.add("active");
});
</script>`;
  return pageShell(site, site.siteName, body, extra);
}

function renderTitleBand(title, crumb) {
  return `<div class="page-title-band"><div class="page-title-inner"><p>${escapeHtml(crumb)}</p><h1>${escapeHtml(title)}</h1></div></div>`;
}

function renderRealPageHead(title, crumbs = []) {
  const crumbItems = ["HOME", ...crumbs];
  return `<div class="real-page-head">
    <h1>${escapeHtml(title)}</h1>
    <nav class="real-breadcrumb" aria-label="현재 위치">
      ${crumbItems.map((item, index) => `<span class="${index === 0 ? "home" : ""}">${escapeHtml(item)}</span>`).join("<span class=\"divider\">›</span>")}
    </nav>
  </div>`;
}

function normalizePath(pathname = "") {
  if (pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function findContentPage(site, pathname) {
  const target = normalizePath(pathname);
  return (site.contentPages || []).find((page) => normalizePath(page.path) === target);
}

function findWriteProgram(site, pathname) {
  const target = normalizePath(pathname);
  if (!target.endsWith("/write")) return null;
  const page = (site.contentPages || []).find((item) => item.ctaHref && normalizePath(item.ctaHref) === target);
  if (!page) return null;
  return {
    title: page.title,
    path: page.path,
    formTitle: `${page.title} 신청합니다`
  };
}

function renderLocalSubNav(site, activePath) {
  const active = normalizePath(activePath);
  const group = (site.nav || []).find((nav) => normalizePath(nav.href) === active || (nav.children || []).some((child) => normalizePath(child.href) === active));
  if (!group) return "";
  const links = (group.children || []).map((child) => `<a class="${normalizePath(child.href) === active ? "active" : ""}" href="${escapeHtml(child.href)}">${escapeHtml(child.title)}</a>`).join("");
  return `<nav class="local-subnav" aria-label="${escapeHtml(group.title)} 하위 메뉴">${links}</nav>`;
}

function renderContentPage(site, page) {
  const body = `${renderTitleBand(page.title, page.crumb || "")}
    <main class="subpage-wrap">
      <article class="content-page">
        ${page.subtitle ? `<p class="content-lead">${escapeHtml(page.subtitle)}</p>` : ""}
        <div class="content-body">${safeHtml(page.html || "")}</div>
        ${page.ctaHref ? `<div class="button-container"><a class="btn" href="${escapeHtml(page.ctaHref)}">${escapeHtml(page.ctaText || "신청하기")}</a></div>` : ""}
      </article>
    </main>`;
  return pageShell(site, page.title, body);
}

function findBoardRoute(site, pathname) {
  const target = normalizePath(pathname);
  for (const board of site.boards || []) {
    const base = normalizePath(board.path);
    if (target === base) return { board };
    const prefix = `${base}/view/`;
    if (target.startsWith(prefix)) {
      const index = Number(target.slice(prefix.length));
      if (Number.isInteger(index) && index >= 0) return { board, index };
    }
  }
  return null;
}

function renderBoardList(site, board, authed = false) {
  const items = board.items || [];
  const rows = items.length
    ? items.map((item, index) => `<a class="board-row" href="${escapeHtml(`${normalizePath(board.path)}/view/${index}`)}">
        <span class="board-title">${escapeHtml(item.title)}</span>
        <span class="board-date">${escapeHtml(item.date || "")}</span>
      </a>`).join("")
    : `<div class="notice-empty">등록된 게시물이 없습니다.</div>`;
  const body = `${renderTitleBand(board.title, board.crumb || "열린마당")}
    <main class="subpage-wrap">
      <section class="board-page">
        <div class="board-head">
          <p>${escapeHtml(board.description || "")}</p>
          ${authed ? `<a class="btn ghost" href="/admin">게시판 수정</a>` : ""}
        </div>
        <div class="board-list">${rows}</div>
      </section>
    </main>`;
  return pageShell(site, board.title, body);
}

function renderBoardDetail(site, board, index, authed = false) {
  const item = (board.items || [])[index];
  if (!item) return null;
  const body = `${renderTitleBand(board.title, board.crumb || "열린마당")}
    <main class="subpage-wrap">
      <article class="board-detail">
        <div class="board-detail-top">
          <a class="btn ghost" href="${escapeHtml(board.path)}">목록</a>
          ${authed ? `<a class="btn ghost" href="/admin">수정</a>` : ""}
        </div>
        <h2>${escapeHtml(item.title)}</h2>
        <p class="board-date">${escapeHtml(item.date || "")}</p>
        <div class="content-body">${safeHtml(item.html || "")}</div>
      </article>
    </main>`;
  return pageShell(site, item.title, body);
}

function renderCenterSchedule(site, selectedDate = "") {
  const year = 2026;
  const month = 5;
  const byDate = eventsByDate(site);
  const entries = scheduleEntries(site);
  const today = dateToIso(new Date());
  let activeDate = selectedDate && byDate.has(selectedDate) ? selectedDate : "";
  if (!activeDate && byDate.has(today)) activeDate = today;
  if (!activeDate) activeDate = entries[0]?.start || isoDate(year, month, 1);
  const selectedEvents = byDate.get(activeDate) || [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const calendarRows = rows.map((row) => `<tr>${row.map((day, weekday) => {
    if (!day) return `<td class="empty"></td>`;
    const iso = isoDate(year, month, day);
    const events = byDate.get(iso) || [];
    const cls = [weekday === 0 ? "sunday" : "", weekday === 6 ? "saturday" : "", iso === activeDate ? "selected" : ""].filter(Boolean).join(" ");
    return `<td class="${cls}">
      <a class="schedule-day-number" href="/05sub06?date=${escapeHtml(iso)}">${day}</a>
      ${events.map((event) => `<a class="schedule-event-link" href="/05sub06/schedule/${event.index}">${escapeHtml(event.title)}</a>`).join("")}
    </td>`;
  }).join("")}</tr>`).join("");
  const body = `${renderRealPageHead("센터일정", ["열린마당", "센터 일정"])}
    <main class="center-schedule-page">
      <section class="center-month-head">
        <span aria-hidden="true">‹</span>
        <strong>2026.6</strong>
        <span aria-hidden="true">›</span>
      </section>
      <section class="center-selected-day">
        <div class="selected-date-card">
          <div class="date-card-icon" aria-hidden="true">▣</div>
          <strong>${escapeHtml(compactKoreanDate(activeDate))}</strong>
        </div>
        <div class="selected-event-list">
          ${selectedEvents.length ? selectedEvents.map((event) => `<a href="/05sub06/schedule/${event.index}">ㆍ ${escapeHtml(event.title)}</a>`).join("") : `<span>ㆍ 등록된 일정이 없습니다.</span>`}
        </div>
      </section>
      <div class="center-month-table-wrap">
        <table class="center-month-calendar">
          <thead><tr>${["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"].map((day) => `<th>${day}</th>`).join("")}</tr></thead>
          <tbody>${calendarRows}</tbody>
        </table>
      </div>
    </main>`;
  return pageShell(site, "센터일정", body);
}

function renderCenterScheduleDetail(site, index) {
  const event = scheduleEntries(site)[index];
  if (!event) return null;
  const body = `${renderRealPageHead("센터일정", ["열린마당", "센터 일정"])}
    <main class="center-schedule-detail-page">
      <div class="schedule-detail-actions">
        <a class="real-outline-button" href="/05sub06?date=${escapeHtml(event.start)}">☷ 목록</a>
      </div>
      <article class="schedule-detail-article">
        <header>
          <h2>${escapeHtml(event.title)}</h2>
          <p>조회41회 <span>${escapeHtml(shortKoreanDate(schedulePublishedDate(event)))}</span></p>
        </header>
        <div class="schedule-detail-body">${escapeHtml(event.description || defaultScheduleBody(event))}</div>
      </article>
    </main>`;
  return pageShell(site, event.title || "센터일정", body);
}

function renderConsulting(site) {
  const consulting = site.consulting;
  const body = `${renderRealPageHead("1:1맞춤형컨설팅", ["프로그램 참가신청", "1:1 맞춤형 컨설팅"])}
    <main class="real-consult-page">
      <section class="real-consult-intro">
        <div class="real-consult-title">
          <span></span>
          <h2>${escapeHtml(consulting.pageTitle || "1:1진학상담")}</h2>
        </div>
        <div class="real-consult-notice">
          <h3>${escapeHtml(consulting.noticeTitle)}</h3>
          <p class="real-consult-alert">${escapeHtml(consulting.noticeSubtitle)}</p>
          <div class="real-consult-box">${safeHtml(consulting.noticeHtml)}</div>
        </div>
      </section>
      <nav class="real-consult-actions" data-authed-group aria-label="1:1 맞춤형 컨설팅 신청 메뉴">
        <a class="apply" href="/04sub01/write">신청하기</a>
        <a class="lookup" href="/content/컨설턴트-신청확인/">신청조회</a>
        <a class="confirm" href="/04sub01" data-authed-only hidden>신청확인</a>
      </nav>
    </main>`;
  return pageShell(site, "1:1맞춤형컨설팅", body);
}

function renderWriteForm(site, program = { title: "1:1 맞춤형 컨설팅", path: "/content/11맞춤형컨설팅/", formTitle: "1:1컨설턴트 신청합니다" }) {
  const form = site.form;
  const consultantOptions = form.consultants.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join("");
  const placeOptions = form.places.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
  const residenceOptions = form.residences.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join("");
  const times = form.times.map((time) => `<label class="radio-pill"><input type="radio" name="time" value="${escapeHtml(time)}" required><span>${escapeHtml(time)}</span></label>`).join("");
  const body = `${renderTitleBand(program.title, "프로그램 참가신청")}
    <section class="form-card">
      <h1 class="form-title">${escapeHtml(program.formTitle || `${program.title} 신청합니다`)}</h1>
      <form id="applyForm">
        <input type="hidden" name="programTitle" value="${escapeHtml(program.title)}">
        <input type="hidden" name="programPath" value="${escapeHtml(program.path)}">
        <div class="agree-box">
          <h2>개인정보 수집 및 이용에 대한 동의</h2>
          <textarea readonly>1. 수집 및 이용 목적: 상담 운영 및 관리
2. 필수항목: 성명(학생), 휴대폰번호(학생 또는 학부모), 학교명, 학년, 대학지원내용
3. 보유 및 이용기간: 상담 운영 목적 달성 후 관련 법령에 따라 보관 또는 파기됩니다.
4. 개인정보 수집을 거부할 수 있으며, 미동의 시 진학 상담에 참여할 수 없습니다.</textarea>
          <label><input type="checkbox" name="agree" value="1" required> 예</label>
        </div>
        <div class="form-grid">
          <div class="form-field full">
            <span class="field-label">신청자 <span class="required">*</span></span>
            <div class="radio-row">
              <label class="radio-pill"><input type="radio" name="applicantType" value="학부모" required><span>학부모</span></label>
              <label class="radio-pill"><input type="radio" name="applicantType" value="학생" required><span>학생</span></label>
            </div>
          </div>
          <div class="form-field">
            <label for="consultantId">컨설턴트 <span class="required">*</span></label>
            <select id="consultantId" name="consultantId" required><option value="">선택하세요</option>${consultantOptions}</select>
          </div>
          <div class="form-field">
            <label for="place">장소선택 <span class="required">*</span></label>
            <select id="place" name="place" required><option value="">선택하세요</option>${placeOptions}</select>
          </div>
          <div class="form-field">
            <label for="date">날짜선택 <span class="required">*</span></label>
            <input id="date" name="date" type="date" required>
          </div>
          <div class="form-field">
            <span class="field-label">선택시간 <span class="required">*</span></span>
            <div class="time-row">${times}</div>
          </div>
          <div class="form-field">
            <label for="residence">거주지 <span class="required">*</span></label>
            <select id="residence" name="residence" required><option value="">선택하세요</option>${residenceOptions}</select>
          </div>
          <div class="form-field">
            <label for="studentName">이름 <span class="required">*</span></label>
            <input id="studentName" name="studentName" required placeholder="이름">
          </div>
          <div class="form-field">
            <label for="parentPhone">학부모 연락처 <span class="required">*</span></label>
            <input id="parentPhone" name="parentPhone" required placeholder="010-0000-0000" maxlength="13">
          </div>
          <div class="form-field">
            <label for="studentPhone">학생 연락처 <span class="required">*</span></label>
            <input id="studentPhone" name="studentPhone" required placeholder="010-0000-0000" maxlength="13">
          </div>
          <div class="form-field">
            <label for="school">학교명 <span class="required">*</span></label>
            <input id="school" name="school" required placeholder="학교명">
          </div>
          <div class="form-field">
            <label for="grade">학년 <span class="required">*</span></label>
            <input id="grade" name="grade" required placeholder="학년">
          </div>
          <div class="form-field">
            <label for="password">비밀번호 <span class="required">*</span></label>
            <input id="password" name="password" type="password" required placeholder="비밀번호">
          </div>
          <div class="form-field full">
            <label for="content">상담 희망 내용 <span class="required">*</span></label>
            <textarea id="content" name="content" required>${escapeHtml(form.defaultContent)}</textarea>
          </div>
        </div>
        <div class="message" id="applyMessage"></div>
        <button type="submit" class="btn">신청하기</button>
      </form>
    </section>`;
  return pageShell(site, "상담 신청", body, `<script>
const consultants = ${JSON.stringify(form.consultants)};
function phoneFormat(input) {
  input.addEventListener("input", () => {
    const value = input.value.replace(/\\D/g, "").slice(0, 11);
    input.value = value.length <= 3 ? value : value.length <= 7 ? value.slice(0, 3) + "-" + value.slice(3) : value.slice(0, 3) + "-" + value.slice(3, 7) + "-" + value.slice(7);
  });
}
phoneFormat(document.getElementById("parentPhone"));
phoneFormat(document.getElementById("studentPhone"));
document.getElementById("applyForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
  const consultant = consultants.find((item) => item.id === formData.consultantId);
  formData.consultantName = consultant?.name || "";
  const message = document.getElementById("applyMessage");
  message.textContent = "";
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(formData)
  });
  const result = await response.json();
  if (!response.ok) {
    message.className = "message error";
    message.textContent = result.error || "신청 저장에 실패했습니다.";
    return;
  }
  message.className = "message";
  message.textContent = "상담 신청이 접수되었습니다.";
  window.location.href = "/04sub01?submitted=1";
});
	</script>`);
}

function compactDateTime(date = "", time = "") {
  const [year = "", month = "", day = ""] = String(date).split("-");
  if (year && month && day) return `${year}${month} ${day}${time ? ` ${time}` : ""}`.trim();
  return `${date} ${time}`.trim();
}

function shortDate(value = "") {
  const date = String(value).includes("T") ? String(value).slice(0, 10) : String(value);
  const [, month = "", day = ""] = date.split("-");
  return month && day ? `${month}-${day}` : date;
}

function renderApplicationConfirmList(site, applications, authed = false, submitted = false) {
  const total = applications.length;
  const rows = applications.length
    ? applications.map((item, index) => `<tr>
        <td>${total - index}</td>
        <td class="consultant">${escapeHtml(item.consultantName || "")}</td>
        <td>${escapeHtml(compactDateTime(item.date, item.time))}</td>
        <td>${escapeHtml(item.school || "")}</td>
        <td>${escapeHtml(item.grade || "")}</td>
        <td>${escapeHtml(item.studentName || "")}</td>
        <td>${escapeHtml(item.applicantType || "")}</td>
        <td>${escapeHtml(String(item.viewCount || item.lookupCount || ""))}</td>
        <td>${escapeHtml(shortDate(item.createdAt))}</td>
        <td>${escapeHtml(item.status || "접수")}</td>
      </tr>`).join("")
    : `<tr><td class="empty" colspan="10">등록된 신청 내역이 없습니다.</td></tr>`;
  const successMessage = submitted ? `<div class="confirm-success">상담 신청이 접수되었습니다.</div>` : "";
  const body = `${renderRealPageHead("1:1맞춤형컨설팅")}
    <main class="real-confirm-page">
      ${successMessage}
      <div class="real-confirm-toolbar">
        <p>TOTAL ${total}건 1 페이지</p>
        <div>
          <a class="real-outline-button" href="${authed ? "/admin/applicants.xls" : "/admin"}"><span aria-hidden="true">⊙</span> 엑셀 다운로드</a>
          <a class="real-outline-button" href="#confirmList"><span aria-hidden="true">⌕</span> 검색</a>
        </div>
      </div>
      <div class="real-confirm-table-wrap" id="confirmList">
        <table class="real-confirm-table">
          <thead>
            <tr>
              <th>번호</th>
              <th>컨설턴트</th>
              <th>날짜/시간</th>
              <th>학교</th>
              <th>학년</th>
              <th>학생이름</th>
              <th>신청자</th>
              <th>조회</th>
              <th>신청일</th>
              <th>상태</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </main>`;
  return pageShell(site, "1:1맞춤형컨설팅 신청확인", body);
}

function renderApplicationSubmitted(site) {
  const body = `${renderRealPageHead("1:1맞춤형컨설팅")}
    <main class="real-confirm-page">
      <div class="confirm-success">상담 신청이 접수되었습니다.</div>
      <div class="submitted-actions">
        <a class="real-outline-button" href="/content/컨설턴트-신청확인/">신청조회</a>
        <a class="real-outline-button" href="/content/11맞춤형컨설팅/">상담 안내로 이동</a>
      </div>
    </main>`;
  return pageShell(site, "상담 신청 접수완료", body);
}

function renderLookup(site) {
  const body = `${renderTitleBand("컨설턴트 신청확인", "프로그램 참가신청")}
    <section class="lookup-card">
      <h1 class="form-title">신청현황확인</h1>
      <form id="lookupForm" class="form-grid">
        <div class="form-field">
          <label for="lookupName">성함 <span class="required">*</span></label>
          <input id="lookupName" name="studentName" required placeholder="성함">
        </div>
        <div class="form-field">
          <label for="lookupPhone">학생 연락처 <span class="required">*</span></label>
          <input id="lookupPhone" name="studentPhone" required placeholder="연락처" maxlength="13">
        </div>
        <div class="form-field">
          <label for="lookupPassword">비밀번호 <span class="required">*</span></label>
          <input id="lookupPassword" name="password" type="password" required placeholder="비밀번호">
        </div>
        <div class="form-field"><label>&nbsp;</label><button type="submit" class="btn">확인</button></div>
      </form>
      <div class="message" id="lookupMessage"></div>
      <div class="result-list" id="lookupResults"></div>
    </section>`;
  return pageShell(site, "신청확인", body, `<script>
const phoneInput = document.getElementById("lookupPhone");
phoneInput.addEventListener("input", () => {
  const value = phoneInput.value.replace(/\\D/g, "").slice(0, 11);
  phoneInput.value = value.length <= 3 ? value : value.length <= 7 ? value.slice(0, 3) + "-" + value.slice(3) : value.slice(0, 3) + "-" + value.slice(3, 7) + "-" + value.slice(7);
});
document.getElementById("lookupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const response = await fetch("/api/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const result = await response.json();
  const message = document.getElementById("lookupMessage");
  const list = document.getElementById("lookupResults");
  list.innerHTML = "";
  if (!result.items?.length) {
    message.className = "message error";
    message.textContent = "일치하는 신청 내역이 없습니다.";
    return;
  }
  message.className = "message";
  message.textContent = result.items.length + "건의 신청 내역이 있습니다.";
  list.innerHTML = result.items.map((item) => '<div class="result-item"><strong>' + item.status + '</strong><p>' + (item.programTitle || '상담 신청') + '</p><p>' + item.consultantName + ' / ' + item.place + '</p><p>' + item.date + ' ' + item.time + '</p><p>' + item.school + ' ' + item.grade + '</p></div>').join("");
});
</script>`);
}

function renderAdminLogin(site, error = "") {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>로그인 | ${escapeHtml(site.siteName)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  ${renderHeader(site)}
  <main class="login-bg">
    <form class="login-card" method="post" action="/admin/login">
      <img src="${escapeHtml(site.logo)}" alt="${escapeHtml(site.siteName)}">
      <h1>로그인</h1>
      <div class="form-field"><label for="mb_id">아이디</label><input id="mb_id" name="mb_id" required placeholder="아이디"></div>
      <div class="form-field"><label for="mb_password">비밀번호</label><input id="mb_password" name="mb_password" type="password" required placeholder="비밀번호"></div>
      ${error ? `<p class="message error">${escapeHtml(error)}</p>` : ""}
      <button class="btn" type="submit">LOGIN</button>
    </form>
  </main>
</body>
</html>`;
}

function renderAdmin(site, user) {
  const adminMode = user.role === "admin";
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>관리자 | ${escapeHtml(site.siteName)}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  ${renderHeader(site)}
  <main class="admin-shell">
    <div class="admin-topbar">
      <div><h1>${adminMode ? "관리자 페이지" : "컨설턴트 페이지"}</h1><p class="message" id="adminMessage">${escapeHtml(user.name)}님 로그인 중</p></div>
      <div class="admin-actions">
        <a class="btn ghost" href="/" target="_blank">사이트 보기</a>
        <a class="btn secondary" href="/admin/applicants.xls">엑셀 다운로드</a>
        <form method="post" action="/admin/logout"><button class="btn ghost" type="submit">로그아웃</button></form>
      </div>
    </div>
    <div class="admin-tabs">
      <button class="active" type="button" data-admin-tab="dashboard">신청자</button>
      ${adminMode ? `<button type="button" data-admin-tab="content">메인 내용</button>
      <button type="button" data-admin-tab="menus">메뉴 내용</button>
      <button type="button" data-admin-tab="images">배너/이미지</button>
      <button type="button" data-admin-tab="form">상담 폼</button>
      <button type="button" data-admin-tab="boards">게시판/일정</button>
      <button type="button" data-admin-tab="users">계정관리</button>` : ""}
      <button type="button" data-admin-tab="password">비밀번호 변경</button>
    </div>

    <section class="admin-panel active" data-admin-panel="dashboard">
      <div class="metric-row" id="metrics"></div>
      <div class="table-wrap"><table class="admin-table" id="applicationsTable"></table></div>
    </section>

    ${adminMode ? `<section class="admin-panel" data-admin-panel="content">
      <div class="admin-card">
        <div class="admin-grid">
          <div class="form-field"><label>사이트 이름</label><input id="siteName"></div>
          <div class="form-field"><label>푸터 저작권</label><input id="copyright"></div>
          <div class="form-field full"><label>푸터 주소</label><input id="footerAddress"></div>
          <div class="form-field"><label>상담 페이지 제목</label><input id="consultingPageTitle"></div>
          <div class="form-field"><label>상담 안내 제목</label><input id="consultingNoticeTitle"></div>
          <div class="form-field full"><label>상담 안내 부제목</label><input id="consultingNoticeSubtitle"></div>
          <div class="form-field full"><label>상담 안내 내용</label><textarea id="consultingNoticeHtml"></textarea></div>
          <div class="form-field"><label>메인 사업 제목</label><input id="businessTitle"></div>
          <div class="form-field"><label>상담 신청 버튼 문구</label><input id="ctaText"></div>
          <div class="form-field full"><label>메인 사업 내용</label><textarea id="businessHtml"></textarea></div>
        </div>
      </div>
      <button class="btn" type="button" data-save-site>저장</button>
    </section>

    <section class="admin-panel" data-admin-panel="menus">
      <div class="admin-card">
        <div class="nav-editor-head">
          <div>
            <h2>상단 메뉴 이름</h2>
            <p class="admin-help">상단 메뉴와 펼쳐지는 하위 메뉴의 이름, 연결 경로를 수정할 수 있습니다.</p>
          </div>
          <button class="btn secondary" type="button" data-add-nav>상위 메뉴 추가</button>
        </div>
        <div id="navEditor" class="nav-editor-list"></div>
      </div>
      <div id="contentPagesEditor"></div>
      <button class="btn" type="button" data-save-site>저장</button>
    </section>

    <section class="admin-panel" data-admin-panel="images">
      <div class="admin-card">
        <div class="admin-grid">
          <div class="form-field image-field"><label>로고</label><div class="image-preview logo-preview"><img data-image-preview="logo" alt="로고 미리보기"></div><input id="logo" data-image-path="logo" placeholder="/assets/logo.png"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-upload="logo"></div>
          <div class="form-field image-field"><label>홈 메인 사진</label><div class="image-preview banner-preview"><img data-image-preview="mainBanner" alt="홈 메인 사진 미리보기"></div><input id="mainBanner" data-image-path="mainBanner" placeholder="/assets/banner-main.jpg"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-upload="mainBanner"></div>
          <div class="form-field image-field"><label>하단 좌측 배너</label><div class="image-preview banner-preview"><img data-image-preview="bottomBannerLeft" alt="하단 좌측 배너 미리보기"></div><input id="bottomBannerLeft" data-image-path="bottomBannerLeft" placeholder="/assets/banner-left.jpg"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-upload="bottomBannerLeft"></div>
          <div class="form-field image-field"><label>하단 우측 배너</label><div class="image-preview banner-preview"><img data-image-preview="bottomBannerRight" alt="하단 우측 배너 미리보기"></div><input id="bottomBannerRight" data-image-path="bottomBannerRight" placeholder="/assets/banner-right.jpg"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-upload="bottomBannerRight"></div>
          <div class="form-field full">
            <div class="popup-manager-head">
              <div>
                <h2>팝업 창 관리</h2>
                <p class="admin-help">팝업 창 갯수를 정하고 각 팝업의 이미지, 위치, 크기, 사용 여부를 조정할 수 있습니다.</p>
              </div>
              <button class="btn secondary" type="button" data-add-popup>팝업 추가</button>
            </div>
            <div class="popup-count-control">
              <label for="popupCount">팝업 창 갯수</label>
              <input id="popupCount" type="number" min="0" max="20" step="1">
              <button class="btn ghost" type="button" data-apply-popup-count>갯수 적용</button>
            </div>
            <div id="popupsEditor" class="popup-editor-list"></div>
          </div>
        </div>
      </div>
      <button class="btn" type="button" data-save-site>저장</button>
    </section>

    <section class="admin-panel" data-admin-panel="form">
      <div class="admin-card">
        <div class="admin-grid">
          <div class="form-field full"><label>컨설턴트 선택지</label><textarea id="consultants" readonly></textarea><small>컨설턴트는 계정관리 탭에서 추가하거나 비밀번호를 설정하면 신청 폼에도 자동 반영됩니다.</small></div>
          <div class="form-field full"><label>장소</label><textarea id="places"></textarea></div>
          <div class="form-field full"><label>상담 가능 시간</label><textarea id="times"></textarea></div>
          <div class="form-field full"><label>거주지</label><textarea id="residences"></textarea></div>
          <div class="form-field full"><label>상담 희망 내용 기본값</label><textarea id="defaultContent"></textarea></div>
        </div>
      </div>
      <button class="btn" type="button" data-save-site>저장</button>
    </section>

    <section class="admin-panel" data-admin-panel="boards">
      <div id="boardsEditor"></div>
      <div class="admin-card">
        <div class="admin-grid">
          <div class="form-field full"><label>일정</label><textarea id="schedule"></textarea></div>
          <div class="form-field full"><label>공지 탭/게시물</label><textarea id="noticeTabs"></textarea></div>
        </div>
      </div>
      <button class="btn" type="button" data-save-site>저장</button>
    </section>

    <section class="admin-panel" data-admin-panel="users">
      <div class="admin-card">
        <h2>계정관리</h2>
        <p class="admin-help">관리자는 페이지 내용을 수정할 수 있고, 컨설턴트는 배정된 신청자만 확인할 수 있습니다.</p>
        <div class="table-wrap"><table class="admin-table account-table" id="usersTable"></table></div>
        <div class="admin-grid account-add">
          <div class="form-field"><label>아이디</label><input id="newUserId" placeholder="consultant1"></div>
          <div class="form-field"><label>이름</label><input id="newUserName" placeholder="컨설턴트 이름"></div>
          <div class="form-field"><label>비밀번호</label><input id="newUserPassword" type="password" placeholder="비밀번호"></div>
          <div class="form-field"><label>&nbsp;</label><button class="btn" type="button" data-add-user>컨설턴트 추가</button></div>
        </div>
      </div>
      <button class="btn" type="button" data-save-users>계정 저장</button>
    </section>` : ""}

    <section class="admin-panel" data-admin-panel="password">
      <div class="admin-card">
        <h2>비밀번호 변경</h2>
        <div class="admin-grid">
          <div class="form-field"><label>현재 비밀번호</label><input id="currentPassword" type="password"></div>
          <div class="form-field"><label>새 비밀번호</label><input id="newPassword" type="password"></div>
          <div class="form-field"><label>새 비밀번호 확인</label><input id="newPasswordConfirm" type="password"></div>
          <div class="form-field"><label>&nbsp;</label><button class="btn" type="button" data-change-password>변경</button></div>
        </div>
      </div>
    </section>
  </main>
  <script>
let site = null;
let applications = [];
let users = [];
const currentUser = ${JSON.stringify({ id: user.id, name: user.name, role: user.role })};
const msg = document.getElementById("adminMessage");

function lines(value) {
  return String(value || "").split("\\n").map((line) => line.trim()).filter(Boolean);
}

function setMessage(text, isError = false) {
  msg.className = isError ? "message error" : "message";
  msg.textContent = text;
}

function getById(id) {
  return document.getElementById(id);
}

function h(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

const editableImageTargets = ["logo", "mainBanner", "bottomBannerLeft", "bottomBannerRight"];

function findByData(name, value) {
  const attr = name.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
  return [...document.querySelectorAll("[data-" + attr + "]")].find((node) => node.dataset[name] === value);
}

function popupDefaults(index) {
  return { id: "popup" + (index + 1), enabled: false, image: "", left: 10 + (index % 3) * 470, top: 10 + Math.floor(index / 3) * 70, width: 450, height: 800 };
}

function updateImagePreview(target) {
  const input = findByData("imagePath", target);
  const preview = findByData("imagePreview", target);
  if (!input || !preview) return;
  const value = input.value.trim();
  preview.style.display = value ? "block" : "none";
  if (value) preview.src = value;
}

function updateImagePreviews() {
  editableImageTargets.forEach(updateImagePreview);
  (site?.popups || []).forEach((_, index) => updateImagePreview("popupImage:" + index));
}

function collectPopups() {
  if (!site) return [];
  site.popups = [...document.querySelectorAll("[data-popup-index]")].map((card, index) => {
    const field = (name) => card.querySelector('[data-popup-field="' + name + '"]');
    return {
      id: field("id")?.value.trim() || "popup" + (index + 1),
      enabled: Boolean(field("enabled")?.checked),
      image: field("image")?.value.trim() || "",
      left: Number(field("left")?.value) || 0,
      top: Number(field("top")?.value) || 0,
      width: Number(field("width")?.value) || 450,
      height: Number(field("height")?.value) || 800
    };
  });
  return site.popups;
}

function renderPopupsEditor() {
  const holder = getById("popupsEditor");
  if (!holder) return;
  site.popups = Array.isArray(site.popups) ? site.popups : [];
  getById("popupCount").value = site.popups.length;
  holder.innerHTML = site.popups.map((popup, index) => {
    const raw = popup || {};
    const item = { ...popupDefaults(index), ...raw, id: raw.id || "popup" + (index + 1) };
    const target = "popupImage:" + index;
    return '<div class="admin-card popup-edit-card" data-popup-index="' + index + '">' +
      '<div class="popup-edit-head">' +
        '<h3>팝업 ' + (index + 1) + '</h3>' +
        '<div class="popup-edit-actions"><label><input type="checkbox" data-popup-field="enabled" ' + (item.enabled ? "checked" : "") + '> 사용</label><button class="btn ghost" type="button" data-remove-popup="' + index + '">삭제</button></div>' +
      '</div>' +
      '<input type="hidden" data-popup-field="id" value="' + h(item.id) + '">' +
      '<div class="admin-grid popup-grid">' +
        '<div class="form-field image-field full"><label>이미지</label><div class="image-preview popup-preview"><img data-image-preview="' + h(target) + '" alt="팝업 ' + (index + 1) + ' 미리보기"></div><input data-popup-field="image" data-image-path="' + h(target) + '" value="' + h(item.image) + '" placeholder="/assets/popup.png"><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-image-upload="' + h(target) + '"></div>' +
        '<div class="form-field"><label>왼쪽 위치(px)</label><input type="number" data-popup-field="left" value="' + h(item.left) + '"></div>' +
        '<div class="form-field"><label>위쪽 위치(px)</label><input type="number" data-popup-field="top" value="' + h(item.top) + '"></div>' +
        '<div class="form-field"><label>가로 크기(px)</label><input type="number" min="120" data-popup-field="width" value="' + h(item.width) + '"></div>' +
        '<div class="form-field"><label>세로 크기(px)</label><input type="number" min="120" data-popup-field="height" value="' + h(item.height) + '"></div>' +
      '</div>' +
    '</div>';
  }).join("") || '<p class="admin-help">현재 등록된 팝업 창이 없습니다.</p>';
  updateImagePreviews();
}

function setPopupCount(count) {
  collectPopups();
  const nextCount = Math.max(0, Math.min(20, Number(count) || 0));
  while (site.popups.length < nextCount) site.popups.push(popupDefaults(site.popups.length));
  site.popups = site.popups.slice(0, nextCount);
  renderPopupsEditor();
  setMessage("팝업 창 갯수가 변경되었습니다. 저장을 눌러 반영하세요.");
}

function navDefaults(index) {
  return { title: "새 메뉴 " + (index + 1), href: "#", children: [] };
}

function childDefaults(index) {
  return { title: "새 하위 메뉴 " + (index + 1), href: "#" };
}

function collectNav() {
  if (!site) return [];
  site.nav = [...document.querySelectorAll("[data-nav-index]")].map((card) => ({
    title: card.querySelector('[data-nav-field="title"]').value.trim(),
    href: card.querySelector('[data-nav-field="href"]').value.trim() || "#",
    children: [...card.querySelectorAll("[data-nav-child]")].map((row) => ({
      title: row.querySelector('[data-child-field="title"]').value.trim(),
      href: row.querySelector('[data-child-field="href"]').value.trim() || "#"
    })).filter((child) => child.title)
  })).filter((item) => item.title);
  return site.nav;
}

function renderNavEditor() {
  const holder = getById("navEditor");
  if (!holder) return;
  site.nav = Array.isArray(site.nav) ? site.nav : [];
  holder.innerHTML = site.nav.map((item, index) => {
    const nav = { ...navDefaults(index), ...item, children: Array.isArray(item.children) ? item.children : [] };
    const children = nav.children.map((child, childIndex) => {
      const row = { ...childDefaults(childIndex), ...child };
      return '<div class="nav-child-row" data-nav-child="' + childIndex + '">' +
        '<div class="form-field"><label>하위 메뉴명</label><input data-child-field="title" value="' + h(row.title) + '"></div>' +
        '<div class="form-field"><label>연결 경로</label><input data-child-field="href" value="' + h(row.href) + '"></div>' +
        '<button class="btn ghost" type="button" data-remove-nav-child="' + index + ':' + childIndex + '">삭제</button>' +
      '</div>';
    }).join("");
    return '<div class="nav-edit-card" data-nav-index="' + index + '">' +
      '<div class="nav-edit-head">' +
        '<h3>상위 메뉴 ' + (index + 1) + '</h3>' +
        '<div class="nav-edit-actions"><button class="btn ghost" type="button" data-add-nav-child="' + index + '">하위 메뉴 추가</button><button class="btn ghost" type="button" data-remove-nav="' + index + '">상위 메뉴 삭제</button></div>' +
      '</div>' +
      '<div class="admin-grid nav-grid">' +
        '<div class="form-field"><label>상위 메뉴명</label><input data-nav-field="title" value="' + h(nav.title) + '"></div>' +
        '<div class="form-field"><label>연결 경로</label><input data-nav-field="href" value="' + h(nav.href) + '"></div>' +
      '</div>' +
      '<div class="nav-child-list">' + children + '</div>' +
    '</div>';
  }).join("") || '<p class="admin-help">등록된 상단 메뉴가 없습니다.</p>';
}

function renderContentPagesEditor() {
  const holder = getById("contentPagesEditor");
  holder.innerHTML = (site.contentPages || []).map((page, index) =>
    '<div class="admin-card admin-edit-card" data-content-page="' + index + '">' +
      '<h2>' + h(page.title || "메뉴 내용") + '</h2>' +
      '<div class="admin-grid">' +
        '<div class="form-field"><label>경로</label><input data-field="path" value="' + h(page.path) + '"></div>' +
        '<div class="form-field"><label>상위 메뉴</label><input data-field="crumb" value="' + h(page.crumb) + '"></div>' +
        '<div class="form-field"><label>제목</label><input data-field="title" value="' + h(page.title) + '"></div>' +
        '<div class="form-field"><label>부제목</label><input data-field="subtitle" value="' + h(page.subtitle) + '"></div>' +
        '<div class="form-field full"><label>본문 HTML</label><textarea data-field="html">' + h(page.html) + '</textarea></div>' +
        '<div class="form-field"><label>신청 버튼 문구</label><input data-field="ctaText" value="' + h(page.ctaText) + '"></div>' +
        '<div class="form-field"><label>신청 버튼 경로</label><input data-field="ctaHref" value="' + h(page.ctaHref) + '"></div>' +
      '</div>' +
    '</div>'
  ).join("");
}

function renderBoardsEditor() {
  const holder = getById("boardsEditor");
  holder.innerHTML = (site.boards || []).map((board, index) => {
    const items = (board.items || []).map((item) => [item.title || "", item.date || "", item.html || ""].join("|")).join("\\n");
    return '<div class="admin-card admin-edit-card" data-board="' + index + '">' +
      '<h2>' + h(board.title || "게시판") + '</h2>' +
      '<div class="admin-grid">' +
        '<div class="form-field"><label>경로</label><input data-field="path" value="' + h(board.path) + '"></div>' +
        '<div class="form-field"><label>상위 메뉴</label><input data-field="crumb" value="' + h(board.crumb) + '"></div>' +
        '<div class="form-field"><label>게시판명</label><input data-field="title" value="' + h(board.title) + '"></div>' +
        '<div class="form-field"><label>설명</label><input data-field="description" value="' + h(board.description) + '"></div>' +
        '<div class="form-field full"><label>게시물</label><textarea data-field="items">' + h(items) + '</textarea><small>한 줄에 하나씩: 제목|날짜|본문 HTML</small></div>' +
      '</div>' +
    '</div>';
  }).join("");
}

function renderUsersEditor() {
  const holder = getById("usersTable");
  if (!holder) return;
  const rows = users.map((user) => '<tr data-user-row="' + h(user.id) + '">' +
    '<td><input data-user-field="id" value="' + h(user.id) + '" readonly></td>' +
    '<td><input data-user-field="name" value="' + h(user.name) + '"></td>' +
    '<td><select data-user-field="role"><option value="admin" ' + (user.role === "admin" ? "selected" : "") + '>관리자</option><option value="consultant" ' + (user.role === "consultant" ? "selected" : "") + '>컨설턴트</option></select></td>' +
    '<td><input data-user-field="password" type="password" value="' + h(user.password) + '"></td>' +
    '<td>' + (user.id === "admin" ? '<span class="notice-tag">기본 관리자</span>' : '<button class="btn ghost" type="button" data-remove-user="' + h(user.id) + '">삭제</button>') + '</td>' +
  '</tr>').join("");
  holder.innerHTML = '<thead><tr><th>아이디</th><th>이름</th><th>권한</th><th>비밀번호</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
}

async function loadAdmin() {
  const appsResponse = await fetch("/api/admin/applications");
  applications = await appsResponse.json();
  if (currentUser.role === "admin") {
    const [siteResponse, usersResponse] = await Promise.all([fetch("/api/admin/site"), fetch("/api/admin/users")]);
    site = await siteResponse.json();
    users = await usersResponse.json();
    fillEditors();
    renderUsersEditor();
  }
  renderApplications();
}

function fillEditors() {
  if (!site) return;
  getById("siteName").value = site.siteName || "";
  getById("copyright").value = site.copyright || "";
  getById("footerAddress").value = site.footerAddress || "";
  getById("consultingPageTitle").value = site.consulting.pageTitle || "";
  getById("consultingNoticeTitle").value = site.consulting.noticeTitle || "";
  getById("consultingNoticeSubtitle").value = site.consulting.noticeSubtitle || "";
  getById("consultingNoticeHtml").value = site.consulting.noticeHtml || "";
  getById("businessTitle").value = site.home.businessTitle || "";
  getById("ctaText").value = site.home.ctaText || "";
  getById("businessHtml").value = site.home.businessHtml || "";
  getById("logo").value = site.logo || "";
  getById("mainBanner").value = site.home.mainBanner || "";
  getById("bottomBannerLeft").value = site.home.bottomBannerLeft || "";
  getById("bottomBannerRight").value = site.home.bottomBannerRight || "";
  getById("consultants").value = site.form.consultants.map((item) => item.id + "|" + item.name).join("\\n");
  getById("places").value = site.form.places.join("\\n");
  getById("times").value = site.form.times.join("\\n");
  getById("residences").value = site.form.residences.join("\\n");
  getById("defaultContent").value = site.form.defaultContent || "";
  getById("schedule").value = site.schedule.map((item) => item.title + "|" + item.start + "|" + item.end).join("\\n");
  getById("noticeTabs").value = site.noticeTabs.map((tab) => {
    const items = (tab.items || []).map((item) => item.tag + "::" + item.title + "::" + item.href).join(";");
    return tab.id + "|" + tab.label + "|" + tab.moreLabel + "|" + tab.href + "|" + items;
  }).join("\\n");
  renderPopupsEditor();
  updateImagePreviews();
  renderNavEditor();
  renderContentPagesEditor();
  renderBoardsEditor();
}

function collectSite() {
  if (!site) return;
  site.siteName = getById("siteName").value.trim();
  site.copyright = getById("copyright").value.trim();
  site.footerAddress = getById("footerAddress").value.trim();
  site.consulting.pageTitle = getById("consultingPageTitle").value.trim();
  site.consulting.noticeTitle = getById("consultingNoticeTitle").value.trim();
  site.consulting.noticeSubtitle = getById("consultingNoticeSubtitle").value.trim();
  site.consulting.noticeHtml = getById("consultingNoticeHtml").value;
  site.home.businessTitle = getById("businessTitle").value.trim();
  site.home.ctaText = getById("ctaText").value.trim();
  site.home.businessHtml = getById("businessHtml").value;
  site.logo = getById("logo").value.trim();
  site.home.mainBanner = getById("mainBanner").value.trim();
  site.home.bottomBannerLeft = getById("bottomBannerLeft").value.trim();
  site.home.bottomBannerRight = getById("bottomBannerRight").value.trim();
  collectPopups();
  collectNav();
  site.form.places = lines(getById("places").value);
  site.form.times = lines(getById("times").value);
  site.form.residences = lines(getById("residences").value);
  site.form.defaultContent = getById("defaultContent").value;
  site.schedule = lines(getById("schedule").value).map((line) => {
    const [title, start, end] = line.split("|");
    return { title: (title || "").trim(), start: (start || "").trim(), end: (end || start || "").trim() };
  }).filter((item) => item.title && item.start);
  site.noticeTabs = lines(getById("noticeTabs").value).map((line) => {
    const [id, label, moreLabel, href, rawItems = ""] = line.split("|");
    const items = rawItems.split(";").map((entry) => {
      const [tag, title, itemHref] = entry.split("::");
      return { tag: (tag || "").trim(), title: (title || "").trim(), href: (itemHref || "#").trim() };
    }).filter((item) => item.tag && item.title);
    return { id: (id || "").trim(), label: (label || "").trim(), moreLabel: (moreLabel || "").trim(), href: (href || "#").trim(), items };
  }).filter((tab) => tab.id && tab.label);
  site.contentPages = [...document.querySelectorAll("[data-content-page]")].map((card) => {
    const page = {
      path: card.querySelector('[data-field="path"]').value.trim(),
      crumb: card.querySelector('[data-field="crumb"]').value.trim(),
      title: card.querySelector('[data-field="title"]').value.trim(),
      subtitle: card.querySelector('[data-field="subtitle"]').value.trim(),
      html: card.querySelector('[data-field="html"]').value
    };
    const ctaText = card.querySelector('[data-field="ctaText"]').value.trim();
    const ctaHref = card.querySelector('[data-field="ctaHref"]').value.trim();
    if (ctaText) page.ctaText = ctaText;
    if (ctaHref) page.ctaHref = ctaHref;
    return page;
  }).filter((page) => page.path && page.title);
  site.boards = [...document.querySelectorAll("[data-board]")].map((card) => ({
    path: card.querySelector('[data-field="path"]').value.trim(),
    crumb: card.querySelector('[data-field="crumb"]').value.trim(),
    title: card.querySelector('[data-field="title"]').value.trim(),
    description: card.querySelector('[data-field="description"]').value.trim(),
    items: lines(card.querySelector('[data-field="items"]').value).map((line) => {
      const [title, date, html = ""] = line.split("|");
      return { title: (title || "").trim(), date: (date || "").trim(), html: html.trim() };
    }).filter((item) => item.title)
  })).filter((board) => board.path && board.title);
}

async function saveSite() {
  if (currentUser.role !== "admin") return setMessage("페이지 수정 권한이 없습니다.", true);
  collectSite();
  const response = await fetch("/api/admin/site", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(site) });
  if (!response.ok) {
    setMessage("저장에 실패했습니다.", true);
    return;
  }
  setMessage("저장되었습니다.");
}

async function uploadImage(input) {
  if (currentUser.role !== "admin") return setMessage("이미지 수정 권한이 없습니다.", true);
  const file = input.files?.[0];
  if (!file) return;
  const target = input.dataset.imageUpload;
  const formData = new FormData();
  formData.append("target", target);
  formData.append("file", file);
  setMessage("이미지를 업로드하는 중입니다...");
  const response = await fetch("/api/admin/upload-image", { method: "POST", body: formData });
  const result = await response.json();
  input.value = "";
  if (!response.ok) {
    setMessage(result.error || "이미지 업로드에 실패했습니다.", true);
    return;
  }
  site = result.site || site;
  const imagePathInput = findByData("imagePath", target);
  if (imagePathInput) imagePathInput.value = result.path;
  updateImagePreview(target);
  setMessage("이미지가 변경되었습니다.");
}

async function saveUsers() {
  if (currentUser.role !== "admin") return setMessage("계정 수정 권한이 없습니다.", true);
  users = [...document.querySelectorAll("[data-user-row]")].map((row) => ({
    id: row.querySelector('[data-user-field="id"]').value.trim(),
    name: row.querySelector('[data-user-field="name"]').value.trim(),
    role: row.querySelector('[data-user-field="role"]').value,
    password: row.querySelector('[data-user-field="password"]').value
  })).filter((user) => user.id && user.name && user.password);
  if (!users.some((user) => user.id === "admin" && user.role === "admin")) {
    setMessage("admin 관리자 계정은 반드시 필요합니다.", true);
    return;
  }
  const response = await fetch("/api/admin/users", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(users) });
  const result = await response.json();
  if (!response.ok) {
    setMessage(result.error || "계정 저장에 실패했습니다.", true);
    return;
  }
  users = result.users;
  if (site) site.form.consultants = users.filter((user) => user.role === "consultant").map((user) => ({ id: user.id, name: user.name }));
  fillEditors();
  renderUsersEditor();
  setMessage("계정이 저장되었습니다.");
}

async function changePassword() {
  const currentPassword = getById("currentPassword").value;
  const newPassword = getById("newPassword").value;
  const confirmPassword = getById("newPasswordConfirm").value;
  if (!currentPassword || !newPassword) return setMessage("현재 비밀번호와 새 비밀번호를 입력해주세요.", true);
  if (newPassword !== confirmPassword) return setMessage("새 비밀번호 확인이 일치하지 않습니다.", true);
  const response = await fetch("/api/admin/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
  const result = await response.json();
  if (!response.ok) {
    setMessage(result.error || "비밀번호 변경에 실패했습니다.", true);
    return;
  }
  getById("currentPassword").value = "";
  getById("newPassword").value = "";
  getById("newPasswordConfirm").value = "";
  setMessage("비밀번호가 변경되었습니다.");
}

function renderApplications() {
  const total = applications.length;
  const pending = applications.filter((item) => item.status === "접수").length;
  const confirmed = applications.filter((item) => item.status === "확정").length;
  const canceled = applications.filter((item) => item.status === "취소").length;
  document.getElementById("metrics").innerHTML = [
    ["전체", total],
    ["접수", pending],
    ["확정", confirmed],
    ["취소", canceled]
  ].map(([label, value]) => '<div class="metric"><span>' + label + '</span><strong>' + value + '</strong></div>').join("");
  const adminMode = currentUser.role === "admin";
  const rows = applications.map((item) => '<tr>' +
    '<td>' + h(item.createdAt.slice(0, 10)) + '</td>' +
    '<td>' + h(item.programTitle || '1:1 맞춤형 컨설팅') + '</td>' +
    '<td>' + (adminMode ? '<select class="status-select" data-status="' + h(item.id) + '"><option ' + (item.status === "접수" ? "selected" : "") + '>접수</option><option ' + (item.status === "확정" ? "selected" : "") + '>확정</option><option ' + (item.status === "취소" ? "selected" : "") + '>취소</option></select>' : h(item.status)) + '</td>' +
    '<td>' + h(item.consultantName) + '</td>' +
    '<td>' + h(item.date + ' ' + item.time) + '</td>' +
    '<td>' + h(item.place) + '</td>' +
    '<td>' + h(item.school) + '</td>' +
    '<td>' + h(item.grade) + '</td>' +
    '<td>' + h(item.studentName) + '</td>' +
    '<td>' + h(item.applicantType) + '</td>' +
    '<td>' + h(item.parentPhone) + '</td>' +
    '<td>' + h(item.studentPhone) + '</td>' +
    '<td><a class="btn ghost" href="/admin/applications/' + encodeURIComponent(item.id) + '">상세</a>' + (adminMode ? ' <button class="btn ghost" type="button" data-delete="' + h(item.id) + '">삭제</button>' : '') + '</td>' +
  '</tr>').join("");
  document.getElementById("applicationsTable").innerHTML = '<thead><tr><th>신청일</th><th>프로그램</th><th>상태</th><th>컨설턴트</th><th>날짜/시간</th><th>장소</th><th>학교</th><th>학년</th><th>학생이름</th><th>신청자</th><th>학부모연락처</th><th>학생연락처</th><th></th></tr></thead><tbody>' + rows + '</tbody>';
}

document.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-admin-tab]");
  if (tab) {
    document.querySelectorAll("[data-admin-tab]").forEach((node) => node.classList.remove("active"));
    document.querySelectorAll("[data-admin-panel]").forEach((node) => node.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector('[data-admin-panel="' + tab.dataset.adminTab + '"]').classList.add("active");
  }
  if (event.target.closest("[data-save-site]")) saveSite();
  if (event.target.closest("[data-save-users]")) saveUsers();
  if (event.target.closest("[data-change-password]")) changePassword();
  const addPopup = event.target.closest("[data-add-popup]");
  if (addPopup) {
    collectPopups();
    site.popups.push(popupDefaults(site.popups.length));
    renderPopupsEditor();
    setMessage("팝업 창이 추가되었습니다. 저장을 눌러 반영하세요.");
  }
  const applyPopupCount = event.target.closest("[data-apply-popup-count]");
  if (applyPopupCount) {
    setPopupCount(getById("popupCount").value);
  }
  const removePopup = event.target.closest("[data-remove-popup]");
  if (removePopup) {
    collectPopups();
    site.popups.splice(Number(removePopup.dataset.removePopup), 1);
    renderPopupsEditor();
    setMessage("팝업 창이 삭제되었습니다. 저장을 눌러 반영하세요.");
  }
  const addNav = event.target.closest("[data-add-nav]");
  if (addNav) {
    collectNav();
    site.nav.push(navDefaults(site.nav.length));
    renderNavEditor();
    setMessage("상위 메뉴가 추가되었습니다. 저장을 눌러 반영하세요.");
  }
  const removeNav = event.target.closest("[data-remove-nav]");
  if (removeNav) {
    collectNav();
    site.nav.splice(Number(removeNav.dataset.removeNav), 1);
    renderNavEditor();
    setMessage("상위 메뉴가 삭제되었습니다. 저장을 눌러 반영하세요.");
  }
  const addNavChild = event.target.closest("[data-add-nav-child]");
  if (addNavChild) {
    collectNav();
    const index = Number(addNavChild.dataset.addNavChild);
    site.nav[index].children ||= [];
    site.nav[index].children.push(childDefaults(site.nav[index].children.length));
    renderNavEditor();
    setMessage("하위 메뉴가 추가되었습니다. 저장을 눌러 반영하세요.");
  }
  const removeNavChild = event.target.closest("[data-remove-nav-child]");
  if (removeNavChild) {
    collectNav();
    const [navIndex, childIndex] = removeNavChild.dataset.removeNavChild.split(":").map(Number);
    site.nav[navIndex]?.children?.splice(childIndex, 1);
    renderNavEditor();
    setMessage("하위 메뉴가 삭제되었습니다. 저장을 눌러 반영하세요.");
  }
  const addUser = event.target.closest("[data-add-user]");
  if (addUser) {
    const id = getById("newUserId").value.trim();
    const name = getById("newUserName").value.trim();
    const password = getById("newUserPassword").value;
    if (!id || !name || !password) {
      setMessage("아이디, 이름, 비밀번호를 입력해주세요.", true);
      return;
    }
    if (users.some((user) => user.id === id)) {
      setMessage("이미 있는 아이디입니다.", true);
      return;
    }
    users.push({ id, name, role: "consultant", password });
    getById("newUserId").value = "";
    getById("newUserName").value = "";
    getById("newUserPassword").value = "";
    renderUsersEditor();
    setMessage("컨설턴트가 추가되었습니다. 계정 저장을 눌러 반영하세요.");
  }
  const removeUser = event.target.closest("[data-remove-user]");
  if (removeUser) {
    users = users.filter((user) => user.id !== removeUser.dataset.removeUser);
    renderUsersEditor();
    setMessage("컨설턴트가 삭제되었습니다. 계정 저장을 눌러 반영하세요.");
  }
  const remove = event.target.closest("[data-delete]");
  if (remove && confirm("삭제하시겠습니까?")) {
    await fetch("/api/admin/applications/" + remove.dataset.delete, { method: "DELETE" });
    applications = applications.filter((item) => item.id !== remove.dataset.delete);
    renderApplications();
    setMessage("삭제되었습니다.");
  }
});

document.addEventListener("change", async (event) => {
  const upload = event.target.closest("[data-image-upload]");
  if (upload) {
    uploadImage(upload);
    return;
  }
  const select = event.target.closest("[data-status]");
  if (!select) return;
  if (currentUser.role !== "admin") return;
  await fetch("/api/admin/applications/" + select.dataset.status, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: select.value })
  });
  applications = applications.map((item) => item.id === select.dataset.status ? { ...item, status: select.value } : item);
  renderApplications();
  setMessage("상태가 변경되었습니다.");
});

document.addEventListener("input", (event) => {
  const imagePath = event.target.closest("[data-image-path]");
  if (imagePath) updateImagePreview(imagePath.dataset.imagePath);
});

loadAdmin().catch(() => setMessage("관리자 데이터를 불러오지 못했습니다.", true));
  </script>
</body>
</html>`;
}

function renderAdminApplicationDetail(site, application, user) {
  const rows = [
    ["프로그램", application.programTitle || "1:1 맞춤형 컨설팅"],
    ["상태", application.status],
    ["신청일", application.createdAt],
    ["신청자", application.applicantType],
    ["컨설턴트", `${application.consultantName} (${application.consultantId})`],
    ["장소", application.place],
    ["날짜/시간", `${application.date} ${application.time}`],
    ["거주지", application.residence],
    ["학생 이름", application.studentName],
    ["학부모 연락처", application.parentPhone],
    ["학생 연락처", application.studentPhone],
    ["학교명", application.school],
    ["학년", application.grade],
    ["상담 희망 내용", nl2br(application.content || "")]
  ];
  const body = `<main class="admin-shell">
    <div class="admin-topbar">
      <div><h1>참가신청 상세내용</h1><p class="message">${escapeHtml(user.name)}님이 확인 중입니다.</p></div>
      <div class="admin-actions">
        <a class="btn ghost" href="/admin">관리자 목록</a>
        <form method="post" action="/admin/logout"><button class="btn ghost" type="submit">로그아웃</button></form>
      </div>
    </div>
    <article class="admin-card">
      <table class="detail-table">
        <tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${label === "상담 희망 내용" ? value : escapeHtml(value || "")}</td></tr>`).join("")}</tbody>
      </table>
    </article>
  </main>`;
  return pageShell(site, "참가신청 상세내용", body);
}

function renderSimplePage(title, content) {
  const site = { siteName: "기장군 진학진로 지원센터", logo: "/assets/logo.png", nav: [], footerAddress: "", copyright: "" };
  return pageShell(site, title, `<main class="container">${content}</main>`);
}

function validateApplication(payload) {
  const required = ["applicantType", "consultantId", "consultantName", "place", "date", "time", "residence", "studentName", "parentPhone", "studentPhone", "school", "grade", "password", "content"];
  const missing = required.filter((key) => !String(payload[key] || "").trim());
  if (missing.length) return `${missing[0]} 항목이 필요합니다.`;
  return "";
}

function normalizeSlotValue(value = "") {
  return String(value).trim().replace(/\s+/g, " ");
}

function findDuplicateApplicationSlot(applications, payload) {
  const consultantId = normalizeSlotValue(payload.consultantId);
  const date = normalizeSlotValue(payload.date);
  const time = normalizeSlotValue(payload.time);
  return applications.find((item) => (
    item.status !== "취소" &&
    normalizeSlotValue(item.consultantId) === consultantId &&
    normalizeSlotValue(item.date) === date &&
    normalizeSlotValue(item.time) === time
  ));
}

function publicApplication(item) {
  return {
    id: item.id,
    programTitle: item.programTitle,
    status: item.status,
    consultantName: item.consultantName,
    place: item.place,
    date: item.date,
    time: item.time,
    school: item.school,
    grade: item.grade
  };
}

function excelEscape(value = "") {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function exportApplicationsXls(applications) {
  const headers = ["신청일", "프로그램", "상태", "컨설턴트", "장소", "날짜/시간", "거주지", "학부모연락처", "학생이름", "학생연락처", "학교명", "학년", "상담희망내용"];
  const rows = applications.map((item) => [
    item.createdAt,
    item.programTitle || "1:1 맞춤형 컨설팅",
    item.status,
    item.consultantName,
    item.place,
    `${item.date} ${item.time}`,
    item.residence,
    item.parentPhone,
    item.studentName,
    item.studentPhone,
    item.school,
    item.grade,
    item.content
  ]);
  return `<!doctype html><html><head><meta charset="utf-8"><style>.txt{mso-number-format:'\\@'}</style></head><body><table>
    <tr>${headers.map((header) => `<td>${escapeHtml(header)}</td>`).join("")}</tr>
    ${rows.map((row) => `<tr>${row.map((cell) => `<td class="txt">${excelEscape(cell)}</td>`).join("")}</tr>`).join("")}
  </table></body></html>`;
}

async function serveStatic(req, res, pathname) {
  const filePath = path.normalize(path.join(publicDir, pathname.replace(/^\/+/, "")));
  if (!filePath.startsWith(publicDir)) return notFound(res);
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return notFound(res);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  } catch {
    notFound(res);
  }
}

async function deploymentAssetChecks() {
  return Promise.all(deploymentAssetPaths.map(async (assetPath) => {
    const filePath = path.normalize(path.join(publicDir, assetPath.replace(/^\/+/, "")));
    try {
      const info = await stat(filePath);
      return { path: assetPath, ok: info.isFile(), bytes: info.size };
    } catch {
      return { path: assetPath, ok: false, bytes: 0 };
    }
  }));
}

async function renderAssetCheckPage(site) {
  const checks = await deploymentAssetChecks();
  const rows = checks.map((item) => `<tr>
    <td><a href="${escapeHtml(item.path)}" target="_blank" rel="noreferrer">${escapeHtml(item.path)}</a></td>
    <td class="${item.ok ? "ok" : "bad"}">${item.ok ? "OK" : "MISSING"}</td>
    <td>${item.bytes ? `${Math.round(item.bytes / 1024)} KB` : "-"}</td>
  </tr>`).join("");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>배포 점검 | ${escapeHtml(site.siteName || "기장군 진학진로 지원센터")}</title>
  <style>
    body { margin: 0; padding: 32px; color: #1f2937; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif; line-height: 1.5; }
    main { max-width: 920px; margin: 0 auto; }
    h1 { margin: 0 0 10px; font-size: 28px; }
    p { color: #526070; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 12px 10px; text-align: left; }
    th { background: #f8fafc; }
    a { color: #0f5f9f; }
    .ok { color: #057a55; font-weight: 800; }
    .bad { color: #c2410c; font-weight: 800; }
    .box { margin-top: 22px; padding: 16px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
</head>
<body>
  <main>
    <h1>배포 점검</h1>
    <p>이 페이지가 보이면 Node 서버는 실행 중입니다. 아래 항목이 모두 OK여야 CSS, 로고, 팝업 이미지가 정상 표시됩니다.</p>
    <table>
      <thead><tr><th>경로</th><th>상태</th><th>크기</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="box">
      <strong>호스팅에서 화면이 파란 링크/기본 목록처럼 보일 때</strong>
      <p><code>/styles.css</code> 또는 <code>/assets/*</code> 파일이 404인지 확인하세요. 일반 정적 웹호스팅에 HTML만 올린 경우 관리자 기능과 이미지 수정 기능은 동작하지 않습니다.</p>
    </div>
  </main>
</body>
</html>`;
}

function applicationsForUser(applications, user) {
  if (user?.role === "admin") return applications;
  return applications.filter((application) => application.consultantId === user?.id);
}

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  const site = await readJson(siteFile, {});
  const readMethod = req.method === "GET" || req.method === "HEAD";

  if (pathname.startsWith("/assets/") || pathname === "/styles.css") {
    return serveStatic(req, res, pathname);
  }

  if (readMethod && pathname === "/health") {
    const assets = await deploymentAssetChecks();
    return req.method === "HEAD"
      ? sendHead(res, { "Content-Type": "application/json; charset=utf-8" })
      : sendJson(res, { ok: true, app: "gijang-center", assets });
  }

  if (readMethod && pathname === "/asset-check") {
    return req.method === "HEAD"
      ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" })
      : sendHtml(res, await renderAssetCheckPage(site));
  }

  if (readMethod && pathname === "/api/session") {
    const user = getSession(req);
    return req.method === "HEAD"
      ? sendHead(res, { "Content-Type": "application/json; charset=utf-8" })
      : sendJson(res, user ? { authed: true, id: user.id, name: user.name, role: user.role } : { authed: false });
  }

  if (readMethod && (pathname === "/" || pathname === "/index.html")) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderHome(site));
  if (readMethod && (pathname === "/content/11맞춤형컨설팅/" || pathname === "/consulting")) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderConsulting(site));
  if (readMethod && pathname === "/04sub01") {
    const user = getSession(req);
    if (!user && url.searchParams.get("submitted") === "1") {
      return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderApplicationSubmitted(site));
    }
    if (!user) return redirect(res, "/admin");
    const applications = user ? applicationsForUser(await readJson(applicationsFile, []), user) : await readJson(applicationsFile, []);
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderApplicationConfirmList(site, applications, Boolean(user), url.searchParams.get("submitted") === "1"));
  }
  const writeProgram = findWriteProgram(site, pathname);
  if (readMethod && (pathname === "/04sub01/write" || pathname === "/bbs/write.php" || writeProgram)) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderWriteForm(site, writeProgram || undefined));
  if (readMethod && (pathname === "/content/컨설턴트-신청확인/" || pathname === "/check")) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderLookup(site));
  if (readMethod && pathname === "/05sub06") {
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderCenterSchedule(site, url.searchParams.get("date") || ""));
  }
  if (readMethod && pathname.startsWith("/05sub06/schedule/")) {
    const index = Number(pathname.split("/").pop());
    const detail = Number.isInteger(index) ? renderCenterScheduleDetail(site, index) : null;
    return detail ? (req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, detail)) : notFound(res);
  }
  const contentPage = findContentPage(site, pathname);
  if (readMethod && contentPage) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderContentPage(site, contentPage));
  const boardRoute = findBoardRoute(site, pathname);
  if (readMethod && boardRoute?.board && boardRoute.index === undefined) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderBoardList(site, boardRoute.board, isAdmin(req)));
  if (readMethod && boardRoute?.board && boardRoute.index !== undefined) {
    const detail = renderBoardDetail(site, boardRoute.board, boardRoute.index, isAdmin(req));
    return detail ? (req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, detail)) : notFound(res);
  }

  if (req.method === "POST" && pathname === "/api/applications") {
    const payload = await parseBody(req);
    const error = validateApplication(payload);
    if (error) return sendJson(res, { error }, 400);
    const applications = await readJson(applicationsFile, []);
    const duplicate = findDuplicateApplicationSlot(applications, payload);
    if (duplicate) {
      return sendJson(res, { error: "이미 같은 컨설턴트의 같은 날짜와 시간에 접수된 신청이 있습니다. 다른 시간을 선택해주세요." }, 409);
    }
    const application = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      programTitle: payload.programTitle?.trim() || "1:1 맞춤형 컨설팅",
      programPath: payload.programPath?.trim() || "/content/11맞춤형컨설팅/",
      status: "접수",
      applicantType: payload.applicantType.trim(),
      consultantId: payload.consultantId.trim(),
      consultantName: payload.consultantName.trim(),
      place: payload.place.trim(),
      date: payload.date.trim(),
      time: payload.time.trim(),
      residence: payload.residence.trim(),
      studentName: payload.studentName.trim(),
      parentPhone: payload.parentPhone.trim(),
      studentPhone: payload.studentPhone.trim(),
      school: payload.school.trim(),
      grade: payload.grade.trim(),
      password: payload.password,
      content: payload.content.trim(),
      memo: ""
    };
    applications.unshift(application);
    await writeJson(applicationsFile, applications);
    return sendJson(res, { ok: true, item: publicApplication(application) });
  }

  if (req.method === "POST" && pathname === "/api/lookup") {
    const payload = await parseBody(req);
    const applications = await readJson(applicationsFile, []);
    const items = applications
      .filter((item) => item.studentName === payload.studentName && item.studentPhone === payload.studentPhone && item.password === payload.password)
      .map(publicApplication);
    return sendJson(res, { items });
  }

  if (readMethod && pathname === "/admin") {
    if (req.method === "HEAD") return sendHead(res, { "Content-Type": "text/html; charset=utf-8" });
    return sendHtml(res, isAuthed(req) ? renderAdmin(site, getSession(req)) : renderAdminLogin(site));
  }

  if (readMethod && pathname.startsWith("/admin/applications/")) {
    if (!isAuthed(req)) return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }, 401) : sendHtml(res, renderAdminLogin(site, "로그인 후 참가신청 상세내용을 확인할 수 있습니다."), 401);
    const user = getSession(req);
    const id = pathname.split("/").pop();
    const applications = await readJson(applicationsFile, []);
    const application = applications.find((item) => item.id === id);
    if (!application) return notFound(res);
    if (!canViewApplication(user, application)) return sendHtml(res, renderSimplePage("권한 없음", "<p>이 신청 내용을 확인할 권한이 없습니다.</p>"), 403);
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "text/html; charset=utf-8" }) : sendHtml(res, renderAdminApplicationDetail(site, application, user));
  }

  if (req.method === "POST" && pathname === "/admin/login") {
    const payload = await parseBody(req);
    const users = await readUsers();
    const user = users.find((item) => item.id === payload.mb_id && item.password === payload.mb_password);
    if (user) {
      const token = crypto.randomBytes(24).toString("hex");
      sessions.set(token, { id: user.id, name: user.name, role: user.role, createdAt: Date.now() });
      res.writeHead(302, {
        Location: "/admin",
        "Set-Cookie": `gijang_admin=${token}; HttpOnly; Path=/; SameSite=Lax`
      });
      return res.end();
    }
    return sendHtml(res, renderAdminLogin(site, "아이디 또는 비밀번호를 확인해주세요."), 401);
  }

  if ((req.method === "POST" || readMethod) && pathname === "/admin/logout") {
    const token = getCookie(req, "gijang_admin");
    if (token) sessions.delete(token);
    const next = url.searchParams.get("next") || "/admin";
    res.writeHead(302, {
      Location: next.startsWith("/") ? next : "/admin",
      "Set-Cookie": "gijang_admin=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
    });
    return res.end();
  }

  if (pathname.startsWith("/api/admin/") || pathname === "/admin/applicants.xls") {
    if (!isAuthed(req)) return sendJson(res, { error: "인증이 필요합니다." }, 401);
  }

  if (pathname === "/api/admin/password" && req.method === "POST") {
    const user = getSession(req);
    const payload = await parseBody(req);
    const users = await readUsers();
    const current = users.find((item) => item.id === user.id);
    if (!current || current.password !== payload.currentPassword) return sendJson(res, { error: "현재 비밀번호가 일치하지 않습니다." }, 400);
    current.password = String(payload.newPassword || "");
    if (!current.password) return sendJson(res, { error: "새 비밀번호를 입력해주세요." }, 400);
    await writeJson(usersFile, users);
    return sendJson(res, { ok: true });
  }

  if (pathname === "/api/admin/upload-image" && req.method === "POST") {
    if (!isAdmin(req)) return sendJson(res, { error: "이미지 수정 권한이 없습니다." }, 403);
    try {
      return sendJson(res, await saveUploadedImage(req));
    } catch (error) {
      return sendJson(res, { error: error.message || "이미지 업로드에 실패했습니다." }, error.status || 500);
    }
  }

  if (readMethod && pathname === "/api/admin/site") {
    if (!isAdmin(req)) return sendJson(res, { error: "페이지 수정 권한이 없습니다." }, 403);
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "application/json; charset=utf-8" }) : sendJson(res, site);
  }
  if (req.method === "PUT" && pathname === "/api/admin/site") {
    if (!isAdmin(req)) return sendJson(res, { error: "페이지 수정 권한이 없습니다." }, 403);
    const payload = await parseBody(req);
    await writeJson(siteFile, payload);
    return sendJson(res, { ok: true });
  }
  if (readMethod && pathname === "/api/admin/users") {
    if (!isAdmin(req)) return sendJson(res, { error: "계정관리 권한이 없습니다." }, 403);
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "application/json; charset=utf-8" }) : sendJson(res, await readUsers());
  }
  if (req.method === "PUT" && pathname === "/api/admin/users") {
    if (!isAdmin(req)) return sendJson(res, { error: "계정관리 권한이 없습니다." }, 403);
    const payload = await parseBody(req);
    const users = Array.isArray(payload) ? payload : [];
    const cleaned = users
      .map((user) => ({
        id: String(user.id || "").trim(),
        name: String(user.name || "").trim(),
        role: user.role === "admin" ? "admin" : "consultant",
        password: String(user.password || "")
      }))
      .filter((user) => user.id && user.name && user.password);
    if (!cleaned.some((user) => user.id === "admin" && user.role === "admin")) return sendJson(res, { error: "admin 관리자 계정은 반드시 필요합니다." }, 400);
    const ids = new Set();
    for (const user of cleaned) {
      if (ids.has(user.id)) return sendJson(res, { error: `중복 아이디가 있습니다: ${user.id}` }, 400);
      ids.add(user.id);
    }
    await writeJson(usersFile, cleaned);
    const nextSite = await readJson(siteFile, {});
    nextSite.form ||= {};
    nextSite.form.consultants = cleaned.filter((user) => user.role === "consultant").map((user) => ({ id: user.id, name: user.name }));
    await writeJson(siteFile, nextSite);
    return sendJson(res, { ok: true, users: cleaned });
  }
  if (readMethod && pathname === "/api/admin/applications") {
    const applications = applicationsForUser(await readJson(applicationsFile, []), getSession(req));
    return req.method === "HEAD" ? sendHead(res, { "Content-Type": "application/json; charset=utf-8" }) : sendJson(res, applications);
  }
  if (req.method === "PATCH" && pathname.startsWith("/api/admin/applications/")) {
    if (!isAdmin(req)) return sendJson(res, { error: "신청자 수정 권한이 없습니다." }, 403);
    const id = pathname.split("/").pop();
    const payload = await parseBody(req);
    const applications = await readJson(applicationsFile, []);
    const next = applications.map((item) => item.id === id ? { ...item, status: payload.status || item.status, memo: payload.memo ?? item.memo } : item);
    await writeJson(applicationsFile, next);
    return sendJson(res, { ok: true });
  }
  if (req.method === "DELETE" && pathname.startsWith("/api/admin/applications/")) {
    if (!isAdmin(req)) return sendJson(res, { error: "신청자 삭제 권한이 없습니다." }, 403);
    const id = pathname.split("/").pop();
    const applications = await readJson(applicationsFile, []);
    await writeJson(applicationsFile, applications.filter((item) => item.id !== id));
    return sendJson(res, { ok: true });
  }
  if (readMethod && pathname === "/admin/applicants.xls") {
    const applications = applicationsForUser(await readJson(applicationsFile, []), getSession(req));
    const headers = {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": "attachment; filename=gijang_applicants.xls"
    };
    if (req.method === "HEAD") return sendHead(res, headers);
    res.writeHead(200, headers);
    return res.end(exportApplicationsXls(applications));
  }

  return notFound(res);
}

const port = Number(process.env.PORT || 3000);
createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error(error);
    sendHtml(res, renderSimplePage("오류", "<p>서버 오류가 발생했습니다.</p>"), 500);
  });
}).listen(port, () => {
  console.log(`Editable Gijang clone running at http://localhost:${port}`);
});
