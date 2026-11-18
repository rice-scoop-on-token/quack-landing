// 안내 패널 단계 데이터. 문구와 오리 동작은 이 파일 한 곳에서만 고친다.
//
// action은 quack 앱과 같은 오리 동작이다.
// 기준: quack frontend/src/features/character/screenActions.ts (커밋 1e50969)
//   1 explaining → idle, 2 analyzing → think, 3 followUp(기본: followUpInsufficient) → dejected,
//   4 explaining → idle, 5 confirmed → happy_jump, 6 reward → happy_jump
// 시트 파일: assets/animal/duck/baby/actions/{action}.png
//
// showElapsed: 이 단계에 들어온 뒤 지난 시간을 보여 준다. 실제 AI라 응답 시간이 매번 달라서
// 남은 시간이나 진행률은 보여 주지 않는다.
export const STEPS = [
  {
    title: '내 말로 설명하기',
    desc: '공부한 개념을 오리에게 내 말로 설명해요.',
    action: 'idle',
  },
  {
    title: 'AI가 살펴보는 중',
    desc: '빠진 개념, 틀린 부분, 애매한 연결을 찾고 있어요.',
    action: 'think',
    showElapsed: true,
  },
  {
    title: '꼬리질문',
    desc: '설명의 빈틈을 찾아 오리가 되물어요.',
    action: 'dejected',
  },
  {
    title: '다시 설명하기',
    desc: '질문에 답하면서 설명을 채워요.',
    action: 'idle',
  },
  {
    title: '이해 확인',
    desc: '충분히 설명하면 오리가 이해했다고 알려 줘요.',
    action: 'happy_jump',
  },
  {
    title: '성장 보상',
    desc: '이해한 만큼 경험치를 받고 오리가 자라요.',
    action: 'happy_jump',
  },
];
