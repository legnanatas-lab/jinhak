# 통합 점검 결과

## 적용 내용

- `link.zip`의 링크 페이지를 `experiment/` 하위 폴더로 통합했습니다.
- 메인 페이지 메뉴에 `실험 프로그램` 항목을 추가했습니다.
- `assets` 및 `admin.html` 파일명 충돌을 피하기 위해 두 사이트를 같은 루트에 섞지 않았습니다.
- 링크 페이지 메뉴에 메인으로 돌아오는 `입시전략 연구소` 항목을 추가했습니다.
- GitHub Pages 정적 호스팅용 `.nojekyll` 파일을 추가했습니다.

## 주요 경로

- 메인: `index.html`
- 실험 프로그램: `experiment/index.html`
- 실험 프로그램 관리자: `experiment/admin.html`

## 배포 메모

GitHub 저장소 루트에 ZIP 내부 파일 전체를 업로드한 뒤 GitHub Pages를 `main` 브랜치 `/root`로 설정하면 됩니다.

## 자동 점검 내역

- JavaScript 문법 검사: `assets/app.js`, `experiment/assets/js/app.js`, `experiment/assets/js/admin.js` 통과
- JSON 파싱 검사: `assets/data/site-data.json`, `experiment/assets/data/site-data.json`, `experiment/assets/data/default-data.js` 통과
- HTML `href/src` 내부 경로 검사: 깨진 내부 참조 0건
- CSS `url(...)` 내부 경로 검사: 깨진 내부 참조 0건
- 링크 페이지 데이터 이미지 경로 검사: 누락 0건
- 로컬 정적 서버 경로 검사: `/`, `/index.html`, `/experiment/`, `/experiment/index.html`, 주요 JS/JSON 200 응답 확인
- ZIP 무결성 검사: `testzip()` 통과
