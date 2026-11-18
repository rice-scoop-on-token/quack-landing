// 폰 프레임이 무엇을 보여 줄지 정한다.
//   모드 live      : 화면 공유로 받은 폰 화면(없으면 대기 화면)
//   모드 recording : 사전 녹화 영상(재생 조작은 recording.js)
// 녹화 모드로 가도 화면 공유 스트림은 끊지 않는다. 그래서 라이브로 돌아오면 창을 다시 고르지 않아도 된다.
// 스트림을 어디서 받았는지(화면 공유, 테스트 영상 등)는 신경 쓰지 않는다.

const phone = document.querySelector('.phone');
const liveVideo = document.querySelector('.phone-video');
const recordingVideo = document.querySelector('.phone-recording');
const root = document.documentElement;

let mode = 'live';
// 지금 붙어 있는 라이브 스트림. { stream, track, onEnded } 또는 null
let current = null;
let wakeLock = null;
let wakeLockPending = false;

export function getMode() {
  return mode;
}

// 폰 프레임 모드를 바꾼다. 안내 패널도 모드를 알아야 해서(녹화 모드에서 경과 시간 숨김) body에도 적는다.
export function setMode(next) {
  mode = next;
  phone.dataset.mode = next;
  document.body.dataset.phoneMode = next;
  if (next !== 'recording') recordingVideo.pause();
  refreshAspect();
  updateWakeLock();
}

// 스트림을 폰 프레임에 붙이고 라이브 모드로 간다. 이미 붙어 있던 스트림은 새 스트림을 붙인 뒤 정리한다.
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

  liveVideo.srcObject = stream;
  liveVideo.play().catch(() => {
    // muted라 자동 재생이 막히지 않는다. 막혀도 autoplay 속성이 다시 시도한다.
  });
  phone.dataset.state = 'connected';

  if (previous) stopEntry(previous);
  setMode('live');
}

// 라이브 영상을 떼고 대기 화면(끊김 문구)으로 돌아간다. 녹화 모드였다면 녹화 영상은 그대로 둔다.
export function detachStream() {
  if (current) stopEntry(current);
  current = null;
  liveVideo.srcObject = null;
  phone.dataset.state = 'disconnected';
  refreshAspect();
  updateWakeLock();
}

function stopEntry(entry) {
  entry.track.removeEventListener('ended', entry.onEnded);
  for (const track of entry.stream.getTracks()) track.stop();
}

// 프레임 비율을 지금 보이는 영상의 비율에 맞춘다. 보이는 영상이 없으면 기본 비율로 돌린다.
// 영상 메타데이터를 처음 받을 때, 영상 크기가 바뀔 때, 모드가 바뀔 때 부른다.
function refreshAspect() {
  const video = mode === 'recording' ? recordingVideo : current ? liveVideo : null;
  if (video?.videoWidth && video.videoHeight) {
    root.style.setProperty('--phone-aspect', `${video.videoWidth} / ${video.videoHeight}`);
  } else {
    root.style.removeProperty('--phone-aspect');
  }
}

for (const video of [liveVideo, recordingVideo]) {
  video.addEventListener('loadedmetadata', refreshAspect);
  video.addEventListener('resize', refreshAspect);
  video.addEventListener('emptied', refreshAspect);
}

// 라이브 연결 중이거나 녹화 영상을 보여 주는 동안 노트북 화면이 꺼지지 않게 한다.
// 지원하지 않거나 거절되면 조용히 넘어간다.
function updateWakeLock() {
  if (current || mode === 'recording') requestWakeLock();
  else releaseWakeLock();
}

async function requestWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock || wakeLockPending) return;
  if (document.visibilityState !== 'visible') return;
  wakeLockPending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => {
      if (wakeLock === lock) wakeLock = null;
    });
    wakeLock = lock;
    // 요청하는 사이에 필요 없어졌으면 바로 놓는다
    if (!current && mode !== 'recording') releaseWakeLock();
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
  if (document.visibilityState === 'visible') updateWakeLock();
});

setMode('live');
