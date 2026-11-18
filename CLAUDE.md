# quack-landing

Quack(꽥) 앱을 충남대 창의축전 부스(11/20 금)에서 시연하기 위한 **부스 시연 화면**이다. 응답과 설명은 한국어로 한다.

## 배경

- 앱 본체는 별도 레포 `rice-scoop-on-token/quack`(Expo + Supabase)이며 로컬에서는 `../quack`에 있다. **quack 레포는 읽기만 하고 절대 수정하지 않는다.**
- 시연 방식: 발표자가 안드로이드 폰의 Expo Go로 실제 앱을 조작하고, scrcpy로 미러링한 폰 화면을 노트북(윈도우, Chrome/Edge 전체 화면)의 이 시연 화면 속 폰 프레임에 실시간으로 띄운다. 폰 프레임 옆 안내 패널은 현재 시연 단계를 크게 보여 준다.
- 관람객은 노트북에서 약 1m 떨어져 서서 본다. 멀리서도 읽혀야 하고, 화면 하나에 메시지 하나만 둔다.
- 부스 인터넷은 믿을 수 없다. 시연 화면은 외부 요청 없이 로컬에서만 동작해야 한다(CDN 금지, 글꼴·이미지 모두 로컬).

## 커밋 계획

1. 레포 뼈대, 로컬 서버, 가로 화면 셸(폰 프레임 자리, 안내 패널, quack 디자인 토큰) — 완료
2. 브라우저 화면 공유(getDisplayMedia)로 scrcpy 창을 잡아 폰 프레임 안에 실시간 표시 — 완료
3. 안내 패널 단계 데이터와 방향키 전환, AI 답변 대기(8~15초) 중 설명 문구 — 완료
4. 대비책: 사전 녹화 영상 재생(미러링 실패와 인터넷 실패를 모두 막는다), 서버 Range 지원 — 완료
5. (후보) 대비책: 미러링 실패 시 quack 웹 빌드(실제 AI 모드) 전환

안내 패널 단계: 1) 내 말로 설명하기 2) AI가 살펴보는 중 3) 꼬리질문 4) 다시 설명하기 5) 이해 확인 6) 성장 보상 (문구는 `public/scripts/steps.js`)

## 구조

- `npm start` → `scripts/serve.mjs`(의존성 없음)가 127.0.0.1:4173에서 `public/`을 제공한다. Range 요청(206, 범위 밖 416, 읽을 수 없는 Range는 무시하고 200)을 지원하고 파일은 스트림으로 보낸다. `public/` 밖 경로 403, GET·HEAD 외 405.
- 프레임워크·번들러는 쓰지 않는다. HTML, CSS(필요해지면 순수 JS)만 쓴다.
- `public/styles/tokens.css`: quack `frontend/src/theme/assetTokens.ts`를 옮긴 값. 상단에 quack 커밋 해시가 있다.
- `public/styles/shell.css`: 배치와 paper UI. `--u`가 화면 배율(1280×720에서 1px), `--phone-aspect`가 폰 화면 비율, `--phone-max-aspect`가 폰 프레임 폭 상한(높이 대비)이다.
- `public/scripts/phone-view.js`: 폰 프레임 모드 `.phone[data-mode]`(live / recording, `body[data-phone-mode]`에도 적음)를 정한다. `attachStream(stream)`이 아무 MediaStream이나 라이브 `<video>`에 붙이고 라이브 모드로 간다. 트랙이 끝나면 대기 화면(끊김 문구)으로 돌린다. 라이브 상태는 `.phone[data-state]`(waiting / connected / disconnected). 녹화 모드로 가도 화면 공유 스트림은 끊지 않는다. `--phone-aspect`는 "지금 보이는 영상"(녹화 모드면 녹화 영상, 라이브면 화면 공유) 비율로 갱신하고, 없으면 기본값으로 돌린다. Screen Wake Lock은 라이브 연결 중이거나 녹화 모드일 때 건다.
- `public/scripts/recording.js`: 사전 녹화 영상 `public/recordings/demo.mp4`(git 제외) 재생. `R` 처음부터 재생, `P` 재생·일시정지, `,`·`.` 5초 이동, `L` 라이브로. 소리 없음, 반복 없음. 파일이 없거나 재생 실패면 `.phone[data-recording="missing"]`로 안내를 띄운다. 녹화 모드에서는 "녹화 영상" 표시를 두고 2단계 경과 시간을 숨긴다(지금 AI가 답하는 중이 아니므로).
- `public/scripts/main.js`: 발표자 키를 한곳에서 연결한다(`←`/`→`, `1`~`6`, `Home`, `H`, `C`, `R`, `P`, `,`, `.`, `L`). `event.code` 기준이라 한글 입력 상태에서도 동작한다. Ctrl·Alt·Meta 조합은 모두 무시하고(브라우저 단축키에 맡김), 맡은 키는 `preventDefault()`하며, 길게 눌러 생기는 반복 입력은 무시한다. `C`는 getDisplayMedia → `attachStream`이고, 새 창을 고른 뒤에만 기존 스트림을 정리한다(취소하면 기존 화면·모드 유지).
- `public/scripts/steps.js`: 안내 패널 단계 데이터(제목, 설명, 오리 동작, 경과 시간 표시 여부). 오리 동작은 quack `screenActions.ts` 매핑을 따른다.
- `public/scripts/guide.js`: 패널 그리기. `showStep(n)`/`nextStep()`/`prevStep()`, 진행 6칸, 200ms 전환, 2단계 경과 시간(남은 시간·진행률은 보여 주지 않는다). 패널 높이는 설명 2줄 + 경과 시간 줄 자리를 늘 잡아 단계를 넘겨도 바뀌지 않는다.
- 오리 동작 시트(256px 칸 6개)는 CSS `steps(6)`로 칸당 250ms(앱 `CharacterBox`와 같음) 재생한다. "동작 줄이기"면 시트·단계 전환·대기 화면 오리 모두 멈춘다.
- `public/assets/SOURCES.md`: 복사한 에셋과 글꼴의 출처·버전.
- `scripts/check.mjs`(`npm run check`): 헤드리스 Chrome + DevTools 프로토콜 자동 확인. 서버가 꺼져 있으면 직접 띄운다. 테스트 영상(캔버스 `captureStream()`)은 이 스크립트가 페이지 안에서 `import('/scripts/phone-view.js')`로 넣고, 시연 화면 코드에는 테스트 경로를 두지 않는다. 결과는 OS 임시 폴더에만 쓴다. 주의: CDP 실제 키 입력(`Input.dispatchKeyEvent`)은 브라우저 단축키도 실행하므로(Ctrl+H 방문 기록, Ctrl+Shift+C 개발자 도구 → 시연 탭이 가려져 타이머가 늦어지고 외부 요청이 생김), 수정 키 조합은 페이지 안 합성 `KeyboardEvent`로 확인한다. 녹화 모드 확인은 페이지 안 MediaRecorder로 만든 테스트 mp4를 잠시 `public/recordings/demo.mp4`에 두고 끝나면 지운다. 표시 파일 `public/recordings/.check-test-video`가 있을 때만 지우므로, 실제 녹화(표시 없이 있는 demo.mp4)는 건드리지 않고 녹화 확인을 건너뛴다.

