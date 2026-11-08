// 구름창 위젯 (Scriptable) — 중간 크기 위젯용
// 위: 햄스터 · 오늘 한 줄(비 소식) · 최고/최저 · 지금 기온
// 아래: 앞으로 6시간 칸 (비 오는 시간은 파랗게)
// 위젯을 누르면 구름창(레이더 지도)이 열려요.
// 비가 1시간 안에 오거나 지금 오기 시작하면 알림을 한 번 보내요(같은 비 소식은 6시간 동안 다시 안 보냄).

const PROXY = "https://vtxdqesewrsgyhzdvhfo.supabase.co/functions/v1/kma-proxy";
const APP = "https://zerosong0613-design.github.io/zerosong0613-design/gureumchang/";
const HAM = (mood) => `${APP}ham-${mood}.png`;

const C = {
  bg: new Color("#fffaf0"),
  ink: new Color("#23344a"),
  muted: new Color("#61758b"),
  rain: new Color("#3d8bef"),
  sun: new Color("#f2a900"),
  moon: new Color("#c9a227"),
  cloud: new Color("#8fa3b8"),
  wetBg: new Color("#e6f1ff"),
  line: new Color("#d7e3ef"),
};
const F = {
  big: Font.semiboldRoundedSystemFont(34),
  title: Font.boldRoundedSystemFont(17),
  hour: Font.boldRoundedSystemFont(12),
  text: Font.semiboldRoundedSystemFont(13),
  small: Font.mediumRoundedSystemFont(12),
  temp: Font.semiboldRoundedSystemFont(13),
};

// "02시" → "새벽 2시"
function speakHours(t) {
  return t.replace(/(\d{2})시/g, (_, hh) => `${ampm(+hh)}`);
}
function ampm(h) {
  const part = h < 6 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : "밤";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${part} ${h12}시`;
}
function hourLabel(h) {
  const part = h < 12 ? "오전" : "오후";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${part} ${h12}시`;
}
function symbolFor(h) {
  const night = +h.hh < 6 || +h.hh >= 19;
  if (h.pty === "3" || h.pty === "7") return "cloud.snow.fill";
  if (h.pty === "2" || h.pty === "6") return "cloud.sleet.fill";
  if (h.pty === "5") return "cloud.drizzle.fill";
  if (h.pty !== "0") return "cloud.rain.fill";
  if (h.sky === "1") return night ? "moon.stars.fill" : "sun.max.fill";
  if (h.sky === "3") return night ? "cloud.moon.fill" : "cloud.sun.fill";
  return "cloud.fill";
}
function symbolColor(h) {
  if (h.pty !== "0") return C.rain;
  if (h.sky === "1") return +h.hh < 6 || +h.hh >= 19 ? C.moon : C.sun;
  return C.cloud;
}

// 휴대폰 위치(약 3km 정확도) + 동 이름. 못 받으면 마지막으로 받은 위치, 그것도 없으면 우리 동네(분당)
async function whereAmI() {
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "gureumchang-loc.json");
  let last = null;
  if (fm.fileExists(path)) { try { last = JSON.parse(fm.readString(path)); } catch (e) {} }
  try {
    Location.setAccuracyToThreeKilometers();
    const loc = await Location.current();
    let name = "";
    try {
      const g = await Location.reverseGeocode(loc.latitude, loc.longitude, "ko");
      if (g && g[0]) name = g[0].subLocality || g[0].locality || "";
    } catch (e) {}
    const here = { lat: +loc.latitude.toFixed(2), lon: +loc.longitude.toFixed(2), name: name || "내 위치" };
    fm.writeString(path, JSON.stringify(here));
    return here;
  } catch (e) {
    return last;
  }
}

async function getJSON(url) { const r = new Request(url); r.timeoutInterval = 20; return await r.loadJSON(); }
async function getImage(url) { const r = new Request(url); r.timeoutInterval = 20; return await r.loadImage(); }

async function maybeNotify(b) {
  if (!b.rainSoon) return;
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "gureumchang-alert.txt");
  if (fm.fileExists(path)) {
    const [lastHead, lastAt] = fm.readString(path).split("\n");
    if (lastHead === b.headline && Date.now() - Number(lastAt) < 6 * 3600e3) return;
  }
  const n = new Notification();
  n.title = "구름창 ☂️";
  n.body = `${speakHours(b.headline)} · ${speakHours(b.sub)}`;
  n.openURL = APP;
  await n.schedule();
  fm.writeString(path, `${b.headline}\n${Date.now()}`);
}

