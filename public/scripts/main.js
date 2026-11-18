// 발표자 조작: C 키(또는 대기 화면 클릭)로 화면 공유 창을 열어 scrcpy 창을 고른다.
import { attachStream } from './phone-view.js';

// 오디오는 받지 않는다. 창 공유 탭이 먼저 보이게 하고, 시연 화면 탭 자신은 목록에서 뺀다.
const CAPTURE_OPTIONS = {
  video: { displaySurface: 'window' },
  audio: false,
  selfBrowserSurface: 'exclude',
};

let picking = false;

async function connectPhone() {
  if (picking || !navigator.mediaDevices?.getDisplayMedia) return;
  picking = true;
  try {
    // 새 창을 먼저 고르고, 성공했을 때만 기존 화면을 바꾼다.
    // 고르기를 취소하면 지금 보이는 화면이 그대로 남는다.
    const stream = await navigator.mediaDevices.getDisplayMedia(CAPTURE_OPTIONS);
    attachStream(stream);
  } catch (error) {
    // 취소(NotAllowedError)는 정상 동작이라 조용히 넘어간다
    if (error.name !== 'NotAllowedError') console.error('폰 화면 연결 실패', error);
  } finally {
    picking = false;
  }
}

document.addEventListener('keydown', (event) => {
  if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  // event.code는 자판 위치 기준이라 한글 입력 상태(ㅊ)에서도 C로 잡힌다
  if (event.code === 'KeyC') {
    event.preventDefault();
    connectPhone();
  }
});

document.querySelector('.phone-waiting').addEventListener('click', connectPhone);