## 디자인 기준

- quack의 `assetTokens.ts`가 유일한 기준이다. 값을 새로 만들지 않고 옮긴다.
- paper UI 문법: 크림 바탕, 갈색 외곽선, 번지지 않는 하드 그림자(blur 0), 둥근 모서리. 큰 화면이라 비례해서 키우되 문법은 유지한다.
- 폰 프레임은 실사 기기 목업이 아니라 두꺼운 갈색 테두리의 둥근 프레임이다. 미러링된 앱 글자가 작으므로 프레임은 화면 높이를 최대한 차지하고 테두리는 얇게 유지한다.
- 글꼴: 제목은 Galmuri11(픽셀), 본문은 Pretendard. Galmuri 크기는 12px 배수로 맞춘다(CSS `round()`).
- 가독성: CSS 기준 1280×720에서 단계 제목 44px 이상, 설명 24px 이상. 가장 긴 제목도 한 줄. 1280×720~1920×1080에서 스크롤 없이 한 화면에 들어와야 한다.
- 한국어는 어절 단위로 줄바꿈한다(`body`에 `word-break: keep-all`).
- quack 캐릭터 PNG는 엄격한 픽셀 격자가 아니라 가장자리가 부드러운 그림이다. 정수배 조건은 두지 않고, 실제 표시 크기에서 `pixelated`와 기본값을 비교해 더 깨끗한 쪽을 쓴다(현재 오리는 기본값).
- 관람객이 읽는 문구는 앱과 같은 해요체로 짧게 쓴다.
- 앱 아이콘과 스플래시(Expo 기본 이미지)는 쓰지 않는다.
- 에셋은 그 커밋에서 실제로 쓰는 것만 quack 레포에서 복사하고 `SOURCES.md`에 원본 경로를 적는다.

## 작업 규칙

- 작업은 한 커밋 단위로만 한다. 시작 전에 범위와 생성·수정할 파일 목록을 제시하고 승인을 받는다.
- 범위 밖 개선점은 손대지 않고 마지막 보고에 "다음 커밋 후보"로 적는다.
- git 커밋, 푸시, PR 머지는 하지 않는다. 사용자가 직접 한다.
- quack 레포의 파일은 읽기만 한다.
- 비밀 키와 `.env`는 이 레포에 두지 않는다.
- 외부 패키지를 받아야 하면 버전을 고정하고, 최근 14일 안에 배포된 버전은 피한다.

## 완료 확인 방법

- `npm start` 후 http://127.0.0.1:4173 에서 화면이 열린다.
- 개발자 도구 Network 탭에서 외부 요청이 0건이다.
- 1280×720, 1536×864, 1920×1080에서 스크롤과 잘림이 없다.
- `npm run check`가 모두 통과하고, 저장된 스크린샷을 눈으로도 확인한다. 새 기능을 넣으면 이 스크립트에 확인 항목을 추가한다.
