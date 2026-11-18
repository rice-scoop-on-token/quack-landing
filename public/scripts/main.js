// 발표자 조작은 모두 키보드로 한다. 키와 동작의 연결은 이 파일 한 곳에 모은다.
//   ← / →    이전 / 다음 단계 (1단계와 마지막 단계에서 멈춘다)
//   1 ~ 6    그 단계로 바로 가기
//   Home     1단계로 (다음 관람객 시연 시작)
//   H        발표자용 키 안내 켜고 끄기
//   C        폰 화면 연결 (화면 공유 창 열기). 녹화 모드였다면 라이브로 돌아온다
//   R        녹화 영상을 처음부터 재생 (녹화 모드)
//   P        녹화 영상 재생·일시정지
//   , / .    녹화 영상 5초 뒤로 / 앞으로
//   L        라이브로 돌아가기 (화면 공유가 살아 있으면 바로 폰 화면)
import { attachStream } from './phone-view.js';
import { nextStep, prevStep, showStep, stepCount } from './guide.js';
import { playRecording, seekRecording, showLive, toggleRecordingPlay } from './recording.js';

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

const keysHelp = document.querySelector('.keys-help');

function toggleKeysHelp() {
  keysHelp.hidden = !keysHelp.hidden;
}

// event.code(자판 위치)로 고른다. 한글 입력 상태(ㅊ, ㅗ)에서도 같은 키로 잡힌다.
function actionFor(code) {
  switch (code) {
    case 'ArrowRight':
      return nextStep;
    case 'ArrowLeft':
      return prevStep;
    case 'Home':
      return () => showStep(1);
    case 'KeyH':
      return toggleKeysHelp;
    case 'KeyC':
      return connectPhone;
    case 'KeyR':
      return playRecording;
    case 'KeyP':
      return toggleRecordingPlay;
    case 'Comma':
      return () => seekRecording(-1);
    case 'Period':
      return () => seekRecording(1);
    case 'KeyL':
      return showLive;
  }
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) {
    const n = Number(digit[1]);
    if (n >= 1 && n <= stepCount) return () => showStep(n);
  }
  return null;
}

document.addEventListener('keydown', (event) => {
  // Ctrl·Alt·Meta가 함께 눌리면 브라우저 단축키(Ctrl+C 복사 등)이므로 손대지 않는다
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const action = actionFor(event.code);
  if (!action) return;
  // 셸이 맡은 키는 브라우저 기본 동작(Home 스크롤 등)을 막는다. 길게 눌러 반복될 때도 막는다.
  event.preventDefault();
  // 길게 눌러 생기는 반복 입력으로 단계가 여러 칸 넘어가지 않게 한다
  if (event.repeat) return;
  action();
});

document.querySelector('.phone-waiting').addEventListener('click', connectPhone);
