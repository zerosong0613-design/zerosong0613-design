// 구름창 위젯 (Scriptable)
// 작은·중간·큰 위젯 모두 이 스크립트 하나로 동작해요.
// - 작은 위젯: 햄스터 + 지금 기온 + 오늘 한 줄
// - 중간 위젯: + 앞으로 6시간
// - 큰 위젯:  + 우리 동네 레이더(확대)
// 위젯을 누르면 구름창 웹앱이 열려요.
// 비가 1시간 안에 오거나 지금 오기 시작하면 알림을 한 번 보내요(같은 비 소식엔 다시 안 보냄).
//
// [선택] 위젯 편집 > Parameter 칸에 "0.456,0.323" 처럼 우리 동네 위치를 넣으면 레이더 확대 위치를 바꿀 수 있어요.

const PROXY = "https://vtxdqesewrsgyhzdvhfo.supabase.co/functions/v1/kma-proxy";
const APP = "https://zerosong0613-design.github.io/zerosong0613-design/gureumchang/";
const HAM = (mood) => `${APP}ham-${mood}.png`;
const HOME = (() => {
  const p = (args.widgetParameter || "").split(",").map(Number);
  return p.length === 2 && p.every((n) => n > 0 && n < 1) ? { u: p[0], v: p[1] } : { u: 0.456, v: 0.323 };
})();
const ZOOM = 4;

const C = {
  sky: new Color("#dff0ff"),
  cream: new Color("#fffaf0"),
  ink: new Color("#23344a"),
  muted: new Color("#61758b"),
  butter: new Color("#ffd24d"),
  rain: new Color("#3d8bef"),
  wetBg: new Color("#e6f1ff"),
};
const F = {
  head: (s) => Font.boldRoundedSystemFont(s),
  body: (s) => Font.mediumRoundedSystemFont(s),
};

