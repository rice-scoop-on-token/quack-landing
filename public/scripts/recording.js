// 사전 녹화 영상 재생. 미러링이나 인터넷이 실패했을 때 폰 프레임에 실제 시연 녹화를 대신 보여 준다.
// 영상은 public/recordings/demo.mp4 하나다(리허설 때 scrcpy --record로 녹화, README 참고).
// 소리 없이 재생하고, 끝나면 마지막 화면에서 멈춘다(반복 없음).
import { getMode, setMode } from './phone-view.js';

const SRC = 'recordings/demo.mp4';
const SEEK_SECONDS = 5;

const phone = document.querySelector('.phone');
const video = document.querySelector('.phone-recording');

// 파일이 없거나 재생할 수 없으면 프레임 안에 안내를 띄운다
function setMissing(missing) {
  phone.dataset.recording = missing ? 'missing' : 'ok';
}

video.addEventListener('error', () => setMissing(true));
video.addEventListener('loadeddata', () => setMissing(false));

// R: 녹화 모드로 바꾸고 처음부터 재생한다. 녹화 모드에서 다시 누르면 처음부터 다시 재생한다.
export function playRecording() {
  setMode('recording');
  if (!video.getAttribute('src') || video.error) {
    // 처음이거나 지난번에 파일이 없었으면 새로 부른다(리허설 뒤 파일을 넣어도 새로고침 없이 재생된다)
    setMissing(false);
    video.src = SRC;
  } else {
    video.currentTime = 0;
  }
  play();
}

// P: 재생·일시정지. 녹화 모드에서만 동작한다.
export function toggleRecordingPlay() {
  if (getMode() !== 'recording' || video.error || !video.getAttribute('src')) return;
  if (video.paused) play();
  else video.pause();
}

// , / . : 5초 뒤로·앞으로. 녹화 모드에서만 동작한다. 끝까지 가면 마지막 화면에서 멈춘다.
export function seekRecording(direction) {
  if (getMode() !== 'recording' || !Number.isFinite(video.duration)) return;
  video.currentTime = Math.min(Math.max(video.currentTime + direction * SEEK_SECONDS, 0), video.duration);
}

// L: 라이브 모드로 돌아간다. 화면 공유 스트림이 살아 있으면 바로 폰 화면이, 없으면 대기 화면이 나온다.
export function showLive() {
  setMode('live');
}

function play() {
  video.play().catch((error) => {
    // 다른 키로 영상을 바꾸는 사이 이전 재생 요청이 취소된 것(AbortError)은 정상이다
    if (error.name !== 'AbortError') setMissing(true);
  });
}
