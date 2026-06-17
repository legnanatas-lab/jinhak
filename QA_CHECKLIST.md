# QA 체크리스트 - v20260617-github-admin-v5

## 파일 구조
- [x] `index.html`, `404.html`, `admin.html` 루트 배치
- [x] `assets/app.js`, `assets/styles.css`, `assets/config.js` 배치
- [x] `assets/data/site-data.json` 추가
- [x] 로고/배너/팝업 이미지 경로 정리
- [x] `.nojekyll` 포함

## 기능 점검
- [x] 기존 SPA가 `assets/data/site-data.json`을 먼저 읽도록 패치
- [x] Supabase 원격 데이터가 늦게 도착해도 GitHub JSON 데이터가 다시 우선 적용되도록 패치
- [x] 기존 앱 관리자 탭에 `GitHub 반영` 추가
- [x] 독립형 `admin.html` 관리자 추가
- [x] GitHub API 파일 조회/생성/수정 로직 포함
- [x] JSON 다운로드/복사/임시 저장 기능 포함
- [x] 이미지 업로드 WebP 압축 기능 포함

## 정적 검사
- [x] `node --check assets/app.js`
- [x] 업로드 이미지 참조 경로 존재 확인
- [x] ZIP 무결성 검사

생성일: 2026-06-17T05:03:34.253845