function speakHours(t) {
  return t.replace(/(\d{2})시/g, (_, hh) => {
    const h = +hh;
    const part = h < 6 ? "새벽" : h < 12 ? "오전" : h < 18 ? "오후" : "밤";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${part} ${h12}시`;
  });
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
  if (h.sky === "1") return +h.hh < 6 || +h.hh >= 19 ? new Color("#c9a227") : new Color("#f2a900");
  return C.muted;
}

async function loadJSON(url) {
  const r = new Request(url);
  r.timeoutInterval = 20;
  return await r.loadJSON();
}
async function loadImage(url) {
  const r = new Request(url);
  r.timeoutInterval = 25;
  return await r.loadImage();
}

// 레이더 영상에서 우리 동네 쪽을 잘라 확대
function cropRadar(img, w, h) {
  const ctx = new DrawContext();
  ctx.size = new Size(w, h);
  ctx.opaque = true;
  ctx.respectScreenScale = true;
  ctx.setFillColor(Color.white());
  ctx.fillRect(new Rect(0, 0, w, h));
  const iw = img.size.width, ih = img.size.height;
  const k = (w / (iw / ZOOM)); // 화면 1pt당 배율
  const dw = iw * k, dh = ih * k;
  const x = w / 2 - HOME.u * dw;
  const y = h / 2 - HOME.v * dh;
  ctx.drawImageInRect(img, new Rect(x, y, dw, dh));
  // 우리 동네 표시 (작은 노란 점)
  ctx.setFillColor(C.butter);
  ctx.setStrokeColor(C.ink);
  ctx.setLineWidth(2);
  const r = new Rect(w / 2 - 5, h / 2 - 5, 10, 10);
  ctx.fillEllipse(r);
  ctx.strokeEllipse(r);
  return ctx.getImage();
}

async function maybeNotify(b) {
  if (!b || !b.rainSoon) return;
  const fm = FileManager.local();
  const path = fm.joinPath(fm.documentsDirectory(), "gureumchang-alert.txt");
  const last = fm.fileExists(path) ? fm.readString(path) : "";
  // 같은 비 소식(같은 문장)에는 6시간 안에 다시 알리지 않음
  if (last) {
    const [lastTag, lastAt] = last.split("\n");
    if (lastTag === b.headline && Date.now() - Number(lastAt) < 6 * 3600e3) return;
  }
  const n = new Notification();
  n.title = "☂️ 구름창";
  n.body = `${speakHours(b.headline)} · ${speakHours(b.sub)}`;
  n.openURL = APP;
  await n.schedule();
  fm.writeString(path, `${b.headline}\n${Date.now()}`);
}

function addHeader(stack, b, hamImg, big) {
  const row = stack.addStack();
  row.centerAlignContent();
  if (hamImg) {
    const im = row.addImage(hamImg);
    im.imageSize = new Size(big ? 58 : 50, big ? 58 : 50);
    row.addSpacer(6);
  }
  const col = row.addStack();
  col.layoutVertically();
  const t = col.addText(b && b.now.t1h !== null ? `${b.now.t1h}°` : "-°");
  t.font = F.head(big ? 30 : 26);
  t.textColor = C.ink;
  const hl = b && b.today && b.today.tmx !== null ? `최고 ${b.today.tmx}° 최저 ${b.today.tmn}°` : "우리 동네";
  const lab = col.addText(b && b.now.ptyName ? `${b.now.ptyName} 오는 중` : hl);
  lab.font = F.body(11);
  lab.textColor = b && b.now.ptyName ? C.rain : C.muted;
  return row;
}

function addHours(stack, hours, n) {
  const row = stack.addStack();
  row.spacing = 4;
  for (const h of hours.slice(0, n)) {
    const cell = row.addStack();
    cell.layoutVertically();
    cell.centerAlignContent();
    cell.size = new Size(44, 0);
    cell.setPadding(5, 4, 5, 4);
    cell.cornerRadius = 10;
    cell.backgroundColor = h.pty !== "0" ? C.wetBg : Color.white();
    cell.borderColor = h.pty !== "0" ? C.rain : new Color("#d7e3ef");
    cell.borderWidth = 1;
    const top = cell.addStack(); top.addSpacer();
    const hh = top.addText(`${+h.hh}시`); hh.font = F.head(11); hh.textColor = C.ink; top.addSpacer();
    const mid = cell.addStack(); mid.addSpacer();
    const sym = SFSymbol.named(symbolFor(h));
    if (sym) { sym.applyFont(Font.systemFont(15)); const si = mid.addImage(sym.image); si.imageSize = new Size(18, 18); si.tintColor = symbolColor(h); }
    mid.addSpacer();
    const bot = cell.addStack(); bot.addSpacer();
    const tt = bot.addText(`${h.t1h ?? "-"}°`); tt.font = F.body(11); tt.textColor = C.ink; bot.addSpacer();
  }
}

async function build() {
  const fam = config.widgetFamily || "large";
  const w = new ListWidget();
  w.backgroundColor = C.sky;
  w.url = APP;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60e3);
  w.setPadding(12, 12, 12, 12);

  let b = null, err = "";
  try {
    b = await loadJSON(`${PROXY}?kind=brief`);
    if (b.error) { err = b.error; b = null; }
  } catch (e) { err = "인터넷 연결을 확인해 주세요"; }

  let ham = null;
  try { ham = await loadImage(HAM(b ? b.mood : "cloudy")); } catch (e) {}

  if (!b) {
    addHeader(w, null, ham, false);
    w.addSpacer(6);
    const t = w.addText("예보를 못 받았어요"); t.font = F.head(14); t.textColor = C.ink;
    const s = w.addText(err); s.font = F.body(11); s.textColor = C.muted;
    return w;
  }

  await maybeNotify(b);
  const headline = speakHours(b.headline);
  const sub = speakHours(b.sub);

  if (fam === "small") {
    addHeader(w, b, ham, false);
    w.addSpacer(6);
    const t = w.addText(headline); t.font = F.head(15); t.textColor = C.ink; t.minimumScaleFactor = 0.7; t.lineLimit = 2;
    w.addSpacer();
    const f = w.addText(`${b.now.base.slice(8, 10)}시 관측`); f.font = F.body(9); f.textColor = C.muted;
    return w;
  }

  // 중간·큰 위젯: 위쪽 한 줄 요약
  const top = w.addStack();
  top.centerAlignContent();
  if (ham) { const im = top.addImage(ham); im.imageSize = new Size(fam === "large" ? 48 : 54, fam === "large" ? 48 : 54); top.addSpacer(8); }
  const col = top.addStack(); col.layoutVertically();
  const ht = col.addText(headline); ht.font = F.head(fam === "large" ? 18 : 16); ht.textColor = C.ink; ht.lineLimit = 1; ht.minimumScaleFactor = 0.7;
  const st = col.addText(sub); st.font = F.body(11); st.textColor = C.muted; st.lineLimit = 2;
  top.addSpacer();
  const tcol = top.addStack(); tcol.layoutVertically();
  const tt = tcol.addText(b.now.t1h !== null ? `${b.now.t1h}°` : "-°"); tt.font = F.head(26); tt.textColor = C.ink;
  const hlText = b.today && b.today.tmx !== null ? `${b.today.tmx}° / ${b.today.tmn}°` : (b.now.reh !== null ? `습도 ${b.now.reh}%` : "");
  const rh = tcol.addText(hlText); rh.font = F.body(10); rh.textColor = C.muted;

  if (fam === "large") {
    w.addSpacer(8);
    try {
      const img = await loadImage(`${PROXY}?kind=radar&size=1440`);
      const crop = cropRadar(img, 300, 136);
      const box = w.addStack();
      box.cornerRadius = 14;
      box.borderColor = C.ink;
      box.borderWidth = 2;
      const pic = box.addImage(crop);
      pic.imageSize = new Size(300, 136);
      pic.applyFillingContentMode();
      w.addSpacer(3);
      const cap = w.addText("레이더 강수 · 노란 점이 우리 동네 · 누르면 크게 보기");
      cap.font = F.body(9); cap.textColor = C.muted;
    } catch (e) {
      const t = w.addText("레이더 영상을 못 받았어요"); t.font = F.body(11); t.textColor = C.muted;
    }
  }

  w.addSpacer(8);
  addHours(w, b.hours, 6);
  if (fam === "medium") { w.addSpacer(); }
  return w;
}

const widget = await build();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  // 앱에서 실행하면 큰 위젯 미리보기
  await widget.presentLarge();
}
Script.complete();
