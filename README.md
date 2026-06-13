# 기장군 진학진로 지원센터 - GitHub Pages 배포본

이 폴더 안의 파일을 GitHub 저장소 루트에 올리고 GitHub Pages를 켜면 됩니다.

## 올릴 파일

- `index.html`
- `.nojekyll`
- `assets/styles.css`
- `assets/config.js`
- `assets/app.js`
- `supabase-schema.sql`
- `supabase/functions/gijang-api/index.ts`

## GitHub Pages 설정

1. GitHub 저장소를 만듭니다.
2. 이 폴더 안의 파일 전체를 저장소 루트에 업로드합니다.
3. GitHub 저장소의 `Settings > Pages`로 이동합니다.
4. `Build and deployment > Source`를 `Deploy from a branch`로 설정합니다.
5. Branch는 `main`, 폴더는 `/root`를 선택합니다.
6. 저장 후 표시되는 GitHub Pages 주소로 접속합니다.

## Supabase DB 연결

1. [Supabase](https://supabase.com)에서 새 프로젝트를 만듭니다.
2. Supabase 좌측 `SQL Editor`에서 `supabase-schema.sql` 내용을 전체 실행합니다.
3. Supabase `Authentication > Users`에서 관리자 사용자를 만듭니다.
   - Email: `admin@gijang.local`
   - Password: `0000`
   - Email Confirm: 체크
4. 생성된 admin 사용자의 UUID를 복사해 `supabase-schema.sql` 하단 안내 INSERT의 `관리자_AUTH_USER_UUID` 자리에 넣고 실행합니다.
5. Supabase CLI가 설치된 터미널에서 이 폴더 기준으로 Edge Function을 배포합니다.

```bash
supabase functions deploy gijang-api --no-verify-jwt
```

6. Supabase `Project Settings > API`에서 아래 두 값을 복사합니다.
   - Project URL
   - anon public key
7. `assets/config.js` 파일을 열고 아래 값을 채웁니다.

```js
window.GIJANG_DB_CONFIG = {
  supabase: {
    url: "https://프로젝트아이디.supabase.co",
    anonKey: "여기에-anon-public-key",
    functionName: "gijang-api",
    authEmailDomain: "gijang.local"
  }
};
```

8. 수정한 `assets/config.js`를 GitHub에 다시 업로드/커밋합니다.

## 로그인

- 관리자: `admin / 0000`
- 컨설턴트 예시: `andong3 / 0000`

## 포함된 기능

- 메뉴/하위 메뉴 보기
- 프로그램 참가신청
- 같은 컨설턴트, 같은 날짜, 같은 시간 중복 신청 방지
- 로그인 후 신청확인
- admin 전체 신청 확인 및 엑셀 다운로드
- 컨설턴트 본인 신청만 확인
- 관리자 페이지에서 메뉴, 본문, 배너, 로고, 팝업, 게시판, 계정, 비밀번호 수정

## 꼭 알아둘 점

Supabase 설정값이 비어 있으면 브라우저 `localStorage`에만 저장됩니다.
Supabase 설정값과 Edge Function을 연결하면 신청자 정보와 관리자 수정 내용이 Supabase DB에 저장되어 여러 컴퓨터에서 공유됩니다.

보안 모드에서는 브라우저가 DB 테이블을 직접 수정하지 않습니다.
관리자/컨설턴트 권한 확인과 DB 쓰기는 `gijang-api` Edge Function에서 처리합니다.
