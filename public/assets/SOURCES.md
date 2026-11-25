# 에셋 출처

이 폴더의 파일은 모두 아래 출처에서 복사했습니다. 화면에서 실제로 쓰는 파일만 둡니다.

## quack 레포에서 복사

quack 레포(`rice-scoop-on-token/quack`) 커밋 `1e50969e7b6fb8afff669f599273bb0328e071da` 기준입니다.

| 이 레포 경로 | quack 원본 경로 | 쓰는 곳 |
| --- | --- | --- |
| `animal/duck/baby/base.png` | `frontend/assets/animal/duck/baby/base.png` | 폰 프레임 대기 화면의 오리 |
| `animal/duck/baby/actions/idle.png` | `frontend/assets/animal/duck/baby/actions/idle.png` | 안내 패널 1·4단계 오리 동작 |
| `animal/duck/baby/actions/think.png` | `frontend/assets/animal/duck/baby/actions/think.png` | 안내 패널 2단계 오리 동작 |
| `animal/duck/baby/actions/dejected.png` | `frontend/assets/animal/duck/baby/actions/dejected.png` | 안내 패널 3단계 오리 동작 |
| `animal/duck/baby/actions/happy_jump.png` | `frontend/assets/animal/duck/baby/actions/happy_jump.png` | 안내 패널 5·6단계 오리 동작 |

발표 슬라이드(`slides.html`)에 쓰려고 quack 커밋 `34e84b939a11b58f96c54a1a447630054d499abf` 기준으로 아래를 더 복사했습니다(`frontend/assets/animal/`은 `1e50969`와 이 커밋 사이에 바뀌지 않았습니다).

| 이 레포 경로 | quack 원본 경로 | 쓰는 곳 |
| --- | --- | --- |
| `animal/duck/child/base.png` | `frontend/assets/animal/duck/child/base.png` | 슬라이드 1장(표지) 가운데 오리 |
| `animal/duck/adult/base.png` | `frontend/assets/animal/duck/adult/base.png` | 슬라이드 1장(표지) 오른쪽 오리 |
| `animal/cat/baby/base.png` | `frontend/assets/animal/cat/baby/base.png` | 슬라이드 7장 고양이 |
| `animal/raccoon/baby/base.png` | `frontend/assets/animal/raccoon/baby/base.png` | 슬라이드 7장 라쿤 |

슬라이드는 위 표의 오리 baby 파일도 함께 씁니다: `base.png`(1장 왼쪽 오리, 7장 러버덕), `actions/dejected.png`(4장), `actions/happy_jump.png`(9장).

동작 시트는 1536×256(256px 칸 6개)이고, 단계별 동작은 quack `frontend/src/features/character/screenActions.ts`를 따릅니다(`public/scripts/steps.js` 주석 참고).

## 글꼴

npm 레지스트리에서 `npm pack`으로 받은 패키지에서 꺼냈습니다(2026-11-18에 받음). 버전을 고정했고, 받은 날 기준 최근 14일 안에 배포된 버전은 피했습니다.

| 이 레포 경로 | 패키지 | 버전 | 배포일 | 패키지 안 경로 |
| --- | --- | --- | --- | --- |
| `fonts/Galmuri11-Bold.woff2` | `galmuri` | 2.40.3 | 2025-08-13 | `dist/Galmuri11-Bold.woff2` |
| `fonts/OFL-Galmuri.txt` | `galmuri` | 2.40.3 | 2025-08-13 | `dist/LICENSE.txt` |
| `fonts/Pretendard-Regular.woff2` | `pretendard` | 1.3.9 | 2023-11-05 | `dist/web/static/woff2/Pretendard-Regular.woff2` |
| `fonts/Pretendard-Bold.woff2` | `pretendard` | 1.3.9 | 2023-11-05 | `dist/web/static/woff2/Pretendard-Bold.woff2` |
| `fonts/OFL-Pretendard.txt` | `pretendard` | 1.3.9 | 2023-11-05 | `dist/LICENSE.txt` |

두 글꼴 모두 SIL Open Font License 1.1입니다. 라이선스 전문은 각 `OFL-*.txt`에 있습니다.

다시 받는 방법:

```sh
npm pack galmuri@2.40.3 pretendard@1.3.9
```
