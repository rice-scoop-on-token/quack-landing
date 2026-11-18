// 부스 시연 화면용 정적 서버. 의존성 없이 Node 기본 모듈만 쓴다.
// 127.0.0.1에서만 열어 같은 노트북 밖에서는 접속할 수 없게 한다.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
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

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
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

  try {
    if ((await stat(filePath)).isDirectory()) filePath = join(filePath, 'index.html');
    const body = await readFile(filePath);
    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    // 시연 중 파일을 고치면 새로고침만으로 바로 반영되도록 캐시를 끈다.
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') send(res, 404, 'Not Found');
    else send(res, 500, 'Internal Server Error');
  }
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
