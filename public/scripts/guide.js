// 안내 패널: 단계 번호, 진행 표시, 제목, 설명, 오리 동작, 2단계 경과 시간을 그린다.
import { STEPS } from './steps.js';

const guide = document.querySelector('.guide');
const stepNow = guide.querySelector('.guide-step-now');
const stepTotal = guide.querySelector('.guide-step-total');
const progress = guide.querySelector('.guide-progress');
const body = guide.querySelector('.guide-body');
const title = guide.querySelector('.guide-title');
const desc = guide.querySelector('.guide-desc');
const elapsedTime = guide.querySelector('.guide-elapsed-time');
const duckSheet = guide.querySelector('.guide-duck-sheet');

const sheetPath = (action) => `assets/animal/duck/baby/actions/${action}.png`;

let current = 0; // 아직 아무 단계도 그리지 않음
let elapsedTimer = null;

// 진행 표시 칸은 단계 수만큼 만든다
stepTotal.textContent = String(STEPS.length);
const cells = STEPS.map(() => progress.appendChild(document.createElement('li')));

// 단계를 넘길 때 그림이 늦게 뜨지 않도록 동작 시트를 미리 불러 둔다
for (const action of new Set(STEPS.map((step) => step.action))) {
  new Image().src = sheetPath(action);
}

export const stepCount = STEPS.length;

export function currentStep() {
  return current;
}

// n단계(1부터)를 보여 준다. 범위를 벗어나면 1단계나 마지막 단계에서 멈춘다.
export function showStep(n) {
  const next = Math.min(Math.max(n, 1), STEPS.length);
  if (next === current) return;
  const first = current === 0;
  current = next;
  const step = STEPS[next - 1];

  stepNow.textContent = String(next);
  cells.forEach((cell, i) => cell.classList.toggle('is-done', i < next));
  title.textContent = step.title;
  desc.textContent = step.desc;
  duckSheet.src = sheetPath(step.action);
  setElapsed(Boolean(step.showElapsed));

  // 처음 그릴 때는 전환 없이 바로 보여 준다. "동작 줄이기"면 CSS가 전환을 끈다.
  if (!first) {
    body.classList.remove('is-entering');
    void body.offsetWidth; // 같은 애니메이션을 처음부터 다시 시작하게 한다
    body.classList.add('is-entering');
  }
}

export function nextStep() {
  showStep(current + 1);
}

export function prevStep() {
  showStep(current - 1);
}

body.addEventListener('animationend', () => body.classList.remove('is-entering'));

// 경과 시간은 단계에 들어온 순간부터 센다. 다른 단계로 가면 멈추고 0으로 돌린다.
function setElapsed(on) {
  clearInterval(elapsedTimer);
  elapsedTimer = null;
  guide.dataset.elapsed = on ? 'on' : 'off';
  elapsedTime.textContent = formatElapsed(0);
  if (!on) return;
  const start = performance.now();
  elapsedTimer = setInterval(() => {
    elapsedTime.textContent = formatElapsed(performance.now() - start);
  }, 250);
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

showStep(1);
