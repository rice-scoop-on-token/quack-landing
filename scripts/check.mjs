// 시연 화면 자동 확인. 의존성 없이 설치된 Chrome(또는 Edge)을 헤드리스로 띄워 DevTools 프로토콜로 조작한다.
//   npm run check
// 확인하는 것:
//   - 안내 패널 6단계 × 3해상도 × (대기 / 테스트 영상 연결): 스크롤·잘림, 제목 한 줄, 글자 크기, 패널 높이 고정
//   - 테스트 영상(캔버스 captureStream)을 붙였을 때 비율 갱신·화면 맞춤, C 키 연결·취소·교체, 끊김 처리
//   - 키 조작(←, →, 1~6, Home, H, C, R, P, ",", ".", L), 수정 키 무시, 반복 입력 무시, 기본 동작 막기
//   - 2단계 경과 시간, 동작 줄이기, 외부 요청 0건, 모듈 스크립트 MIME
//   - 서버 Range 요청(206, 416, 200)
//   - 녹화 모드: 재생·일시정지·탐색·끝에서 멈춤, 비율, "녹화 영상" 표시, 경과 시간 숨김, 라이브 전환, 파일 없음 안내
// 스크린샷과 결과(report.json)는 OS 임시 폴더에만 저장한다.
// 예외: 녹화 모드 확인 동안만 테스트 영상을 public/recordings/demo.mp4에 두고 끝나면 지운다(아래 "녹화 영상 보호").
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4173/';
const SIZES = [[1280, 720], [1536, 864], [1920, 1080]];
// 영상 확인은 가장 작은 화면과 가장 큰 화면에서 한다
const VIDEO_SIZES = [[1280, 720], [1920, 1080]];
const DEBUG_PORT = 9333;
const OUT = join(tmpdir(), 'quack-landing-check');

