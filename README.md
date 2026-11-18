# quack-landing

Quack(꽥) 앱을 충남대 창의축전 부스(11/20 금)에서 시연하기 위한 화면입니다. 앱 본체는 [rice-scoop-on-token/quack](https://github.com/rice-scoop-on-token/quack)에 있습니다.

노트북 화면 왼쪽의 폰 프레임에 실제 폰 화면(scrcpy 미러링)을 띄우고, 오른쪽 안내 패널에 지금 시연 중인 단계를 크게 보여 줍니다. 외부 인터넷 없이 노트북 안에서만 동작합니다.

## 당일 세팅 순서

갤럭시 폰과 윈도우 노트북에서 확인한 순서입니다. 명령은 모두 PowerShell 기준이고, 경로는 이 레포 폴더(`quack-landing`) 기준입니다. quack 레포는 이 레포 옆 폴더(`../quack`)에 있어야 합니다.

준비물:
- Node.js 18 이상(이 레포는 설치할 의존성이 없습니다)
- pnpm(quack 앱 실행용)
- 레포 루트의 scrcpy 폴더 `scrcpy-win64-*`(git 제외, 안에 `adb.exe`와 `scrcpy.exe`가 있습니다)
  - 이 폴더는 **하나만** 둡니다. 둘 이상 있으면 아래 `$tools` 줄이 실패합니다.

### 1. 미리 할 것

**폰**
1. **USB 디버깅**을 켭니다.
   - 설정 → 휴대전화 정보 → 소프트웨어 정보 → "빌드번호"를 7번 누릅니다.
   - 설정 → 개발자 옵션 → USB 디버깅을 켭니다.
   - 처음 연결할 때 폰에 뜨는 "USB 디버깅을 허용할까요?"에서 허용합니다.
2. **방해 금지 모드**를 켭니다. 알림이 미러링 화면과 녹화 영상에 그대로 나옵니다.
3. **최근 앱을 정리**합니다.
4. **Expo Go 자동 업데이트를 끕니다.** Play 스토어 → Expo Go → 오른쪽 위 ⋮ → "자동 업데이트 사용"을 해제합니다. 당일 업데이트로 앱 버전이 바뀌는 것을 막습니다.

**앱 환경 변수**

`../quack/frontend/.env`에 아래 세 값이 있어야 합니다. 값은 팀 채널에서 받고, 이 README나 이 레포에는 적지 않습니다.

| 변수 | 값 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 주소 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase 키 |
| `EXPO_PUBLIC_USE_MOCK` | `false` (실제 AI 모드) |

`.env`가 없을 때만 예시 파일을 복사해 만든 뒤 값을 채웁니다. **이미 `.env`가 있으면 이 단계는 건너뜁니다.** `if`로 감싼 이유는 값이 든 `.env`를 덮어쓰지 않기 위해서입니다.

```powershell
cd ..\quack\frontend
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

### 2. 터미널 3개 열기

PowerShell 창 3개를 열고 순서대로 실행합니다. 세 창 모두 끄지 않고 둡니다.

**① 시연 화면**: 이 레포 폴더에서 실행합니다.

```powershell
npm start
```

**② 케이블·미러링**: 이 레포 루트에서 실행합니다. 폰을 USB로 연결한 뒤 시작합니다.

```powershell
$tools = (Resolve-Path .\scrcpy-win64-*).Path
& "$tools\adb.exe" devices
& "$tools\adb.exe" reverse tcp:8081 tcp:8081
& "$tools\adb.exe" reverse --list
& "$tools\scrcpy.exe" --window-title "Quack Phone" --window-borderless --stay-awake
```

- `$tools` 변수는 그 PowerShell 창에서만 유지됩니다. **②번 창을 새로 열 때마다 `$tools` 줄부터 다시 실행합니다.**
- `adb devices`에 기기가 `device`로 나와야 합니다. `unauthorized`면 폰에서 USB 디버깅을 허용합니다.
- `adb reverse --list`에 `tcp:8081 tcp:8081`이 나와야 합니다. 폰이 케이블로 노트북의 앱 개발 서버에 붙는 통로라서 부스 와이파이가 없어도 됩니다.
- scrcpy 창이 뜨면 **최소화하지 말고** 브라우저 뒤에 둡니다. 최소화된 창은 캡처되지 않습니다.

**③ 앱 개발 서버**: quack 레포 폴더에서 실행합니다.

```powershell
cd ..\quack
pnpm --filter @quack/frontend start --no-dev --minify
```

- `.env`를 바꾼 직후 첫 실행만 끝에 `--clear`를 붙입니다. 바뀐 값이 캐시에 남지 않게 합니다.
- QR 코드와 `Logs for your project will appear below` 문구가 나오면 준비가 끝난 것입니다. **그다음에** 3단계로 넘어갑니다.
- `--localhost`는 붙이지 않습니다(아래 "막힐 때" 참고).

### 3. 폰에서 앱 열기

Expo Go → **Enter URL manually** → `exp://127.0.0.1:8081`을 입력합니다.

QR 코드나 터미널에 나오는 다른 주소는 쓰지 않습니다. `127.0.0.1`은 ②의 `adb reverse`로 케이블을 거쳐 노트북에 연결됩니다.

### 4. 시연 화면 띄우기

1. 노트북의 Chrome이나 Edge에서 http://127.0.0.1:4173 을 열고 **F11**로 전체 화면을 켭니다.
2. `C` 키를 누르거나 폰 프레임을 클릭합니다. 공유 창이 뜨면 "창" 탭에서 **Quack Phone**을 고르고 "공유"를 누릅니다.
3. 브라우저 아래쪽에 뜨는 "공유 중" 막대는 **"숨기기"**를 누릅니다.

- 연결이 끊기면 폰 프레임에 "폰 화면 연결이 끊겼어요"가 나옵니다. `C`를 눌러 다시 고르면 됩니다.
- 연결된 상태에서 `C`를 눌러 다른 창으로 바꿀 수 있습니다. 고르기를 취소하면 지금 화면이 그대로 남습니다.
- 시연 화면을 새로고침하면 창을 다시 골라야 합니다.
- 연결된 동안에는 노트북 화면이 꺼지지 않도록 브라우저에 요청합니다(지원하는 브라우저에서만).
- 서버는 ①번 창에서 `Ctrl+C`로 끕니다.

### 5. 녹화 (리허설 때)

대비책용 녹화 영상(아래 "대비책: 녹화 영상")을 만듭니다. ②번 창에서 미러링용 scrcpy 창을 먼저 닫고, scrcpy 명령 대신 아래를 실행합니다. 미러링하면서 동시에 녹화됩니다. 실제 AI 모드로 시연합니다.

**반드시 이 레포 루트에서 실행합니다.** scrcpy 폴더 안에서 실행하면 `public\recordings` 상대 경로가 틀어져 파일을 만들지 못합니다.

```powershell
$tools = (Resolve-Path .\scrcpy-win64-*).Path
if (-not (Test-Path public\recordings)) { New-Item -ItemType Directory public\recordings }
& "$tools\scrcpy.exe" --window-title "Quack Phone" --window-borderless --stay-awake --no-audio --record=public\recordings\demo.mp4
```

1. 녹화는 앱 **홈 화면을 띄워 둔 상태에서 시작**합니다. **성장 보상 화면까지 간 뒤 scrcpy 창을 닫아 끝냅니다.** 앞뒤 준비 동작까지 그대로 녹화되기 때문입니다.
2. 녹화는 **scrcpy 창을 닫아 정상 종료**해야 mp4 파일이 완성됩니다. 강제 종료하면 파일이 깨질 수 있습니다.
3. 영상 코덱은 scrcpy 기본값(H.264)을 그대로 둡니다. 다른 코덱은 브라우저에서 재생되지 않을 수 있습니다.
4. 시연 화면에서 `R`을 눌러 끝까지 재생되는지 확인합니다.
5. 녹화가 끝나면 ②의 미러링용 scrcpy 명령을 다시 실행하고, 시연 화면에서 `C`로 다시 연결합니다.

### 6. 막힐 때

| 증상 | 확인·해결 |
| --- | --- |
| Expo Go에 "Something went wrong" | 폰 크롬에서 `http://127.0.0.1:8081/status`를 엽니다. `packager-status:running`이 나오면 통로는 정상입니다. 안 나오면 ②의 `adb reverse`와 ③의 앱 개발 서버를 확인합니다. |
| 폰 크롬에서 `ERR_EMPTY_RESPONSE` | 노트북에서 `netstat -ano \| findstr :8081`을 실행합니다. `[::1]`만 있으면 `--localhost`를 붙여 실행한 것입니다. 윈도우에서 `--localhost`는 앱 개발 서버(Metro)를 IPv6로만 열어서 `adb reverse`(IPv4)가 붙지 못합니다. ③을 `--localhost` 없이 다시 실행합니다. |
| 케이블을 다시 꽂았음 | ②의 `adb reverse tcp:8081 tcp:8081`을 다시 실행합니다(창을 새로 열었다면 `$tools` 줄부터). |
| AI 한도 오류 | Expo Go 앱을 최근 앱에서 완전히 껐다 켭니다. 새 익명 사용자가 되어 한도가 초기화됩니다. 온보딩은 다시 해야 합니다. |
| 공유 창 목록에 `Quack Phone`이 없음 | scrcpy 창이 최소화됐는지 봅니다. 최소화를 풀고 브라우저 뒤에 둡니다. |

## 대비책: 녹화 영상

미러링이나 인터넷이 실패하면 `R`을 눌러 폰 프레임에 사전 녹화한 실제 시연 영상을 틉니다. 녹화 방법은 위 "5. 녹화"에 있습니다.

- 영상 위에는 관람객이 알 수 있게 "녹화 영상" 표시가 붙고, 2단계의 "실제 AI가 답하는 중" 경과 시간은 숨겨집니다.
- `L`을 누르면 라이브로 돌아옵니다. 화면 공유가 살아 있으면 창을 다시 고르지 않아도 바로 폰 화면이 나옵니다.
- 영상 파일은 `public/recordings/demo.mp4` 하나이고 git에는 올라가지 않습니다(`.gitignore`).
- 파일이 없거나 재생할 수 없으면 폰 프레임 안에 "녹화 영상이 없어요 (public/recordings/demo.mp4)"가 작게 나옵니다. 파일을 넣고 `R`을 다시 누르면 새로고침 없이 재생됩니다.
- 영상은 소리 없이 재생되고, 끝나면 마지막 화면에서 멈춥니다.

## 발표자 키

| 키 | 동작 |
| --- | --- |
| `→` / `←` | 다음 / 이전 단계 (1단계와 6단계에서 멈춤) |
| `1` ~ `6` | 그 단계로 바로 가기 (예: 4단계 뒤 다시 2단계) |
| `Home` | 1단계로 (다음 관람객 시연 시작) |
| `H` | 화면 오른쪽 아래 작은 키 안내 켜기 / 끄기 |
| `C` | 폰 화면 연결 (화면 공유 창 열기). 녹화 영상을 보던 중이면 라이브로 돌아옴 |
| `R` | 녹화 영상을 처음부터 재생 (녹화 중 다시 누르면 처음부터) |
| `P` | 녹화 영상 재생 / 일시정지 |
| `,` / `.` | 녹화 영상 5초 뒤로 / 앞으로 |
| `L` | 라이브로 돌아가기 (화면 공유가 살아 있으면 바로 폰 화면, 없으면 대기 화면) |

- 한글 입력 상태에서도 같은 자리의 키로 동작합니다.
- Ctrl·Alt·Win 키와 함께 누르면 아무 동작도 하지 않습니다(예: Ctrl+C로 공유 창이 열리지 않음).
- 키를 길게 눌러도 한 번만 넘어갑니다.
- 2단계(AI가 살펴보는 중)에서는 들어간 뒤 지난 시간이 "실제 AI가 답하는 중 · 0:08"처럼 표시되고, 다른 단계로 가면 0으로 돌아갑니다.

단계 문구와 단계별 오리 동작은 `public/scripts/steps.js` 한 곳에서 고칩니다.

## 확인

자동 확인(헤드리스 Chrome, 결과는 OS 임시 폴더 `quack-landing-check`에 저장): `npm run check`

- 녹화 모드 확인 동안만 테스트 영상을 `public/recordings/demo.mp4`에 두고 끝나면 지웁니다. 실제 녹화 파일이 이미 있으면 건드리지 않고 녹화 확인을 건너뜁니다.

- 화면 크기: 개발자 도구(F12) → 기기 툴바(`Ctrl+Shift+M`) → Dimensions를 Responsive로 두고 1280×720, 1536×864, 1920×1080을 입력합니다. 세 크기 모두 스크롤 없이 한 화면에 들어와야 합니다.
- 외부 요청: 개발자 도구 → Network 탭 → "Disable cache"를 켜고 새로고침합니다. 모든 요청이 `127.0.0.1:4173`(또는 `data:`)이어야 합니다.
- 실제 창 캡처(scrcpy 없이): 메모장을 열고 창을 세로로 길게 줄입니다. 시연 화면에서 `C` → "창" 탭에서 메모장 선택 → "공유"를 누릅니다.
  - 폰 프레임 안에 메모장이 잘리지 않고 꽉 차게 나와야 합니다.
  - 메모장 창 크기를 바꾸면 프레임 폭이 따라 바뀌어야 합니다. 아주 넓게 늘리면 폭은 일정 이상 커지지 않고, 위아래가 갈색으로 빕니다.
  - 메모장을 닫거나 "공유 중지"를 누르면 대기 화면과 "폰 화면 연결이 끊겼어요"가 나와야 합니다.
  - 시연 화면 탭 자신은 공유 목록에 나오지 않아야 합니다.

## 폴더

```text
public/
  index.html          화면 셸
  styles/tokens.css   quack 디자인 토큰 (quack 레포에서 옮긴 값)
  styles/shell.css    배치와 paper UI 스타일
  scripts/main.js     발표자 키 연결 (단계 전환, 키 안내, 화면 공유, 녹화 영상)
  scripts/steps.js    안내 패널 단계 데이터 (문구, 오리 동작)
  scripts/guide.js    안내 패널 그리기·전환·2단계 경과 시간
  scripts/phone-view.js  폰 프레임 모드(라이브/녹화)·비율 맞추기·끊김 처리
  scripts/recording.js   녹화 영상 재생·일시정지·5초 이동
  recordings/demo.mp4 사전 녹화 영상 (git 제외, 리허설 때 녹화)
  assets/             이미지·글꼴 (출처는 assets/SOURCES.md)
scripts/serve.mjs     의존성 없는 로컬 정적 서버 (Range 요청 지원)
scripts/check.mjs     헤드리스 Chrome 자동 확인 (npm run check)
scrcpy-win64-*/       scrcpy·adb (git 제외, 시연 노트북에만 둠)
```
