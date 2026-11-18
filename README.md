# quack-landing

Quack(꽥) 앱을 충남대 창의축전 부스(11/20 금)에서 시연하기 위한 화면입니다. 앱 본체는 [rice-scoop-on-token/quack](https://github.com/rice-scoop-on-token/quack)에 있습니다.

노트북 화면 왼쪽의 폰 프레임에 실제 폰 화면(scrcpy 미러링)을 띄우고, 오른쪽 안내 패널에 지금 시연 중인 단계를 크게 보여 줍니다. 외부 인터넷 없이 노트북 안에서만 동작합니다.

## 실행

Node.js 18 이상이 필요합니다. 설치할 의존성은 없습니다.

```sh
npm start
```

Chrome이나 Edge에서 http://127.0.0.1:4173 을 열고 F11로 전체 화면을 켭니다. 서버는 `Ctrl+C`로 끕니다.

## 확인

- 화면 크기: 개발자 도구(F12) → 기기 툴바(`Ctrl+Shift+M`) → Dimensions를 Responsive로 두고 1280×720, 1536×864, 1920×1080을 입력합니다. 세 크기 모두 스크롤 없이 한 화면에 들어와야 합니다.
- 외부 요청: 개발자 도구 → Network 탭 → "Disable cache"를 켜고 새로고침합니다. 모든 요청이 `127.0.0.1:4173`(또는 `data:`)이어야 합니다.

## 폴더

```text
public/
  index.html          화면 셸
  styles/tokens.css   quack 디자인 토큰 (quack 레포에서 옮긴 값)
  styles/shell.css    배치와 paper UI 스타일
  assets/             이미지·글꼴 (출처는 assets/SOURCES.md)
scripts/serve.mjs     의존성 없는 로컬 정적 서버
```
