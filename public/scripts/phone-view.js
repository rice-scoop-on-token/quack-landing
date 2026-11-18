// 폰 프레임에 영상 스트림을 붙이고 떼는 일만 맡는다.
// 스트림을 어디서 받았는지(화면 공유, 테스트 영상 등)는 신경 쓰지 않는다.

const phone = document.querySelector('.phone');
const video = document.querySelector('.phone-video');
const root = document.documentElement;

// 지금 붙어 있는 스트림. { stream, track, onEnded } 또는 null
let current = null;
let wakeLock = null;
let wakeLockPending = false;

// 스트림을 폰 프레임에 붙인다. 이미 붙어 있던 스트림은 새 스트림을 붙인 뒤 정리한다.
export function attachStream(stream) {
  const [track] = stream.getVideoTracks();
  if (!track) throw new Error('영상 트랙이 없는 스트림이에요');

  const previous = current;
  // 공유 중지나 scrcpy 창 닫힘으로 트랙이 끝나면 대기 화면으로 돌아간다.
  // 이미 다른 스트림으로 바뀐 뒤라면 무시한다.
  const onEnded = () => {
    if (current?.stream === stream) detachStream();
  };
  track.addEventListener('ended', onEnded);
  current = { stream, track, onEnded };

  video.srcObject = stream;
  video.play().catch(() => {
    // muted라 자동 재생이 막히지 않는다. 막혀도 autoplay 속성이 다시 시도한다.
  });
  phone.dataset.state = 'connected';

  if (previous) stopEntry(previous);
  requestWakeLock();
}

// 영상을 떼고 대기 화면(끊김 문구)으로 돌아간다.
export function detachStream() {
  if (current) stopEntry(current);
  current = null;
  video.srcObject = null;
  root.style.removeProperty('--phone-aspect');
  phone.dataset.state = 'disconnected';
  releaseWakeLock();
}

function stopEntry(entry) {
  entry.track.removeEventListener('ended', entry.onEnded);
  for (const track of entry.stream.getTracks()) track.stop();
}

// 프레임 비율을 영상 비율에 맞춘다. 처음 메타데이터를 받을 때와 영상 크기가 바뀔 때 모두 부른다.
function updateAspect() {
  const { videoWidth, videoHeight } = video;
  if (!current || !videoWidth || !videoHeight) return;
  root.style.setProperty('--phone-aspect', `${videoWidth} / ${videoHeight}`);
}

video.addEventListener('loadedmetadata', updateAspect);
video.addEventListener('resize', updateAspect);

// 연결된 동안 노트북 화면이 꺼지지 않게 한다. 지원하지 않거나 거절되면 조용히 넘어간다.
async function requestWakeLock() {
  if (!('wakeLock' in navigator) || !current || wakeLock || wakeLockPending) return;
  if (document.visibilityState !== 'visible') return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
    wakeLock = lock;
    // 요청하는 사이에 연결이 끊겼으면 바로 놓는다
    if (!current) releaseWakeLock();
  } catch {
    // 지원하지 않거나 거절됨
  } finally {
    wakeLockPending = false;
  }
}

function releaseWakeLock() {
  const lock = wakeLock;
  wakeLock = null;
  lock?.release().catch(() => {});
}

// 탭이 가려지면 브라우저가 Wake Lock을 풀기 때문에, 다시 보일 때 다시 요청한다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});
