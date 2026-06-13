기장군 진학진로 지원센터 배포 안내

이 사이트는 관리자 페이지, 신청 접수, 엑셀 다운로드, 이미지/메뉴 수정 기능이 있는 Node.js 앱입니다.
일반 정적 웹호스팅에 index.html만 업로드하면 CSS/이미지/API가 깨지고 관리자 기능이 동작하지 않습니다.

필수 파일 구조:
- server.mjs
- package.json
- public/
  - styles.css
  - assets/logo.png
  - assets/popup-1.png
  - assets/popup-2.png
  - assets/banner-main.jpg 등
- data/
  - site.json
  - users.json
  - applications.json
- scripts/

실행 방법:
1. Node.js 20 이상이 가능한 호스팅/VPS/클라우드에 위 파일 전체를 업로드합니다.
2. 앱 폴더에서 실행합니다.
   npm start
3. 호스팅에서 PORT 환경변수를 제공하면 자동으로 그 포트를 사용합니다.
   직접 실행 예: PORT=3000 npm start

Node 호스팅별 실행 예:
- Render/Railway/Heroku 계열: Procfile이 포함되어 있으므로 Start Command는 npm start 를 사용합니다.
- VPS/PM2: pm2 start ecosystem.config.cjs 를 사용합니다.

문제가 있을 때 확인:
- https://도메인/styles.css 가 열려야 합니다.
- https://도메인/assets/logo.png 가 열려야 합니다.
- https://도메인/assets/popup-1.png 가 열려야 합니다.
- https://도메인/health 가 JSON으로 열려야 합니다.
- https://도메인/asset-check 에서 모든 항목이 OK로 보여야 합니다.

위 파일들이 404이면 public 폴더가 빠졌거나, 앱이 도메인 루트가 아닌 다른 경로에서 실행 중인 것입니다.
