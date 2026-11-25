// 발표 슬라이드 키 조작. 녹화에 잡히면 안 되므로 화면에는 번호도 키 안내도 두지 않는다.
//   → / PageDown / Space   다음 장 (마지막 장에서 멈춘다)
//   ← / PageUp             이전 장 (첫 장에서 멈춘다)
//   Home / End             첫 장 / 마지막 장
// 시연 화면(main.js)과 같은 규칙: event.code 기준(한글 입력 상태에서도 동작), Ctrl·Alt·Meta 조합은 무시,
// 맡은 키는 기본 동작을 막고, 길게 눌러 생기는 반복 입력은 무시한다.

const slides = [...document.querySelectorAll('.slide')];
let current = 0; // 아직 아무 장도 보이지 않음

export const slideCount = slides.length;

export function currentSlide() {
  return current;
}

// n번째 장(1부터)을 보여 준다. 범위를 벗어나면 첫 장이나 마지막 장에서 멈춘다.
// 전환(180ms 페이드)은 CSS가 맡고, "동작 줄이기"면 CSS가 끈다.
export function showSlide(n) {
  const next = Math.min(Math.max(n, 1), slides.length);
  if (next === current) return;
  current = next;
  slides.forEach((slide, i) => {
    const active = i === next - 1;
    slide.classList.toggle('is-active', active);
    slide.setAttribute('aria-hidden', String(!active));
  });
}

function actionFor(code) {
  switch (code) {
    case 'ArrowRight':
    case 'PageDown':
    case 'Space':
      return () => showSlide(current + 1);
    case 'ArrowLeft':
    case 'PageUp':
      return () => showSlide(current - 1);
    case 'Home':
      return () => showSlide(1);
    case 'End':
      return () => showSlide(slides.length);
  }
  return null;
}

document.addEventListener('keydown', (event) => {
  // Ctrl·Alt·Meta가 함께 눌리면 브라우저 단축키이므로 손대지 않는다
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const action = actionFor(event.code);
  if (!action) return;
  // 맡은 키는 기본 동작(Space·PageDown 스크롤 등)을 막는다. 반복 입력도 막는다
  event.preventDefault();
  // 길게 눌러 여러 장이 넘어가지 않게 한다
  if (event.repeat) return;
  action();
});

showSlide(1);
