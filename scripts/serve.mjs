// 부스 시연 화면용 정적 서버. 의존성 없이 Node 기본 모듈만 쓴다.
// 127.0.0.1에서만 열어 같은 노트북 밖에서는 접속할 수 없게 한다.
// 녹화 영상 재생·탐색을 위해 Range 요청(일부만 받기)을 지원한다.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 4173;
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

// 요청 경로를 public/ 안의 파일 경로로 바꾼다. public/ 밖을 가리키면 null.
function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const filePath = normalize(join(ROOT, decoded));
  return filePath.startsWith(ROOT) || filePath + sep === ROOT ? filePath : null;
}

// Range 헤더를 읽는다.
//   null       → Range를 무시하고 파일 전체를 보낸다(헤더 없음, 형식이 틀림, 범위가 여러 개)
//   'invalid'  → 파일 크기를 벗어난 범위(416)
//   {start, end} → 그 범위만 보낸다(206). end는 포함
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, startText, endText] = match;
  if (startText === '' && endText === '') return null;

  let start;
  let end;
  if (startText === '') {
    // bytes=-n: 마지막 n바이트
    const suffix = Number(endText);
    if (suffix === 0) return 'invalid';
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
    if (endText !== '' && Number(endText) < start) return null;
  }
  if (start >= size || size === 0) return 'invalid';
  return { start, end };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'Method Not Allowed');
    return;
  }

  let filePath = resolvePath(req.url ?? '/');
  if (!filePath) {
    send(res, 403, 'Forbidden');
    return;
  }

  let info;
  try {
    info = await stat(filePath);
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html');
      info = await stat(filePath);
    }
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') send(res, 404, 'Not Found');
    else send(res, 500, 'Internal Server Error');
    return;
  }

  const size = info.size;
  const headers = {
    'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    // 시연 중 파일을 고치면 새로고침만으로 바로 반영되도록 캐시를 끈다.
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
  };

  const range = parseRange(req.headers.range, size);
  if (range === 'invalid') {
    send(res, 416, 'Range Not Satisfiable', { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' });
    return;
  }

  const { start, end } = range ?? { start: 0, end: size - 1 };
  const status = range ? 206 : 200;
  if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  headers['Content-Length'] = size === 0 ? 0 : end - start + 1;
  res.writeHead(status, headers);

  if (req.method === 'HEAD' || size === 0) {
    res.end();
    return;
  }
  // 영상처럼 큰 파일도 메모리에 다 읽지 않고 필요한 범위만 흘려보낸다
  const stream = createReadStream(filePath, { start, end });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`${PORT}번 포트를 이미 쓰고 있어요. 열려 있는 다른 서버를 끄고 다시 실행해 주세요.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`시연 화면: http://${HOST}:${PORT}`);
  console.log('끄려면 Ctrl+C');
});
