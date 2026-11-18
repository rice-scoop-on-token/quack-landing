// 시연 화면 자동 확인. 의존성 없이 설치된 Chrome(또는 Edge)을 헤드리스로 띄워 DevTools 프로토콜로 조작한다.
//   npm run check
// 확인하는 것: 해상도별 스크롤·잘림, 외부 요청 0건, 모듈 스크립트 MIME,
//   테스트 영상(캔버스 captureStream)을 붙였을 때 비율 갱신·화면 맞춤, C 키 연결·취소·교체, 끊김 처리.
// 스크린샷과 결과(report.json)는 OS 임시 폴더에만 저장한다. 레포 안에는 아무것도 쓰지 않는다.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:4173/';
const SIZES = [[1280, 720], [1536, 864], [1920, 1080]];
// 영상 확인은 가장 작은 화면과 가장 큰 화면에서 한다
const VIDEO_SIZES = [[1280, 720], [1920, 1080]];
const DEBUG_PORT = 9333;
const OUT = join(tmpdir(), 'quack-landing-check');

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

// ---------- Chrome ----------

const chromePath = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chromePath) {
  console.error('Chrome이나 Edge를 찾지 못했어요. CHROME_PATH 환경 변수로 실행 파일 경로를 알려 주세요.');
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

const ws = new WebSocket(target.webSocketDebuggerUrl);
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

async function pressC() {
  const key = { code: 'KeyC', key: 'c', windowsVirtualKeyCode: 67, nativeVirtualKeyCode: 67 };
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
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
  state: () => {
    const phone = document.querySelector('.phone');
    const screen = document.querySelector('.phone-screen').getBoundingClientRect();
    const video = document.querySelector('.phone-video');
    const visible = (sel) => [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null).map(e => e.textContent.trim());
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5)) out.push(el.className);
    }
    return {
      state: phone.dataset.state,
      aspectVar: getComputedStyle(document.documentElement).getPropertyValue('--phone-aspect').trim(),
      screen: { w: screen.width, h: screen.height },
      video: { w: video.videoWidth, h: video.videoHeight, shown: video.offsetParent !== null, hasSrc: !!video.srcObject },
      texts: visible('.phone-waiting p'),
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      viewport: [innerWidth, innerHeight],
      outOfView: out,
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

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.enable');

try {
  // 1) 대기 화면: 세 해상도
  for (const [w, h] of SIZES) {
    const label = `${w}x${h} 대기`;
    console.log(label);
    await load(w, h);
    const s = await run('__check.state()');
    checkLayout(s, label);
    expect(s.state === 'waiting' && s.texts.includes('C: 폰 화면 연결'), `${label}: 대기 문구와 힌트`);
    await shot(`${w}x${h}-1-waiting`);
  }

  // 2) 영상 연결: 가장 작은 화면과 가장 큰 화면
  for (const [w, h] of VIDEO_SIZES) {
    const tag = `${w}x${h}`;
    console.log(`${tag} 영상`);
    await load(w, h);

    // 붙이는 함수에 테스트 영상을 직접 넣는다
    await run(`(async () => {
      const { attachStream } = await import('/scripts/phone-view.js');
      __check.a = __check.makeStream(1080, 2400);
      attachStream(__check.a.stream);
      await __check.waitFor(() => getComputedStyle(document.documentElement).getPropertyValue('--phone-aspect').trim() === '1080 / 2400');
    })()`);
    await sleep(300);
    let s = await run('__check.state()');
    checkFit(s, 1080, 2400, `${tag} 1080x2400`);
    checkLayout(s, `${tag} 1080x2400`);
    await shot(`${tag}-2-video-1080x2400`);

    // 같은 스트림에서 영상 크기를 바꾼다 (resize 이벤트)
    await run(`(async () => {
      __check.a.canvas.height = 2340; __check.a.draw();
      await __check.waitFor(() => getComputedStyle(document.documentElement).getPropertyValue('--phone-aspect').trim() === '1080 / 2340');
    })()`);
    await sleep(300);
    s = await run('__check.state()');
    checkFit(s, 1080, 2340, `${tag} 1080x2340 (resize)`);
    checkLayout(s, `${tag} 1080x2340`);
    await shot(`${tag}-3-video-1080x2340`);

    // C 키 → 창 고르기 취소: 지금 화면이 그대로 남아야 한다
    await run(`(() => {
      __check.calls = [];
      navigator.mediaDevices.getDisplayMedia = async (options) => {
        __check.calls.push(options);
        throw new DOMException('사용자가 취소함', 'NotAllowedError');
      };
    })()`);
    await pressC();
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
    await pressC();
    await run(`__check.waitFor(() => getComputedStyle(document.documentElement).getPropertyValue('--phone-aspect').trim() === '1600 / 900')`);
    await sleep(300);
    s = await run('__check.state()');
    const replaced = await run(`__check.a.stream.getVideoTracks()[0].readyState`);
    expect(replaced === 'ended', `${tag} 교체: 기존 스트림 정리 (${replaced})`);
    expect(s.aspectVar === '1600 / 900', `${tag} 교체: --phone-aspect = ${s.aspectVar}`);
    expect(Math.abs(s.screen.w - s.screen.h * 0.75) < 0.5, `${tag} 가로 창: 폭 상한 ${s.screen.w.toFixed(1)} = 높이 x 0.75`);
    checkLayout(s, `${tag} 가로 창`);
    await shot(`${tag}-4-video-landscape-capped`);

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
    await shot(`${tag}-5-disconnected`);
  }

  // 3) 네트워크
  console.log('네트워크');
  const unique = [...new Set(requests)];
  const external = unique.filter((url) => !url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('about:'));
  expect(external.length === 0, `외부 요청 0건 ${external.length ? JSON.stringify(external) : ''}`);
  for (const path of ['scripts/main.js', 'scripts/phone-view.js']) {
    const mime = responses.get(BASE + path);
    expect(mime === 'text/javascript', `${path} MIME = ${mime}`);
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ requests: unique, external, mime: Object.fromEntries(responses), failures }, null, 2));
} catch (error) {
  failures.push(String(error));
  console.error(error);
} finally {
  cleanup();
}

console.log(`\n결과: ${failures.length ? `실패 ${failures.length}건` : '모두 통과'}`);
console.log(`스크린샷과 report.json: ${OUT}`);
process.exit(failures.length ? 1 : 0);

function cleanup() {
  try {
    ws?.close();
  } catch {
    // 이미 닫힘
  }
  chrome.kill();
  server?.kill();
}
