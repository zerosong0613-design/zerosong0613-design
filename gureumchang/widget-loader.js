// 구름창 위젯 (Scriptable) — 이 짧은 코드 하나만 Scriptable에 붙여 두면,
// 실행할 때마다 최신 구름창 위젯 코드(widget.js)를 받아와서 그려요.
// 위젯을 고쳐도 다시 붙여 넣을 필요가 없어요. 인터넷이 안 되면 마지막으로 받은 코드로 그려요.
const SRC = "https://zerosong0613-design.github.io/zerosong0613-design/gureumchang/widget.js";
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), "gureumchang-widget-latest.js");
let code = null;
try {
  const r = new Request(`${SRC}?h=${Math.floor(Date.now() / 3600e3)}`);
  r.timeoutInterval = 10;
  const t = await r.loadString();
  if (r.response && r.response.statusCode === 200 && t.includes("ListWidget")) { code = t; fm.writeString(path, t); }
} catch (e) {}
if (!code && fm.fileExists(path)) code = fm.readString(path);
if (code) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(code)();
} else {
  const w = new ListWidget();
  w.addText("구름창: 위젯 코드를 아직 못 받았어요. 인터넷 연결 후 다시 열어 주세요.");
  if (config.runsInWidget) Script.setWidget(w); else await w.presentMedium();
  Script.complete();
}