// 지난 시각은 빼고 지금 시각부터
function upcoming(hours) {
  const k = new Date(Date.now() + 9 * 3600e3);
  const nowKey = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}${String(k.getUTCHours()).padStart(2, "0")}00`;
  return hours.filter((h) => `${h.date}${h.time}` >= nowKey);
}

function txt(stack, s, font, color, opts = {}) {
  const t = stack.addText(s);
  t.font = font; t.textColor = color;
  if (opts.lines) t.lineLimit = opts.lines;
  if (opts.scale) t.minimumScaleFactor = opts.scale;
  if (opts.right) t.rightAlignText();
  return t;
}

async function build() {
  const w = new ListWidget();
  w.backgroundColor = C.bg;
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
  w.setPadding(12, 14, 12, 14);

  const here = await whereAmI();
  const q = here ? `&lat=${here.lat}&lon=${here.lon}` : "";
  let b = null;
  try { b = await getJSON(`${PROXY}?kind=brief${q}`); if (b.error) b = null; } catch (e) {}
  let ham = null;
  try { ham = await getImage(HAM(b ? b.mood : "cloudy")); } catch (e) {}

  if (!b) {
    txt(w, "구름창", F.title, C.ink);
    w.addSpacer(6);
    txt(w, "예보를 못 받았어요. 잠시 뒤 다시 볼게요.", F.small, C.muted, { lines: 2 });
    return w;
  }
  try { await maybeNotify(b); } catch (e) {}

  // ── 위쪽: 햄스터 + 오늘 한 줄 + 지금 기온 ──
  const wet = !!b.now.ptyName || b.hours.some((h) => h.pty !== "0");
  const top = w.addStack();
  top.centerAlignContent();
  if (ham) { const hi = top.addImage(ham); hi.imageSize = new Size(48, 48); top.addSpacer(8); }
  const mid = top.addStack();
  mid.layoutVertically();
  const placeName = b.where === "here" && here ? here.name : "우리 동네";
  txt(mid, `구름창 · ${placeName}`, F.small, C.muted, { lines: 1 });
  txt(mid, speakHours(b.headline), F.title, wet ? C.rain : C.ink, { lines: 1, scale: 0.65 });
  const hl = b.today && b.today.tmx !== null ? `최고 ${b.today.tmx}° · 최저 ${b.today.tmn}°` : (b.now.reh !== null ? `습도 ${b.now.reh}%` : "");
  if (hl) txt(mid, hl, F.small, C.muted, { lines: 1 });
  top.addSpacer();
  txt(top, b.now.t1h !== null ? `${b.now.t1h}°` : "-°", F.big, C.ink);

  w.addSpacer();

  // ── 아래: 앞으로 6시간 (앱처럼 동글동글한 칸) ──
  const row = w.addStack();
  const list = upcoming(b.hours).slice(0, 6);
  list.forEach((h, i) => {
    const isWet = h.pty !== "0";
    const cell = row.addStack();
    cell.layoutVertically();
    cell.size = new Size(44, 66);
    cell.setPadding(5, 0, 5, 0);
    cell.cornerRadius = 12;
    cell.backgroundColor = isWet ? C.wetBg : Color.white();
    cell.borderColor = isWet ? C.rain : C.line;
    cell.borderWidth = 1.5;
    const l1 = cell.addStack(); l1.addSpacer(); txt(l1, `${+h.hh}시`, F.hour, C.ink, { lines: 1 }); l1.addSpacer();
    cell.addSpacer(3);
    const l2 = cell.addStack(); l2.addSpacer();
    const sym = SFSymbol.named(symbolFor(h));
    if (sym) { const si = l2.addImage(sym.image); si.imageSize = new Size(20, 17); si.tintColor = symbolColor(h); }
    l2.addSpacer();
    cell.addSpacer(3);
    const l3 = cell.addStack(); l3.addSpacer(); txt(l3, `${h.t1h ?? "-"}°`, F.temp, isWet ? C.rain : C.ink, { lines: 1 }); l3.addSpacer();
    if (i < list.length - 1) row.addSpacer();
  });

  return w;
}

const widget = await build();
if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