// 단계별 오리 동작. quack screenActions.ts 기준(public/scripts/steps.js 주석 참고)
const STEP_ACTIONS = ['idle', 'think', 'dejected', 'idle', 'happy_jump', 'happy_jump'];

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const expect = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? '  ok ' : '  FAIL'} ${message}`);
};

// ---------- 서버 ----------

async function isServerUp() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await isServerUp())) {
  const serve = fileURLToPath(new URL('./serve.mjs', import.meta.url));
  server = spawn(process.execPath, [serve], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await isServerUp()); i++) await sleep(100);
}

// ---------- 녹화 영상 보호 ----------
// 테스트 영상은 실제 녹화와 같은 경로(public/recordings/demo.mp4)에 둬야 한다.
// 그래서 테스트 영상을 둘 때 표시 파일을 함께 만들고, 표시가 있을 때만 demo.mp4를 지운다.
// 표시 없이 demo.mp4가 있으면 리허설 때 녹화한 실제 파일이므로 건드리지 않고 녹화 확인을 건너뛴다.
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const RECORDINGS_DIR = join(PUBLIC_DIR, 'recordings');
const DEMO_PATH = join(RECORDINGS_DIR, 'demo.mp4');
const TEST_MARK = join(RECORDINGS_DIR, '.check-test-video');

function removeTestVideo() {
  if (!existsSync(TEST_MARK)) return;
  rmSync(DEMO_PATH, { force: true });
  rmSync(TEST_MARK, { force: true });
}

// 지난번 확인이 중간에 멈춰 테스트 영상이 남았으면 먼저 정리한다(부스에서 R을 눌러 테스트 영상이 나오지 않게)
if (existsSync(TEST_MARK)) {
  console.log('지난 확인에서 남은 테스트 영상을 지웠어요.');
  removeTestVideo();
}
const realRecording = existsSync(DEMO_PATH);
if (realRecording) {
  console.log('주의: public/recordings/demo.mp4(실제 녹화)가 있어서 녹화 영상 확인 일부를 건너뛰어요. 파일은 건드리지 않아요.');
}

// ---------- Chrome ----------

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Chrome이나 Edge를 찾지 못했어요. CHROME_PATH 환경 변수로 실행 파일 경로를 알려 주세요.');
  server?.kill();
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const profileDir = join(tmpdir(), 'quack-landing-check-profile');
rmSync(profileDir, { recursive: true, force: true });

const chrome = spawn(chromePath, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  'about:blank',
], { stdio: 'ignore' });

let ws = null;

function cleanup() {
  try {
    ws?.close();
  } catch {
    // 이미 닫힘
  }
  chrome.kill();
  server?.kill();
}

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch {
    // 아직 뜨는 중
  }
}
if (!target) {
  console.error('헤드리스 Chrome에 연결하지 못했어요.');
  cleanup();
  process.exit(1);
}

ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener('open', resolve));
let nextId = 0;
const pending = new Map();
const requests = [];
const responses = new Map();
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Network.requestWillBeSent') requests.push(msg.params.request.url);
  if (msg.method === 'Network.responseReceived') responses.set(msg.params.response.url, msg.params.response.mimeType);
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

// 페이지 안에서 식을 실행하고 값을 돌려받는다
async function run(expression) {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) throw new Error(JSON.stringify(res.result.exceptionDetails));
  return res.result.result.value;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(res.result.data, 'base64'));
}

// 실제 키 입력. repeat이면 길게 눌러 생기는 반복 입력.
// 수정 키(Ctrl·Alt·Meta)는 여기로 보내지 않는다. 브라우저 단축키가 실행돼 시연 탭이 가려진다(키 조작 확인 참고).
const KEYS = {
  KeyC: { key: 'c', keyCode: 67 },
  KeyH: { key: 'h', keyCode: 72 },
  KeyR: { key: 'r', keyCode: 82 },
  KeyP: { key: 'p', keyCode: 80 },
  KeyL: { key: 'l', keyCode: 76 },
  Comma: { key: ',', keyCode: 188 },
  Period: { key: '.', keyCode: 190 },
  ArrowRight: { key: 'ArrowRight', keyCode: 39 },
  ArrowLeft: { key: 'ArrowLeft', keyCode: 37 },
  Home: { key: 'Home', keyCode: 36 },
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].flatMap((n) => [
    [`Digit${n}`, { key: String(n), keyCode: 48 + n }],
    [`Numpad${n}`, { key: String(n), keyCode: 96 + n }],
  ])),
};
async function press(code, { repeat = false } = {}) {
  const { key, keyCode } = KEYS[code];
  const base = { code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', autoRepeat: repeat, ...base });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
  await sleep(30);
}

// ---------- 페이지 안에서 쓰는 도우미 ----------
// 테스트 영상과 상태 측정은 확인 스크립트가 페이지에 넣는다. 시연 화면 코드에는 테스트 경로가 없다.
const PAGE_HELPERS = `
globalThis.__check = {
  waitFor: async (fn, ms = 5000) => {
    const end = performance.now() + ms;
    while (performance.now() < end) { if (fn()) return true; await new Promise(r => setTimeout(r, 50)); }
    return false;
  },
  // 가장자리 테두리와 네 모서리 표시를 그린 테스트 영상. 잘리면 스크린샷에서 바로 보인다.
  makeStream: (w, h) => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      const W = canvas.width, H = canvas.height;
      ctx.fillStyle = '#2B6CB0'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#E53E3E'; ctx.fillRect(0, 0, W, 24); ctx.fillRect(0, H - 24, W, 24);
      ctx.fillRect(0, 0, 24, H); ctx.fillRect(W - 24, 0, 24, H);
      ctx.fillStyle = '#F6E05E';
      for (const [x, y] of [[24, 24], [W - 144, 24], [24, H - 144], [W - 144, H - 144]]) ctx.fillRect(x, y, 120, 120);
      ctx.fillStyle = '#FFFFFF'; ctx.font = 'bold 96px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(W + ' x ' + H, W / 2, H / 2);
      ctx.font = '48px sans-serif'; ctx.fillText('frame ' + (frame++), W / 2, H / 2 + 90);
    };
    draw();
    const timer = setInterval(draw, 100);
    const stream = canvas.captureStream(30);
    return { canvas, stream, draw, timer };
  },
  // getDisplayMedia를 가짜로 바꿔 호출 횟수만 센다(취소로 응답)
  stubCapture: () => {
    __check.calls = [];
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      __check.calls.push(options);
      throw new DOMException('사용자가 취소함', 'NotAllowedError');
    };
  },
  // 키 이벤트가 셸을 지난 뒤 기본 동작이 막혔는지 기록한다(window는 document 다음에 이벤트를 받는다)
  logKeys: () => {
    __check.keys = [];
    addEventListener('keydown', (e) => __check.keys.push({ code: e.code, repeat: e.repeat, prevented: e.defaultPrevented,
      mods: [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.metaKey && 'Meta', e.shiftKey && 'Shift'].filter(Boolean).join('+') }));
  },
  aspect: () => getComputedStyle(document.documentElement).getPropertyValue('--phone-aspect').trim(),
  state: () => {
    const phone = document.querySelector('.phone');
    const screen = document.querySelector('.phone-screen').getBoundingClientRect();
    const video = document.querySelector('.phone-video');
    const visible = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null).map(e => e.textContent.trim());
    // 화면 밖으로 나간 요소. overflow로 잘리는 조상이 있으면 잘린 뒤 보이는 영역만 따진다
    // (예: 오리 동작 시트는 한 칸 크기 창 안에서 잘려 보인다)
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!el.checkVisibility()) continue;
      let { left, top, right, bottom } = el.getBoundingClientRect();
      if (right - left === 0) continue;
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflow === 'visible') continue;
        const c = a.getBoundingClientRect();
        left = Math.max(left, c.left); top = Math.max(top, c.top);
        right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom);
      }
      if (right <= left || bottom <= top) continue;
      if (left < -0.5 || top < -0.5 || right > innerWidth + 0.5 || bottom > innerHeight + 0.5) out.push(el.className);
    }
    const rec = document.querySelector('.phone-recording');
    return {
      mode: phone.dataset.mode,
      bodyMode: document.body.dataset.phoneMode,
      state: phone.dataset.state,
      aspectVar: __check.aspect(),
      screen: { w: screen.width, h: screen.height },
      video: { w: video.videoWidth, h: video.videoHeight, shown: video.offsetParent !== null, hasSrc: !!video.srcObject },
      rec: { shown: rec.checkVisibility(), w: rec.videoWidth, h: rec.videoHeight, paused: rec.paused, ended: rec.ended,
        t: rec.currentTime, duration: rec.duration, loop: rec.loop, muted: rec.muted, src: rec.getAttribute('src') },
      badgeShown: document.querySelector('.phone-recording-badge').checkVisibility(),
      badgeText: document.querySelector('.phone-recording-badge').textContent.trim(),
      missingShown: document.querySelector('.phone-recording-missing').checkVisibility(),
      missingText: document.querySelector('.phone-recording-missing').textContent.trim(),
      texts: visible('.phone-waiting p'),
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      viewport: [innerWidth, innerHeight],
      outOfView: out,
    };
  },
  guide: () => {
    const q = (sel) => document.querySelector(sel);
    const title = q('.guide-title'), desc = q('.guide-desc');
    const lineHeight = (el) => parseFloat(getComputedStyle(el).lineHeight);
    const lines = (el) => Math.round(el.getBoundingClientRect().height / lineHeight(el));
    // 설명은 글자가 실제로 차지한 줄 수를 잰다(자리는 2줄로 잡혀 있다)
    const range = document.createRange(); range.selectNodeContents(desc);
    const descLines = Math.round(range.getBoundingClientRect().height / lineHeight(desc));
    return {
      step: Number(q('.guide-step-now').textContent),
      total: Number(q('.guide-step-total').textContent),
      title: title.textContent,
      desc: desc.textContent,
      titleLines: lines(title),
      descLines,
      titleOverflow: title.scrollWidth > title.clientWidth + 0.5,
      fontSize: {
        title: parseFloat(getComputedStyle(title).fontSize),
        desc: parseFloat(getComputedStyle(desc).fontSize),
        chip: parseFloat(getComputedStyle(q('.guide-step')).fontSize),
      },
      done: [...document.querySelectorAll('.guide-progress li')].map(li => li.classList.contains('is-done') ? 1 : 0).join(''),
      sheet: q('.guide-duck-sheet').getAttribute('src'),
      sheetLoaded: q('.guide-duck-sheet').complete && q('.guide-duck-sheet').naturalWidth === 1536,
      elapsedShown: getComputedStyle(q('.guide-elapsed')).visibility === 'visible',
      elapsed: q('.guide-elapsed-time').textContent,
      panelHeight: q('.guide').getBoundingClientRect().height,
      helpShown: q('.keys-help').checkVisibility(),
    };
  },
};
`;

async function load(width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: BASE });
  await sleep(300);
  await run(`(async () => { await new Promise(r => document.readyState === 'complete' ? r() : addEventListener('load', r)); await document.fonts.ready; })()`);
  await run(PAGE_HELPERS);
}

async function attachTestVideo(w, h) {
  await run(`(async () => {
    const { attachStream } = await import('/scripts/phone-view.js');
    __check.a = __check.makeStream(${w}, ${h});
    attachStream(__check.a.stream);
    await __check.waitFor(() => __check.aspect() === '${w} / ${h}');
  })()`);
  await sleep(300);
}

function checkLayout(s, label) {
  expect(s.scroll[0] === s.viewport[0] && s.scroll[1] === s.viewport[1], `${label}: 스크롤 없음 (${s.scroll.join('x')})`);
  expect(s.outOfView.length === 0, `${label}: 화면 밖으로 나간 요소 없음 ${s.outOfView.length ? JSON.stringify(s.outOfView) : ''}`);
}

// 프레임 비율이 영상 비율과 같으면(0.5px 이내) 영상이 빈틈도 잘림도 없이 꽉 찬다
function checkFit(s, w, h, label) {
  expect(s.state === 'connected' && s.video.shown, `${label}: 연결 상태, 영상 표시`);
  expect(s.video.w === w && s.video.h === h, `${label}: 영상 크기 ${s.video.w}x${s.video.h}`);
  expect(s.aspectVar === `${w} / ${h}`, `${label}: --phone-aspect = ${s.aspectVar}`);
  const expectedWidth = (s.screen.h * w) / h;
  expect(Math.abs(s.screen.w - expectedWidth) < 0.5, `${label}: 프레임 ${s.screen.w.toFixed(1)}x${s.screen.h.toFixed(1)} (영상 비율 폭 ${expectedWidth.toFixed(1)})`);
}

// 폰 프레임 상태별 기대값: [모드, 라이브 상태(녹화 모드면 따지지 않음), 스크린샷 이름]
const PHONE_STATES = {
  대기: ['live', 'waiting', 'waiting'],
  연결: ['live', 'connected', 'video'],
  녹화: ['recording', null, 'recording'],
};

// 안내 패널 6단계를 숫자 키로 차례로 넘기며 배치를 잰다
async function checkAllSteps(tag, phoneState, width) {
  const [expectMode, expectState, shotName] = PHONE_STATES[phoneState];
  const heights = [];
  for (let n = 1; n <= 6; n++) {
    await press(`Digit${n}`);
    await sleep(260); // 전환(200ms)이 끝난 뒤 잰다
    const s = await run('__check.state()');
    const g = await run('__check.guide()');
    const label = `${tag} ${phoneState} ${n}단계`;
    const problems = [];
    if (s.mode !== expectMode || (expectState && s.state !== expectState)) problems.push(`폰 상태 ${s.mode}/${s.state}`);
    if (s.scroll[0] !== s.viewport[0] || s.scroll[1] !== s.viewport[1]) problems.push(`스크롤 ${s.scroll.join('x')}`);
    if (s.outOfView.length) problems.push(`화면 밖 ${JSON.stringify(s.outOfView)}`);
    if (g.step !== n || g.total !== 6) problems.push(`단계 표시 ${g.step}/${g.total}`);
    if (g.titleLines !== 1 || g.titleOverflow) problems.push(`제목 ${g.titleLines}줄`);
    if (g.descLines > 2) problems.push(`설명 ${g.descLines}줄`);
    if (g.fontSize.title % 12 || g.fontSize.chip % 12) problems.push(`Galmuri 크기 ${g.fontSize.title}/${g.fontSize.chip}`);
    if (width === 1280 && (g.fontSize.title < 44 || g.fontSize.desc < 24)) problems.push(`글자 크기 ${g.fontSize.title}/${g.fontSize.desc}`);
    if (g.done !== '1'.repeat(n) + '0'.repeat(6 - n)) problems.push(`진행 표시 ${g.done}`);
    if (!g.sheet.endsWith(`/${STEP_ACTIONS[n - 1]}.png`) || !g.sheetLoaded) problems.push(`오리 동작 ${g.sheet}`);
    // 경과 시간은 라이브 2단계에서만 보인다. 녹화 모드에서는 지금 AI가 답하는 중이 아니므로 숨긴다
    if (g.elapsedShown !== (n === 2 && expectMode === 'live')) problems.push(`경과 시간 표시 ${g.elapsedShown}`);
    if (s.badgeShown !== (expectMode === 'recording')) problems.push(`녹화 영상 표시 ${s.badgeShown}`);
    expect(problems.length === 0, `${label}: "${g.title}" 제목 ${g.fontSize.title}px 설명 ${g.descLines}줄 ${problems.join(', ')}`);
    heights.push(g.panelHeight);
    await shot(`${tag}-steps-${shotName}-${n}`);
  }
  const spread = Math.max(...heights) - Math.min(...heights);
  expect(spread < 0.5, `${tag} ${phoneState}: 단계를 넘겨도 패널 높이 고정 (차이 ${spread.toFixed(1)}px)`);
}

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable');

// 경로를 그대로 보내는 HTTP 요청(fetch는 ..와 %2e%2e를 미리 정리해 버려서 경로 차단을 확인할 수 없다)
function rawRequest(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: 4173, path, method }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

// 페이지 안 MediaRecorder로 테스트 영상(mp4)을 만든다. 테두리·시간 표시가 있어 탐색 위치가 스크린샷에 보인다.
const RECORD_TEST_VIDEO = `(async () => {
  const W = 360, H = 720, SECONDS = 8;
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d'); const start = performance.now();
  const draw = () => {
    const t = (performance.now() - start) / 1000;
    ctx.fillStyle = '#2F855A'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#E53E3E'; ctx.fillRect(0, 0, W, 12); ctx.fillRect(0, H - 12, W, 12); ctx.fillRect(0, 0, 12, H); ctx.fillRect(W - 12, 0, 12, H);
    ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif'; ctx.fillText('TEST ' + W + 'x' + H, W / 2, H / 2 - 40);
    ctx.font = 'bold 64px sans-serif'; ctx.fillText(t.toFixed(1) + 's', W / 2, H / 2 + 50);
  };
  draw(); const timer = setInterval(draw, 33);
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: 'video/mp4;codecs=avc1.42E01E', videoBitsPerSecond: 400000 });
  const parts = []; recorder.ondataavailable = (e) => parts.push(e.data);
  recorder.start(); await new Promise((r) => setTimeout(r, SECONDS * 1000)); recorder.stop();
  await new Promise((r) => (recorder.onstop = r)); clearInterval(timer);
  const bytes = new Uint8Array(await new Blob(parts).arrayBuffer());
  let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
})()`;

const recState = () => run('__check.state()');
const waitRec = (condition, ms = 5000) =>
  run(`__check.waitFor(() => { const r = document.querySelector('.phone-recording'); return ${condition}; }, ${ms})`);

try {
  // 0) 서버 Range 요청
  console.log('서버 Range');
  const sampleUrl = `${BASE}assets/fonts/Pretendard-Regular.woff2`;
  const sample = readFileSync(join(PUBLIC_DIR, 'assets/fonts/Pretendard-Regular.woff2'));
  const size = sample.length;
  let res = await fetch(sampleUrl);
  await res.arrayBuffer();
  expect(res.status === 200 && res.headers.get('accept-ranges') === 'bytes' && Number(res.headers.get('content-length')) === size,
    `Range 없음: ${res.status}, Accept-Ranges ${res.headers.get('accept-ranges')}, 길이 ${res.headers.get('content-length')}`);
  for (const [range, start, end] of [
    ['bytes=0-99', 0, 99],
    ['bytes=1000-', 1000, size - 1],
    ['bytes=-500', size - 500, size - 1],
    [`bytes=100-${size + 5000}`, 100, size - 1], // 끝이 파일 밖이면 파일 끝까지
  ]) {
    res = await fetch(sampleUrl, { headers: { Range: range } });
    const body = Buffer.from(await res.arrayBuffer());
    const ok = res.status === 206 && res.headers.get('content-range') === `bytes ${start}-${end}/${size}` && body.equals(sample.subarray(start, end + 1));
    expect(ok, `${range}: ${res.status} ${res.headers.get('content-range')} 본문 ${body.length}바이트`);
  }
  for (const range of [`bytes=${size}-`, `bytes=${size + 10}-${size + 20}`, 'bytes=-0']) {
    res = await fetch(sampleUrl, { headers: { Range: range } });
    await res.arrayBuffer();
    expect(res.status === 416 && res.headers.get('content-range') === `bytes */${size}`, `${range}: ${res.status} ${res.headers.get('content-range')} (범위 밖 416)`);
  }
  for (const range of ['items=0-10', 'bytes=0-1,5-6', 'bytes=50-10']) {
    res = await fetch(sampleUrl, { headers: { Range: range } });
    await res.arrayBuffer();
    expect(res.status === 200, `${range}: ${res.status} (읽을 수 없는 Range는 무시하고 전체 200)`);
  }
  res = await fetch(sampleUrl, { method: 'HEAD', headers: { Range: 'bytes=0-9' } });
  expect(res.status === 206 && res.headers.get('content-length') === '10', `HEAD + Range: ${res.status}, 길이 ${res.headers.get('content-length')}`);
  for (const [path, method, want] of [
    ['/../package.json', 'GET', 403], ['/%2e%2e/package.json', 'GET', 403], ['/..%5cpackage.json', 'GET', 403],
    ['/assets/../../scripts/serve.mjs', 'GET', 403], ['/', 'POST', 405], ['/nope.png', 'GET', 404],
  ]) {
    const status = await rawRequest(path, method);
    expect(status === want, `${method} ${path}: ${status} (기대 ${want})`);
  }

  // 1) 안내 패널 6단계: 세 해상도 × 대기 / 연결
  for (const [w, h] of SIZES) {
    const tag = `${w}x${h}`;
    console.log(`${tag} 안내 패널`);
    await load(w, h);
    let s = await run('__check.state()');
    expect(s.state === 'waiting' && s.texts.includes('C: 폰 화면 연결'), `${tag}: 대기 문구와 힌트`);
    const g = await run('__check.guide()');
    expect(g.step === 1 && !g.helpShown, `${tag}: 처음엔 1단계, 키 안내 꺼짐`);
    await checkAllSteps(tag, '대기', w);
    await attachTestVideo(1080, 2400);
    await checkAllSteps(tag, '연결', w);
  }

  // 2) 영상 연결: 가장 작은 화면과 가장 큰 화면
  for (const [w, h] of VIDEO_SIZES) {
    const tag = `${w}x${h}`;
    console.log(`${tag} 영상`);
    await load(w, h);

    // 붙이는 함수에 테스트 영상을 직접 넣는다
    await attachTestVideo(1080, 2400);
    let s = await run('__check.state()');
    checkFit(s, 1080, 2400, `${tag} 1080x2400`);
    checkLayout(s, `${tag} 1080x2400`);
    await shot(`${tag}-video-1-1080x2400`);

    // 같은 스트림에서 영상 크기를 바꾼다 (resize 이벤트)
    await run(`(async () => {
      __check.a.canvas.height = 2340; __check.a.draw();
      await __check.waitFor(() => __check.aspect() === '1080 / 2340');
    })()`);
    await sleep(300);
    s = await run('__check.state()');
    checkFit(s, 1080, 2340, `${tag} 1080x2340 (resize)`);
    checkLayout(s, `${tag} 1080x2340`);
    await shot(`${tag}-video-2-1080x2340`);

    // C 키 → 창 고르기 취소: 지금 화면이 그대로 남아야 한다
    await run('__check.stubCapture()');
    await press('KeyC');
    await sleep(300);
    s = await run('__check.state()');
    const cancel = await run(`({ calls: __check.calls, live: __check.a.stream.getVideoTracks()[0].readyState })`);
    expect(cancel.calls.length === 1, `${tag} C 키: getDisplayMedia 호출 ${cancel.calls.length}회`);
    const opts = cancel.calls[0] ?? {};
    expect(opts.audio === false && opts.video?.displaySurface === 'window' && opts.selfBrowserSurface === 'exclude', `${tag} C 키: 옵션 ${JSON.stringify(opts)}`);
    expect(s.state === 'connected' && cancel.live === 'live', `${tag} 취소: 기존 영상 유지 (${s.state}, ${cancel.live})`);

    // C 키 → 새 창(가로로 긴 창)을 고름: 기존 스트림은 정리되고, 폭 상한에 걸려야 한다
    await run(`(() => {
      __check.b = __check.makeStream(1600, 900);
      navigator.mediaDevices.getDisplayMedia = async () => __check.b.stream;
    })()`);
    await press('KeyC');
    await run(`__check.waitFor(() => __check.aspect() === '1600 / 900')`);
    await sleep(300);
    s = await run('__check.state()');
    const replaced = await run(`__check.a.stream.getVideoTracks()[0].readyState`);
    expect(replaced === 'ended', `${tag} 교체: 기존 스트림 정리 (${replaced})`);
    expect(s.aspectVar === '1600 / 900', `${tag} 교체: --phone-aspect = ${s.aspectVar}`);
    expect(Math.abs(s.screen.w - s.screen.h * 0.75) < 0.5, `${tag} 가로 창: 폭 상한 ${s.screen.w.toFixed(1)} = 높이 x 0.75`);
    checkLayout(s, `${tag} 가로 창`);
    await shot(`${tag}-video-3-landscape-capped`);

    // 트랙이 끝남: 대기 화면과 끊김 문구로 돌아와야 한다.
    // track.stop()만으로는 ended 이벤트가 생기지 않아서(명세) 이벤트를 직접 보낸다.
    await run(`(() => {
      const track = __check.b.stream.getVideoTracks()[0];
      track.stop();
      track.dispatchEvent(new Event('ended'));
    })()`);
    await sleep(300);
    s = await run('__check.state()');
    expect(s.state === 'disconnected' && !s.video.shown && !s.video.hasSrc, `${tag} 끊김: 영상 정리 (${s.state})`);
    expect(s.texts.includes('폰 화면 연결이 끊겼어요') && s.texts.includes('C를 눌러 다시 연결해요'), `${tag} 끊김: 문구 ${JSON.stringify(s.texts)}`);
    expect(s.aspectVar === '9 / 20', `${tag} 끊김: 비율 기본값 복귀 (${s.aspectVar})`);
    checkLayout(s, `${tag} 끊김`);
    await shot(`${tag}-video-4-disconnected`);
  }

  // 3) 키 조작
  console.log('키 조작');
  await load(1280, 720);
  await run('__check.stubCapture(); __check.logKeys()');
  const step = async () => (await run('__check.guide()')).step;
  const steps = [];
  for (const [code, opts] of [
    ['ArrowLeft'], // 1단계에서 ← → 1 (멈춤)
    ['ArrowRight'], ['ArrowRight'], ['ArrowRight'], // → 4
    ['ArrowLeft'], // → 3
    ['Digit6'], ['ArrowRight'], // → 6, 6에서 → (멈춤)
    ['Numpad2'], // → 2
    ['Digit4'], ['Digit2'], // 4단계 뒤 2단계로
    ['Home'], // → 1
  ]) {
    await press(code, opts);
    steps.push(await step());
  }
  expect(steps.join(',') === '1,2,3,4,3,6,6,2,4,2,1', `←/→/1~6/Home 이동: ${steps.join(',')} (기대 1,2,3,4,3,6,6,2,4,2,1)`);

  // 길게 눌러 생기는 반복 입력은 무시한다
  await press('Digit3');
  await press('ArrowRight', { repeat: true });
  await press('ArrowLeft', { repeat: true });
  await press('Home', { repeat: true });
  await press('Digit5', { repeat: true });
  expect((await step()) === 3, `반복 입력 무시: 3단계 유지 (${await step()})`);
  await press('KeyH', { repeat: true });
  expect(!(await run('__check.guide()')).helpShown, '반복 입력 무시: H 반복으로 키 안내가 켜지지 않음');
  await press('KeyC', { repeat: true });
  expect((await run('__check.calls.length')) === 0, '반복 입력 무시: C 반복으로 화면 공유가 열리지 않음');
  for (const code of ['KeyR', 'KeyP', 'Comma', 'Period', 'KeyL']) await press(code, { repeat: true });
  const afterRepeat = await run('__check.state()');
  expect(afterRepeat.mode === 'live' && !afterRepeat.rec.src, `반복 입력 무시: R·P·,·.·L 반복으로 녹화 모드가 되지 않음 (${afterRepeat.mode})`);

  // Ctrl·Alt·Meta가 함께 눌린 입력은 모두 무시하고, 기본 동작도 막지 않는다(브라우저 단축키에 맡긴다).
  // 실제 키 입력(Input.dispatchKeyEvent)으로 보내면 헤드리스 Chrome이 단축키를 실행해
  // (Ctrl+H 방문 기록 탭, Ctrl+Shift+C 개발자 도구) 시연 탭이 뒤로 밀리므로, 페이지 안에서 키 이벤트를 만들어 보낸다.
  // 셸의 keydown 처리는 실제 입력과 똑같이 이 이벤트를 받는다.
  const modCombos = await run(`(() => [
    ['KeyC', 'c', { ctrlKey: true }], ['KeyC', 'C', { ctrlKey: true, shiftKey: true }],
    ['KeyC', 'c', { altKey: true }], ['KeyC', 'c', { metaKey: true }],
    ['ArrowRight', 'ArrowRight', { ctrlKey: true }], ['ArrowLeft', 'ArrowLeft', { altKey: true }],
    ['Home', 'Home', { ctrlKey: true }], ['Digit5', '5', { altKey: true }], ['Digit6', '6', { metaKey: true }],
    ['KeyH', 'h', { ctrlKey: true }],
    ['KeyR', 'r', { ctrlKey: true }], ['KeyR', 'R', { ctrlKey: true, shiftKey: true }], ['KeyR', 'r', { metaKey: true }],
    ['KeyP', 'p', { ctrlKey: true }], ['KeyL', 'l', { ctrlKey: true }], ['KeyL', 'l', { altKey: true }],
    ['Comma', ',', { ctrlKey: true }], ['Period', '.', { altKey: true }],
  ].map(([code, key, mods]) => {
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true, ...mods });
    document.dispatchEvent(event);
    return { combo: Object.keys(mods).map(m => m.replace('Key', '')).join('+') + '+' + code, prevented: event.defaultPrevented };
  }))()`);
  const afterMods = await run('({ calls: __check.calls.length, guide: __check.guide() })');
  expect(afterMods.calls === 0, `수정 키 무시: Ctrl+C, Ctrl+Shift+C, Alt+C, Meta+C가 화면 공유를 열지 않음 (${afterMods.calls}회)`);
  expect(afterMods.guide.step === 3 && !afterMods.guide.helpShown, `수정 키 무시: 단계·키 안내 그대로 (${afterMods.guide.step}단계)`);
  const modeAfterMods = await run('__check.state()');
  expect(modeAfterMods.mode === 'live' && !modeAfterMods.rec.src, `수정 키 무시: Ctrl+R, Ctrl+P, Ctrl+L 등이 녹화 모드를 켜지 않음 (${modeAfterMods.mode})`);
  const wronglyPrevented = modCombos.filter((k) => k.prevented);
  expect(wronglyPrevented.length === 0, `수정 키 조합 ${modCombos.length}개는 기본 동작을 막지 않음 ${wronglyPrevented.length ? JSON.stringify(wronglyPrevented) : ''}`);

  // H: 키 안내 켜고 끄기
  await press('KeyH');
  const helpOn = (await run('__check.guide()')).helpShown;
  await shot('keys-help-on');
  await press('KeyH');
  const helpOff = (await run('__check.guide()')).helpShown;
  expect(helpOn && !helpOff, `H: 키 안내 켜짐 → 꺼짐 (${helpOn} → ${helpOff})`);

  // C: 화면 공유만 열고 단계는 그대로. 다른 키는 화면 공유를 열지 않는다(위에서 0회 확인)
  await press('KeyC');
  await sleep(100);
  const afterC = await run('({ calls: __check.calls.length, step: __check.guide().step })');
  expect(afterC.calls === 1 && afterC.step === 3, `C: getDisplayMedia ${afterC.calls}회, 단계 ${afterC.step} 유지`);

  // 녹화 키도 기본 동작 막기 기록에 넣는다(R로 녹화 모드 → P·,·. → L로 복귀). 동작 자체는 아래 녹화 모드 확인에서 본다
  for (const code of ['KeyR', 'KeyP', 'Comma', 'Period', 'KeyL']) await press(code);
  const afterRecKeys = await run('({ mode: __check.state().mode, step: __check.guide().step, calls: __check.calls.length })');
  expect(afterRecKeys.mode === 'live' && afterRecKeys.step === 3 && afterRecKeys.calls === 1, `R → L: 라이브로 돌아오고 단계·화면 공유 그대로 (${JSON.stringify(afterRecKeys)})`);

  // 기본 동작 막기: 셸이 맡은 키(실제 키 입력, 반복 포함)는 모두 막는다
  const keyLog = (await run('__check.keys')).filter((k) => !k.mods || k.mods === 'Shift');
  const notPrevented = keyLog.filter((k) => !k.prevented);
  const repeats = keyLog.filter((k) => k.repeat).length;
  expect(keyLog.length > 0 && notPrevented.length === 0, `기본 동작 막기: 셸 키 ${keyLog.length}개(반복 ${repeats}개 포함) 모두 preventDefault ${notPrevented.length ? JSON.stringify(notPrevented) : ''}`);

  // 키 확인 중에 다른 탭(방문 기록, 개발자 도구 등)이 열려 시연 탭이 가려지지 않았는지
  const vis = await run('document.visibilityState');
  const pages = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).filter((t) => t.type === 'page');
  expect(vis === 'visible' && pages.length === 1, `키 확인 뒤에도 시연 탭만 열려 있고 보임 (${vis}, 탭 ${pages.length}개)`);

  // 4) 2단계 경과 시간
  console.log('경과 시간');
  await press('Digit2');
  const t0 = await run('performance.now()');
  // 250ms마다 갱신하므로 2초 경계에 걸리지 않게 2.6초 기다린다
  await sleep(2600);
  const e1 = await run('__check.guide()');
  const waited = Math.round((await run('performance.now()')) - t0);
  expect(e1.elapsedShown && e1.elapsed === '0:02', `2단계 경과 시간이 오름: ${e1.elapsed} (페이지 시간 ${waited}ms, 단계 ${e1.step})`);
  await shot('elapsed-step2');
  await press('Digit3');
  const e2 = await run('__check.guide()');
  await press('Digit2');
  const e3 = await run('__check.guide()');
  expect(!e2.elapsedShown && e3.elapsed === '0:00', `다른 단계로 갔다 오면 초기화: 3단계 표시 ${e2.elapsedShown}, 다시 2단계 ${e3.elapsed}`);

  // 5) 동작 줄이기
  console.log('동작 줄이기');
  // 단계 전환 애니메이션은 짧아서 재는 사이에 끝날 수 있으므로 animationstart 이벤트로 기록한다
  const motion = async () => {
    await run(`(() => {
      __check.stepAnims = [];
      document.querySelector('.guide-body').addEventListener('animationstart', (e) =>
        __check.stepAnims.push(parseFloat(getComputedStyle(e.target).animationDuration) * 1000));
    })()`);
    await press('ArrowRight');
    await sleep(400);
    return run(`(() => {
      const sheet = document.querySelector('.guide-duck-sheet');
      return {
        stepAnims: __check.stepAnims.length,
        stepDuration: __check.stepAnims[0] ?? 0,
        sheetAnim: getComputedStyle(sheet).animationName,
        sheetFrameMs: parseFloat(getComputedStyle(sheet).animationDuration) * 1000 / 6,
        waitingDuck: getComputedStyle(document.querySelector('.phone-waiting-duck')).animationName,
        reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    })()`);
  };
  await load(1280, 720);
  const normal = await motion();
  expect(normal.stepAnims === 1 && normal.stepDuration > 0 && normal.stepDuration <= 300, `기본: 단계 전환 ${normal.stepDuration}ms (300ms 이하)`);
  expect(normal.sheetAnim === 'duck-sheet' && normal.sheetFrameMs === 250, `기본: 오리 동작 재생, 칸당 ${normal.sheetFrameMs}ms`);
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await load(1280, 720);
  const reduced = await motion();
  expect(reduced.reduce, `동작 줄이기 흉내 적용됨 (${reduced.reduce})`);
  expect(reduced.stepAnims === 0, `동작 줄이기: 단계 전환 없음 (${reduced.stepAnims}개)`);
  expect(reduced.sheetAnim === 'none' && reduced.waitingDuck === 'none', `동작 줄이기: 오리 동작 멈춤 (${reduced.sheetAnim}, ${reduced.waitingDuck})`);
  await send('Emulation.setEmulatedMedia', { features: [] });

  // 6) 녹화 모드
  console.log('녹화 모드');
  if (realRecording) {
    console.log('  건너뜀: 실제 녹화(public/recordings/demo.mp4)가 있어요. 파일을 잠시 다른 곳으로 옮기면 전부 확인할 수 있어요.');
  } else {
    // 파일이 없을 때 안내
    await load(1280, 720);
    await press('KeyR');
    await run(`__check.waitFor(() => document.querySelector('.phone').dataset.recording === 'missing')`);
    let s = await recState();
    expect(s.mode === 'recording' && s.missingShown && s.missingText === '녹화 영상이 없어요 (public/recordings/demo.mp4)' && !s.rec.shown,
      `파일 없음: 안내 "${s.missingText}" 표시 ${s.missingShown}`);
    expect(s.badgeShown, `파일 없음: "녹화 영상" 표시는 그대로 (${s.badgeShown})`);
    checkLayout(s, '파일 없음');
    await shot('recording-missing');
    await press('KeyL');
    s = await recState();
    expect(s.mode === 'live' && s.state === 'waiting' && !s.missingShown && !s.badgeShown, `파일 없음 → L: 대기 화면 (${s.mode}/${s.state})`);

    // 테스트 영상 만들기 (표시 파일을 먼저 만들어, 중간에 멈춰도 다음 실행에서 지울 수 있게 한다)
    console.log('  테스트 영상 녹화 중(8초)');
    const video64 = await run(RECORD_TEST_VIDEO);
    mkdirSync(RECORDINGS_DIR, { recursive: true });
    writeFileSync(TEST_MARK, 'npm run check가 만든 테스트 영상 표시. 이 파일이 있으면 demo.mp4는 테스트 영상이다.\n');
    writeFileSync(DEMO_PATH, Buffer.from(video64, 'base64'));
    res = await fetch(`${BASE}recordings/demo.mp4`, { headers: { Range: 'bytes=0-15' } });
    await res.arrayBuffer();
    expect(res.status === 206 && res.headers.get('content-type') === 'video/mp4', `demo.mp4: ${res.status} ${res.headers.get('content-type')}`);

    // R: 처음부터 재생. 2단계에서 경과 시간이 숨는지 함께 본다
    await load(1280, 720);
    await press('Digit2');
    await press('KeyR');
    await waitRec('!r.paused && r.currentTime > 0.5');
    s = await recState();
    let g = await run('__check.guide()');
    expect(s.mode === 'recording' && s.bodyMode === 'recording' && s.rec.shown && !s.video.shown, `R: 녹화 모드, 녹화 영상 표시 (${s.mode})`);
    expect(!s.rec.paused && s.rec.muted && !s.rec.loop, `R: 재생 중, 소리 없음, 반복 없음 (paused ${s.rec.paused}, muted ${s.rec.muted}, loop ${s.rec.loop})`);
    expect(s.badgeShown && s.badgeText === '녹화 영상', `R: "녹화 영상" 표시 (${s.badgeShown})`);
    expect(s.aspectVar === '360 / 720' && Math.abs(s.screen.w - s.screen.h / 2) < 0.5, `R: 비율 ${s.aspectVar}, 프레임 ${s.screen.w.toFixed(1)}x${s.screen.h.toFixed(1)}`);
    expect(g.step === 2 && !g.elapsedShown, `R: 2단계 경과 시간 숨김 (${g.elapsedShown})`);
    checkLayout(s, 'R 재생');
    await shot('recording-playing-step2');

    // P: 일시정지 → 시간이 멈춘다
    await press('KeyP');
    await sleep(200);
    const paused1 = (await recState()).rec;
    await sleep(500);
    const paused2 = (await recState()).rec;
    expect(paused1.paused && paused1.t === paused2.t, `P: 일시정지 (${paused1.t.toFixed(2)}s → ${paused2.t.toFixed(2)}s)`);

    // . / , : 5초 앞으로 / 뒤로
    const t1 = paused2.t;
    await press('Period');
    await waitRec(`Math.abs(r.currentTime - ${t1 + 5}) < 0.05 && !r.seeking`);
    const fwd = (await recState()).rec.t;
    await press('Comma');
    await waitRec(`Math.abs(r.currentTime - ${t1}) < 0.05 && !r.seeking`);
    const back = (await recState()).rec.t;
    expect(Math.abs(fwd - (t1 + 5)) < 0.05 && Math.abs(back - t1) < 0.05, `. / ,: ${t1.toFixed(2)}s → ${fwd.toFixed(2)}s → ${back.toFixed(2)}s`);
    await press('Comma');
    await waitRec('r.currentTime === 0 && !r.seeking');
    expect((await recState()).rec.t === 0, ', 처음보다 앞으로는 가지 않음 (0초에서 멈춤)');

    // P: 다시 재생
    await press('KeyP');
    await waitRec('!r.paused && r.currentTime > 0.2');
    expect(!(await recState()).rec.paused, 'P: 다시 재생');

    // 끝까지: 마지막 화면에서 멈추고 반복하지 않는다
    await press('Period');
    await press('Period');
    await waitRec('r.ended', 8000);
    await sleep(800);
    s = await recState();
    expect(s.rec.ended && s.rec.paused && Math.abs(s.rec.t - s.rec.duration) < 0.1 && s.rec.shown,
      `끝: 마지막 화면에서 멈춤 (${s.rec.t.toFixed(2)}s / ${s.rec.duration.toFixed(2)}s, ended ${s.rec.ended})`);
    await shot('recording-ended');

    // R 다시: 처음부터 다시 재생
    await press('KeyR');
    await waitRec('!r.paused && r.currentTime > 0.1 && r.currentTime < 2');
    s = await recState();
    expect(!s.rec.paused && s.rec.t < 2, `R 다시: 처음부터 재생 (${s.rec.t.toFixed(2)}s)`);

    // L: 화면 공유가 없으면 대기 화면. 2단계 경과 시간이 다시 보인다
    await press('KeyL');
    s = await recState();
    g = await run('__check.guide()');
    expect(s.mode === 'live' && s.bodyMode === 'live' && s.state === 'waiting' && s.texts.includes('곧 앱 화면이 나와요'), `L(스트림 없음): 대기 화면 (${s.mode}/${s.state})`);
    expect(!s.badgeShown && s.rec.paused && s.aspectVar === '9 / 20' && g.elapsedShown, `L: "녹화 영상" 숨김, 녹화 정지, 비율 기본값, 경과 시간 다시 보임 (${s.aspectVar})`);

    // 라이브 → 녹화 → L: 화면 공유 스트림을 끊지 않고 바로 폰 화면으로 돌아온다
    await attachTestVideo(1080, 2400);
    await run('__check.stubCapture()');
    await press('KeyR');
    await waitRec('!r.paused && r.currentTime > 0.3');
    s = await recState();
    let live = await run(`({ track: __check.a.stream.getVideoTracks()[0].readyState })`);
    expect(s.mode === 'recording' && s.aspectVar === '360 / 720' && s.video.hasSrc && live.track === 'live',
      `라이브 → R: 녹화 표시, 화면 공유는 살아 있음 (${live.track}, 비율 ${s.aspectVar})`);
    await shot('recording-over-live');
    await press('KeyL');
    await sleep(200);
    s = await recState();
    live = await run(`({ track: __check.a.stream.getVideoTracks()[0].readyState, calls: __check.calls.length })`);
    expect(s.mode === 'live' && s.state === 'connected' && s.video.shown && s.aspectVar === '1080 / 2400' && live.track === 'live' && live.calls === 0,
      `R → L: 창을 다시 고르지 않고 폰 화면 복귀 (${s.state}, 비율 ${s.aspectVar}, 공유 창 ${live.calls}회)`);

    // 녹화 중 C: 고르기를 취소하면 녹화 유지, 새 창을 고르면 라이브로 돌아온다
    await press('KeyR');
    await press('KeyC');
    await sleep(200);
    s = await recState();
    expect(s.mode === 'recording' && (await run('__check.calls.length')) === 1, `녹화 중 C 취소: 녹화 유지 (${s.mode})`);
    await run(`(() => {
      __check.b = __check.makeStream(1080, 2340);
      navigator.mediaDevices.getDisplayMedia = async () => __check.b.stream;
    })()`);
    await press('KeyC');
    await run(`__check.waitFor(() => __check.aspect() === '1080 / 2340')`);
    s = await recState();
    expect(s.mode === 'live' && s.state === 'connected' && s.aspectVar === '1080 / 2340' && !s.badgeShown, `녹화 중 C 새 창: 라이브로 복귀 (${s.mode}, 비율 ${s.aspectVar})`);

    // 녹화 모드 배치: 세 해상도 × 6단계
    for (const [w, h] of SIZES) {
      const tag = `${w}x${h}`;
      await load(w, h);
      await press('KeyR');
      await waitRec('!r.paused && r.currentTime > 0.2');
      await checkAllSteps(tag, '녹화', w);
    }
  }

  // 7) 네트워크
  console.log('네트워크');
  const unique = [...new Set(requests)];
  const external = unique.filter((url) => !url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('about:'));
  expect(external.length === 0, `외부 요청 0건 ${external.length ? JSON.stringify(external) : ''}`);
  for (const path of ['scripts/main.js', 'scripts/phone-view.js', 'scripts/guide.js', 'scripts/steps.js', 'scripts/recording.js']) {
    const mime = responses.get(BASE + path);
    expect(mime === 'text/javascript', `${path} MIME = ${mime}`);
  }
  if (!realRecording) {
    const mime = responses.get(`${BASE}recordings/demo.mp4`);
    expect(mime === 'video/mp4', `recordings/demo.mp4 MIME = ${mime}`);
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ requests: unique, external, mime: Object.fromEntries(responses), failures }, null, 2));
} catch (error) {
  failures.push(String(error));
  console.error(error);
} finally {
  cleanup();
  // 테스트 영상은 반드시 지운다(표시 파일이 있을 때만. 실제 녹화는 건드리지 않는다)
  removeTestVideo();
}

const skipped = realRecording ? ' (실제 녹화 파일이 있어 녹화 모드 확인은 건너뜀)' : '';
console.log(`\n결과: ${failures.length ? `실패 ${failures.length}건` : '모두 통과'}${skipped}`);
console.log(`스크린샷과 report.json: ${OUT}`);
process.exit(failures.length ? 1 : 0);
