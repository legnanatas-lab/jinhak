(() => {
  const STORAGE_KEY = 'gaon-gil-edu-data';
  const SESSION_KEY = 'gaon-gil-edu-session';
  const ADMIN_ID = 'admin';
  const ADMIN_PW = '000000';
  let state = structuredClone(window.DEFAULT_DATA || {});
  let tab = 'dashboard';
  let editing = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#adminApp');

  function escapeHtml(str = '') { return String(str).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch])); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function uid(prefix = 'id') { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`; }
  function toast(msg) { const old = $('.toast'); if (old) old.remove(); const n = document.createElement('div'); n.className = 'toast'; n.textContent = msg; document.body.appendChild(n); setTimeout(() => n.remove(), 2500); }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function versionNumber(v = '0.0.0') { return String(v).split('.').reduce((acc, part, i) => acc + (Number.parseInt(part, 10) || 0) * Math.pow(1000, 2 - i), 0); }
  async function load() { try { let local = null; try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { local = null; } let remote = null; try { const res = await fetch('assets/data/site-data.json', { cache: 'no-store' }); if (res.ok) remote = await res.json(); } catch { remote = null; } const base = remote || structuredClone(window.DEFAULT_DATA || {}); state = local && versionNumber(local.version) >= versionNumber(base.version) ? local : base; } catch (e) { console.warn(e); } }
  function isLogin() { return sessionStorage.getItem(SESSION_KEY) === '1'; }
  function lines(v) { return String(v || '').split('\n').map(x => x.trim()).filter(Boolean); }

  function loginView() {
    app.innerHTML = `<div class="login-wrap"><form class="login-card" id="loginForm">
      <div class="login-mark">G</div><h1>가온길 에듀 관리자</h1><p class="muted">홈페이지 전체 정보를 수정하려면 로그인하세요.</p>
      <div class="form field"><label>아이디</label><input name="id" autocomplete="username" required value="admin"><label>비밀번호</label><input name="pw" type="password" autocomplete="current-password" required value="000000"><button class="btn btn-primary" type="submit">로그인</button></div>
      <p class="mini">기본 계정: admin / 000000</p><p><a class="btn btn-line btn-small" href="index.html">홈으로 돌아가기</a></p>
    </form></div>`;
    $('#loginForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); if (fd.get('id') === ADMIN_ID && fd.get('pw') === ADMIN_PW) { sessionStorage.setItem(SESSION_KEY, '1'); render(); } else toast('아이디 또는 비밀번호가 올바르지 않습니다.'); });
  }

  const menu = [
    ['dashboard', '대시보드'], ['site', '로고·기본정보'], ['home', '홈 문구'], ['menu', '메뉴·페이지'], ['banners', '배너·팝업'], ['programs', '프로그램'], ['boards', '게시판'], ['inquiries', '문의내역'], ['data', '데이터']
  ];

  function shell(content) {
    app.innerHTML = `<div class="admin-shell"><aside class="admin-sidebar"><div class="admin-logo">가온길 에듀<br><span class="mini">전체 관리 페이지</span></div><nav class="admin-menu">${menu.map(([k, v]) => `<button data-tab="${k}" class="${tab === k ? 'active' : ''}">${v}</button>`).join('')}<button id="goSite">사이트 보기</button><button id="logout">로그아웃</button></nav></aside><section class="admin-main"><div class="admin-top"><div><h1>${menu.find(x => x[0] === tab)?.[1] || '관리'}</h1><p>수정 후 저장하면 현재 브라우저에 즉시 반영됩니다. 전체 방문자에게 반영하려면 데이터 탭에서 JSON을 내보내 GitHub에 업로드하세요.</p></div><div><button class="btn btn-line btn-small" id="resetDefault">기본값 복원</button></div></div>${content}</section></div>`;
    $$('.admin-menu [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; editing = null; render(); }));
    $('#logout').addEventListener('click', () => { sessionStorage.removeItem(SESSION_KEY); render(); });
    $('#goSite').addEventListener('click', () => window.open('index.html', '_blank'));
    $('#resetDefault').addEventListener('click', () => { if (confirm('현재 브라우저에 저장된 수정 데이터를 지우고 기본값으로 복원할까요?')) { localStorage.removeItem(STORAGE_KEY); state = structuredClone(window.DEFAULT_DATA || {}); save(); render(); } });
  }

  function input(name, label, value = '', type = 'text', placeholder = '') { return `<div class="field"><label>${escapeHtml(label)}</label><input name="${name}" type="${type}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(placeholder)}"></div>`; }
  function textarea(name, label, value = '', rows = 5) { return `<div class="field"><label>${escapeHtml(label)}</label><textarea name="${name}" rows="${rows}">${escapeHtml(value ?? '')}</textarea></div>`; }
  function select(name, label, value, options) { return `<div class="field"><label>${escapeHtml(label)}</label><select name="${name}">${options.map(o => `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`; }

  function dashboard() {
    const counts = { programs: (state.programs || []).length, notices: (state.boards?.notices?.posts || []).length, boards: Object.keys(state.boards || {}).length, inq: (state.inquiries || []).length };
    shell(`<div class="grid grid-4"><div class="card stat-card"><b>${counts.programs}</b><span>프로그램</span></div><div class="card stat-card"><b>${counts.notices}</b><span>공지사항</span></div><div class="card stat-card"><b>${counts.boards}</b><span>게시판</span></div><div class="card stat-card"><b>${counts.inq}</b><span>문의내역</span></div></div>
    <div class="admin-card"><h2>이번 버전에서 추가된 관리 기능</h2><div class="grid grid-3"><div class="feature"><div class="feature-icon">1</div><div><h3>홈 하단 로그인</h3><p>홈페이지 제일 아래 관리자 로그인 폼에서 바로 로그인할 수 있습니다.</p></div></div><div class="feature"><div class="feature-icon">2</div><div><h3>전체 문구 수정</h3><p>홈 화면, 메뉴명, 페이지 제목, 게시판명, 안내 문구를 관리자가 수정합니다.</p></div></div><div class="feature"><div class="feature-icon">3</div><div><h3>공지 JS 팝업</h3><p>팝업 노출 여부, 개수, 가로·세로 크기, 원본 게시판을 설정합니다.</p></div></div></div></div>`);
  }

  function siteSettings() {
    shell(`<form class="admin-card form" id="siteForm"><h2>로고·기본 정보</h2><div class="admin-grid">${input('name', '사이트 이름', state.site?.name)}${input('logoText', '로고 옆 글씨', state.site?.logoText)}${input('logoMark', '로고 글자', state.site?.logoMark)}${input('tagline', '태그라인', state.site?.tagline)}${input('phone', '전화번호', state.site?.phone)}${input('email', '이메일', state.site?.email, 'email')}${input('address', '주소/운영지역', state.site?.address)}${input('copyright', '카피라이트 문구', state.site?.copyright)}</div>${textarea('footer', '푸터 소개 문구', state.site?.footer, 3)}${input('logoImage', '로고 이미지 URL/Data URL', state.site?.logoImage)}<div class="field"><label>로고 이미지 파일 업로드</label><input type="file" id="logoFile" accept="image/*"><p class="mini">업로드한 이미지는 현재 브라우저 저장소에 Data URL로 저장됩니다.</p></div><div class="preview-img">${state.site?.logoImage ? `<img src="${escapeHtml(state.site.logoImage)}" alt="로고 미리보기">` : '로고 이미지 없음'}</div><div class="admin-actions"><button class="btn btn-primary" type="submit">저장</button></div></form>`);
    $('#siteForm').addEventListener('submit', e => { e.preventDefault(); state.site = { ...state.site, ...Object.fromEntries(new FormData(e.currentTarget).entries()) }; save(); toast('기본 정보가 저장되었습니다.'); render(); });
    $('#logoFile').addEventListener('change', e => readFile(e.target.files[0], url => { state.site.logoImage = url; save(); toast('로고 이미지가 저장되었습니다.'); render(); }));
  }

  function homeSettings() {
    const h = state.home || {};
    shell(`<form class="admin-card form" id="homeForm"><h2>홈 화면 문구 전체 수정</h2><div class="admin-grid">${input('heroEyebrow', '메인 상단 작은 문구', h.heroEyebrow)}${input('primaryButton', '메인 버튼명', h.primaryButton)}${input('primaryLink', '메인 버튼 링크', h.primaryLink)}${input('secondaryButton', '보조 버튼명', h.secondaryButton)}${input('secondaryLink', '보조 버튼 링크', h.secondaryLink)}${input('featuredKicker', '대표 프로그램 작은 문구', h.featuredKicker)}${input('featuredTitle', '대표 프로그램 제목', h.featuredTitle)}${input('boardTitle', '소식 영역 제목', h.boardTitle)}${input('processTitle', '진행 방식 제목', h.processTitle)}${input('ctaButton', '하단 CTA 버튼명', h.ctaButton)}${input('ctaLink', '하단 CTA 링크', h.ctaLink)}</div>${textarea('heroTitle', '메인 큰 제목', h.heroTitle, 3)}${textarea('heroSubtitle', '메인 설명', h.heroSubtitle, 3)}${textarea('featuredDescription', '대표 프로그램 설명', h.featuredDescription, 3)}${textarea('whyTitle', '강점 영역 제목', h.whyTitle, 3)}${textarea('whyBody', '강점 영역 본문', h.whyBody, 4)}${textarea('inquiryTitle', '맞춤 상담 제목', h.inquiryTitle, 2)}${textarea('inquiryBody', '맞춤 상담 본문', h.inquiryBody, 3)}${textarea('processDescription', '진행 방식 설명', h.processDescription, 3)}${textarea('boardDescription', '소식 영역 설명', h.boardDescription, 3)}${textarea('ctaTitle', '하단 CTA 제목', h.ctaTitle, 2)}${textarea('ctaBody', '하단 CTA 본문', h.ctaBody, 3)}<div class="admin-actions"><button class="btn btn-primary" type="submit">홈 문구 저장</button></div></form>
    <form class="admin-card form" id="statForm"><h2>홈 통계/프로세스/강점</h2>${textarea('stats', '통계 JSON', JSON.stringify(state.stats || [], null, 2), 8)}${textarea('process', '진행 방식 JSON', JSON.stringify(state.process || [], null, 2), 8)}${textarea('strengths', '강점 문구(줄바꿈 구분)', (state.about?.strengths || []).join('\n'), 6)}${textarea('business', '교육 영역(줄바꿈 구분)', (state.about?.business || []).join('\n'), 6)}<div class="admin-actions"><button class="btn btn-primary" type="submit">저장</button></div></form>`);
    $('#homeForm').addEventListener('submit', e => { e.preventDefault(); state.home = { ...state.home, ...Object.fromEntries(new FormData(e.currentTarget).entries()) }; save(); toast('홈 문구가 저장되었습니다.'); render(); });
    $('#statForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); try { state.stats = JSON.parse(fd.get('stats') || '[]'); state.process = JSON.parse(fd.get('process') || '[]'); } catch { toast('통계 또는 진행 방식 JSON 형식이 올바르지 않습니다.'); return; } state.about = state.about || {}; state.about.strengths = lines(fd.get('strengths')); state.about.business = lines(fd.get('business')); save(); toast('홈 추가 정보가 저장되었습니다.'); render(); });
  }

  function menuPageSettings() {
    const p = state.pages || {};
    shell(`<form class="admin-card form" id="menuForm"><h2>상단 메뉴명·하위메뉴 수정</h2><p class="mini">href 예시: #/home, #/programs, #/programs/high, #/about, #/board/notices, #/inquiry</p>${textarea('menus', '메뉴 JSON', JSON.stringify(state.menus || [], null, 2), 16)}<div class="admin-actions"><button class="btn btn-primary" type="submit">메뉴 저장</button></div></form>
    <form class="admin-card form" id="categoryForm"><h2>프로그램 분류명 수정</h2>${textarea('categories', '프로그램 분류 JSON', JSON.stringify(state.categories || [], null, 2), 10)}<div class="admin-actions"><button class="btn btn-primary" type="submit">분류 저장</button></div></form>
    <form class="admin-card form" id="pageForm"><h2>기관소개·수상·이력 페이지 제목/내용 수정</h2>${input('aboutTitle', '기관소개 제목', p.about?.title)}${textarea('aboutDescription', '기관소개 설명', p.about?.description, 3)}${textarea('aboutBody', '기관소개 본문', p.about?.body, 7)}${input('aboutImage', '기관소개 이미지 URL/Data URL', p.about?.image)}<div class="field"><label>기관소개 이미지 파일</label><input type="file" id="aboutFile" accept="image/*"></div>${input('awardsTitle', '수상·인증 제목', p.awards?.title)}${textarea('awardsDescription', '수상·인증 설명', p.awards?.description, 3)}${textarea('awardsItems', '수상·인증 항목(줄바꿈 구분)', (p.awards?.items || []).join('\n'), 6)}${input('historyTitle', '활동이력 제목', p.history?.title)}${textarea('historyDescription', '활동이력 설명', p.history?.description, 3)}${textarea('historyItems', '활동이력 JSON', JSON.stringify(p.history?.items || [], null, 2), 12)}<div class="admin-actions"><button class="btn btn-primary" type="submit">페이지 저장</button></div></form>`);
    $('#menuForm').addEventListener('submit', e => { e.preventDefault(); try { state.menus = JSON.parse(new FormData(e.currentTarget).get('menus') || '[]'); } catch { toast('메뉴 JSON 형식이 올바르지 않습니다.'); return; } save(); toast('메뉴가 저장되었습니다.'); render(); });
    $('#categoryForm').addEventListener('submit', e => { e.preventDefault(); try { state.categories = JSON.parse(new FormData(e.currentTarget).get('categories') || '[]'); } catch { toast('분류 JSON 형식이 올바르지 않습니다.'); return; } save(); toast('분류가 저장되었습니다.'); render(); });
    $('#aboutFile').addEventListener('change', e => readFile(e.target.files[0], url => { state.pages = state.pages || {}; state.pages.about = state.pages.about || {}; state.pages.about.image = url; save(); toast('기관소개 이미지가 저장되었습니다.'); render(); }));
    $('#pageForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); try { state.pages.history.items = JSON.parse(fd.get('historyItems') || '[]'); } catch { toast('활동이력 JSON 형식이 올바르지 않습니다.'); return; } state.pages = state.pages || {}; state.pages.about = { ...(state.pages.about || {}), title: fd.get('aboutTitle'), description: fd.get('aboutDescription'), body: fd.get('aboutBody'), image: fd.get('aboutImage') }; state.pages.awards = { ...(state.pages.awards || {}), title: fd.get('awardsTitle'), description: fd.get('awardsDescription'), items: lines(fd.get('awardsItems')) }; state.pages.history = { ...(state.pages.history || {}), title: fd.get('historyTitle'), description: fd.get('historyDescription'), items: state.pages.history.items }; save(); toast('페이지 정보가 저장되었습니다.'); render(); });
  }

  function bannerPopupSettings() {
    const cfg = state.noticePopup || {};
    shell(`<form class="admin-card form" id="bannerGlobal"><h2>배너 크기/속도 설정</h2><div class="admin-grid">${input('heroHeight', '메인 배너 높이(px)', state.site?.heroHeight, 'number')}${input('heroMaxWidth', '메인 내부 최대 너비(px)', state.site?.heroMaxWidth, 'number')}${input('bannerInterval', '배너 전환 속도(ms)', state.site?.bannerInterval, 'number')}</div><div class="admin-actions"><button class="btn btn-primary" type="submit">크기 저장</button></div></form>
    <div class="admin-card"><div class="admin-top"><h2>메인 배너 관리</h2><button class="btn btn-primary btn-small" id="addBanner">배너 추가</button></div><div id="bannerList">${(state.banners || []).map((b, i) => bannerEditor(b, i)).join('')}</div></div>
    <form class="admin-card form" id="popupForm"><h2>공지사항 JS 팝업 설정</h2><div class="admin-grid">${select('enabled', '팝업 사용', cfg.enabled !== false ? 'true' : 'false', [{ value: 'true', label: '사용' }, { value: 'false', label: '사용 안 함' }])}${input('count', '팝업 창 개수', cfg.count, 'number')}${input('width', '팝업 가로 크기(px)', cfg.width, 'number')}${input('height', '팝업 세로 크기(px)', cfg.height, 'number')}${input('title', '팝업 상단 제목', cfg.title)}${select('sourceBoard', '불러올 게시판', cfg.sourceBoard || 'notices', Object.keys(state.boards || {}).map(k => ({ value: k, label: state.boards[k].label })))}${select('showOnHomeOnly', '홈에서만 노출', cfg.showOnHomeOnly !== false ? 'true' : 'false', [{ value: 'true', label: '홈에서만' }, { value: 'false', label: '모든 페이지' }])}${select('showOncePerSession', '닫은 후 재노출', cfg.showOncePerSession !== false ? 'true' : 'false', [{ value: 'true', label: '이번 접속 동안 숨김' }, { value: 'false', label: '페이지 이동 때 다시 표시' }])}</div><div class="admin-actions"><button class="btn btn-primary" type="submit">팝업 설정 저장</button></div></form>`);
    $('#bannerGlobal').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); state.site.heroHeight = Number(fd.get('heroHeight') || 640); state.site.heroMaxWidth = Number(fd.get('heroMaxWidth') || 1180); state.site.bannerInterval = Number(fd.get('bannerInterval') || 5400); save(); toast('배너 크기가 저장되었습니다.'); render(); });
    $('#addBanner').addEventListener('click', () => { state.banners = state.banners || []; state.banners.push({ id: uid('b'), title: '새 배너', subtitle: '배너 설명', button: '자세히 보기', link: '#/programs', image: '', visible: true }); save(); render(); });
    $$('#bannerList form').forEach(form => form.addEventListener('submit', saveBanner));
    $$('#bannerList [data-del]').forEach(btn => btn.addEventListener('click', () => { if (confirm('배너를 삭제할까요?')) { state.banners.splice(Number(btn.dataset.del), 1); save(); render(); } }));
    $$('#bannerList [data-up]').forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.up); if (i > 0) { [state.banners[i - 1], state.banners[i]] = [state.banners[i], state.banners[i - 1]]; save(); render(); } }));
    $$('#bannerList [data-down]').forEach(btn => btn.addEventListener('click', () => { const i = Number(btn.dataset.down); if (i < state.banners.length - 1) { [state.banners[i + 1], state.banners[i]] = [state.banners[i], state.banners[i + 1]]; save(); render(); } }));
    $$('#bannerList [data-file]').forEach(inp => inp.addEventListener('change', e => { const i = Number(e.target.dataset.file); readFile(e.target.files[0], url => { state.banners[i].image = url; save(); toast('배너 이미지가 저장되었습니다.'); render(); }); }));
    $('#popupForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); state.noticePopup = { enabled: fd.get('enabled') === 'true', count: Number(fd.get('count') || 1), width: Number(fd.get('width') || 380), height: Number(fd.get('height') || 310), title: fd.get('title'), sourceBoard: fd.get('sourceBoard'), showOnHomeOnly: fd.get('showOnHomeOnly') === 'true', showOncePerSession: fd.get('showOncePerSession') === 'true' }; sessionStorage.removeItem('notice-popups-closed'); save(); toast('공지 팝업 설정이 저장되었습니다.'); render(); });
  }

  function bannerEditor(b, i) {
    return `<form class="repeat-card form" data-banner-form="${i}"><h3>배너 ${i + 1}</h3><div class="admin-grid">${input('title', '제목', b.title)}${input('subtitle', '설명', b.subtitle)}${input('button', '버튼명', b.button)}${input('link', '링크', b.link)}${input('image', '이미지 URL/Data URL', b.image)}<div class="field"><label>이미지 파일</label><input type="file" data-file="${i}" accept="image/*"></div></div><label><input type="checkbox" name="visible" ${b.visible !== false ? 'checked' : ''}> 노출</label><div class="preview-img">${b.image ? `<img src="${escapeHtml(b.image)}" alt="배너 미리보기">` : '이미지 없음'}</div><div class="admin-actions"><button class="btn btn-primary btn-small" type="submit">저장</button><button class="btn btn-line btn-small" type="button" data-up="${i}">위로</button><button class="btn btn-line btn-small" type="button" data-down="${i}">아래로</button><button class="btn btn-line btn-small danger" type="button" data-del="${i}">삭제</button></div></form>`;
  }
  function saveBanner(e) { e.preventDefault(); const i = Number(e.currentTarget.dataset.bannerForm); const fd = new FormData(e.currentTarget); state.banners[i] = { ...state.banners[i], ...Object.fromEntries(fd.entries()), visible: fd.get('visible') === 'on' }; save(); toast('배너가 저장되었습니다.'); render(); }

  function programs() {
    const p = editing?.type === 'program' ? (state.programs || []).find(x => x.slug === editing.id) : null;
    const cats = state.categories || [];
    shell(`<div class="admin-card"><div class="admin-top"><h2>프로그램 목록</h2><button class="btn btn-primary btn-small" id="newProgram">새 프로그램</button></div><table class="admin-table"><thead><tr><th>제목</th><th>분류</th><th>대상</th><th>관리</th></tr></thead><tbody>${(state.programs || []).map(x => `<tr><td>${escapeHtml(x.title)}</td><td>${escapeHtml(cats.find(c => c.slug === x.category)?.title || x.category)}</td><td>${escapeHtml(x.target || '')}</td><td><button class="icon-btn" data-edit-program="${x.slug}">수정</button> <button class="icon-btn danger" data-delete-program="${x.slug}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4">프로그램이 없습니다.</td></tr>'}</tbody></table></div>
    <form class="admin-card form" id="programForm"><h2>${p ? '프로그램 수정' : '프로그램 등록'}</h2><input type="hidden" name="oldSlug" value="${escapeHtml(p?.slug || '')}"><div class="admin-grid">${input('title', '제목', p?.title || '')}${input('slug', '주소 슬러그', p?.slug || '')}${select('category', '분류', p?.category || cats[0]?.slug || '', cats.map(c => ({ value: c.slug, label: c.title })))}${input('target', '대상', p?.target || '')}${input('duration', '차시', p?.duration || '')}${input('tags', '태그(쉼표 구분)', (p?.tags || []).join(', '))}${input('image', '이미지 URL/Data URL', p?.image || '')}<div class="field"><label>이미지 파일</label><input type="file" id="programFile" accept="image/*"></div></div>${textarea('summary', '요약', p?.summary || '', 3)}${textarea('sections', '상세 섹션 JSON - 제목과 내용 전부 수정 가능', JSON.stringify(p?.sections || [{ heading: '프로그램 목표', items: ['내용을 입력하세요.'] }], null, 2), 10)}<div class="preview-img">${p?.image ? `<img src="${escapeHtml(p.image)}" alt="미리보기">` : '이미지 없음'}</div><div class="admin-actions"><button class="btn btn-primary" type="submit">저장</button><button class="btn btn-line" type="button" id="clearProgram">입력 초기화</button></div></form>`);
    $('#newProgram').addEventListener('click', () => { editing = null; render(); });
    $('#programFile').addEventListener('change', e => readFile(e.target.files[0], url => { $('#programForm [name=image]').value = url; toast('이미지가 입력되었습니다. 저장 버튼을 눌러주세요.'); }));
    $('#programForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const obj = Object.fromEntries(fd.entries()); let sections = []; try { sections = JSON.parse(obj.sections || '[]'); } catch { toast('상세 섹션 JSON 형식이 올바르지 않습니다.'); return; } const item = { slug: obj.slug || uid('program'), category: obj.category, title: obj.title, summary: obj.summary, image: obj.image, duration: obj.duration, target: obj.target, tags: (obj.tags || '').split(',').map(x => x.trim()).filter(Boolean), sections }; const idx = (state.programs || []).findIndex(x => x.slug === obj.oldSlug); if (idx >= 0) state.programs[idx] = item; else { state.programs = state.programs || []; state.programs.push(item); } save(); editing = null; toast('프로그램이 저장되었습니다.'); render(); });
    $('#clearProgram').addEventListener('click', () => { editing = null; render(); });
    $$('[data-edit-program]').forEach(btn => btn.addEventListener('click', () => { editing = { type: 'program', id: btn.dataset.editProgram }; render(); }));
    $$('[data-delete-program]').forEach(btn => btn.addEventListener('click', () => { if (confirm('프로그램을 삭제할까요?')) { state.programs = state.programs.filter(x => x.slug !== btn.dataset.deleteProgram); save(); render(); } }));
  }

  function boards() {
    const keys = Object.keys(state.boards || {});
    const edit = editing?.type === 'post' ? getPost(editing.board, editing.id) : null;
    shell(`<form class="admin-card form" id="boardMetaForm"><h2>게시판 이름·설명 수정</h2>${textarea('boardsMeta', '게시판 정보 JSON', JSON.stringify(Object.fromEntries(keys.map(k => [k, { label: state.boards[k].label, description: state.boards[k].description }])), null, 2), 10)}<div class="admin-actions"><button class="btn btn-primary" type="submit">게시판 정보 저장</button></div></form>${keys.map(k => boardTable(k)).join('')}
    <form class="admin-card form" id="postForm"><h2>${edit ? '게시글 수정' : '게시글 등록'}</h2><input type="hidden" name="oldId" value="${escapeHtml(edit?.id || '')}"><div class="admin-grid">${select('board', '게시판', editing?.board || keys[0], keys.map(k => ({ value: k, label: state.boards[k].label })))}${input('title', '제목', edit?.title || '')}${input('author', '작성자', edit?.author || '관리자')}${input('date', '작성일', edit?.date || today(), 'date')}${input('category', '분류', edit?.category || '')}${input('image', '이미지 URL/Data URL', edit?.image || '')}<div class="field"><label>이미지 파일</label><input type="file" id="postFile" accept="image/*"></div></div>${textarea('content', '내용', edit?.content || '', 9)}<div class="admin-actions"><button class="btn btn-primary" type="submit">저장</button><button class="btn btn-line" type="button" id="clearPost">입력 초기화</button></div></form>`);
    $('#boardMetaForm').addEventListener('submit', e => { e.preventDefault(); let meta; try { meta = JSON.parse(new FormData(e.currentTarget).get('boardsMeta') || '{}'); } catch { toast('게시판 정보 JSON 형식이 올바르지 않습니다.'); return; } Object.keys(meta).forEach(k => { if (state.boards[k]) { state.boards[k].label = meta[k].label || state.boards[k].label; state.boards[k].description = meta[k].description || ''; } }); save(); toast('게시판 정보가 저장되었습니다.'); render(); });
    $('#postFile').addEventListener('change', e => readFile(e.target.files[0], url => { $('#postForm [name=image]').value = url; toast('이미지가 입력되었습니다. 저장 버튼을 눌러주세요.'); }));
    $('#postForm').addEventListener('submit', e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const obj = Object.fromEntries(fd.entries()); const board = obj.board; const oldBoard = editing?.board || board; const oldId = obj.oldId; const post = { id: oldId || uid('post'), title: obj.title, author: obj.author, date: obj.date, category: obj.category, image: obj.image, content: obj.content, views: edit?.views || 0 }; if (oldId) state.boards[oldBoard].posts = state.boards[oldBoard].posts.filter(x => x.id !== oldId); state.boards[board].posts = state.boards[board].posts || []; state.boards[board].posts.unshift(post); editing = null; save(); toast('게시글이 저장되었습니다.'); render(); });
    $('#clearPost').addEventListener('click', () => { editing = null; render(); });
    $$('[data-edit-post]').forEach(btn => btn.addEventListener('click', () => { editing = { type: 'post', board: btn.dataset.board, id: btn.dataset.editPost }; render(); }));
    $$('[data-delete-post]').forEach(btn => btn.addEventListener('click', () => { if (confirm('게시글을 삭제할까요?')) { state.boards[btn.dataset.board].posts = state.boards[btn.dataset.board].posts.filter(x => x.id !== btn.dataset.deletePost); save(); render(); } }));
  }
  function getPost(board, id) { return state.boards?.[board]?.posts?.find(x => x.id === id); }
  function boardTable(k) { const b = state.boards[k]; return `<div class="admin-card"><div class="admin-top"><h2>${escapeHtml(b.label)}</h2><span class="mini">${(b.posts || []).length}개 글</span></div><table class="admin-table"><thead><tr><th>제목</th><th>작성일</th><th>조회</th><th>관리</th></tr></thead><tbody>${(b.posts || []).map(p => `<tr><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.date || '')}</td><td>${Number(p.views || 0)}</td><td><button class="icon-btn" data-board="${k}" data-edit-post="${p.id}">수정</button> <button class="icon-btn danger" data-board="${k}" data-delete-post="${p.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4">등록된 글이 없습니다.</td></tr>'}</tbody></table></div>`; }

  function inquiries() {
    shell(`<div class="admin-card"><div class="admin-top"><h2>문의내역</h2><button class="btn btn-line btn-small" id="downloadCsv">CSV 다운로드</button></div><table class="admin-table"><thead><tr><th>접수일</th><th>작성자</th><th>연락처</th><th>학교/기관</th><th>프로그램</th><th>상태</th><th>관리</th></tr></thead><tbody>${(state.inquiries || []).map(i => `<tr><td>${escapeHtml(i.date || '')}</td><td>${escapeHtml(i.name || '')}</td><td>${escapeHtml(i.phone || '')}</td><td>${escapeHtml(i.school || '')}</td><td>${escapeHtml(i.program || '')}</td><td><select data-status="${i.id}"><option ${i.status === '접수' ? 'selected' : ''}>접수</option><option ${i.status === '상담중' ? 'selected' : ''}>상담중</option><option ${i.status === '완료' ? 'selected' : ''}>완료</option></select></td><td><button class="icon-btn" data-view-inq="${i.id}">보기</button> <button class="icon-btn danger" data-del-inq="${i.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="7">문의 내역이 없습니다.</td></tr>'}</tbody></table></div><form class="admin-card form" id="inquiryTextForm"><h2>문의 페이지 문구 수정</h2>${input('title', '문의 페이지 제목', state.inquiryForm?.title)}${textarea('description', '문의 페이지 설명', state.inquiryForm?.description, 3)}${textarea('privacyText', '개인정보 동의 문구', state.inquiryForm?.privacyText, 3)}${input('sideTitle', '오른쪽 안내 제목', state.inquiryForm?.sideTitle)}${textarea('sideBody', '오른쪽 안내 본문', state.inquiryForm?.sideBody, 5)}<div class="admin-actions"><button class="btn btn-primary" type="submit">문구 저장</button></div></form><div id="inqDetail"></div>`);
    $$('[data-status]').forEach(sel => sel.addEventListener('change', () => { const i = state.inquiries.find(x => x.id === sel.dataset.status); if (i) { i.status = sel.value; save(); toast('상태가 변경되었습니다.'); } }));
    $$('[data-view-inq]').forEach(btn => btn.addEventListener('click', () => { const i = state.inquiries.find(x => x.id === btn.dataset.viewInq); $('#inqDetail').innerHTML = `<div class="admin-card"><h2>${escapeHtml(i.name || '문의')} 상세</h2><pre class="json-box">${escapeHtml(JSON.stringify(i, null, 2))}</pre></div>`; }));
    $$('[data-del-inq]').forEach(btn => btn.addEventListener('click', () => { if (confirm('문의 내역을 삭제할까요?')) { state.inquiries = state.inquiries.filter(x => x.id !== btn.dataset.delInq); save(); render(); } }));
    $('#downloadCsv').addEventListener('click', downloadCsv);
    $('#inquiryTextForm').addEventListener('submit', e => { e.preventDefault(); state.inquiryForm = { ...state.inquiryForm, ...Object.fromEntries(new FormData(e.currentTarget).entries()) }; save(); toast('문의 페이지 문구가 저장되었습니다.'); render(); });
  }

  function dataTools() {
    const cfg = JSON.parse(localStorage.getItem('gaon-gil-github-config') || '{}');
    shell(`<div class="split"><div class="admin-card"><h2>데이터 내보내기</h2><p>아래 JSON을 복사하거나 다운로드해서 <code>assets/data/site-data.json</code>에 덮어쓰면 GitHub Pages 전체 방문자에게 반영됩니다.</p><textarea class="json-box" id="exportJson">${escapeHtml(JSON.stringify(state, null, 2))}</textarea><div class="admin-actions"><button class="btn btn-primary" id="downloadJson">JSON 다운로드</button><button class="btn btn-line" id="copyJson">복사</button></div></div><div class="admin-card"><h2>데이터 가져오기</h2><p>백업 JSON을 붙여넣고 적용할 수 있습니다.</p><textarea class="json-box" id="importJson" placeholder="여기에 JSON 붙여넣기"></textarea><div class="admin-actions"><button class="btn btn-primary" id="applyJson">가져오기 적용</button></div><div class="notice-box">GitHub Pages는 정적 호스팅이므로 브라우저에 먼저 저장됩니다. 아래 'GitHub에 바로 반영'을 사용하면 JSON 파일을 다운로드하지 않고 저장소에 직접 커밋할 수 있습니다.</div></div></div>
    <form class="admin-card form" id="githubSyncForm"><h2>GitHub에 바로 반영</h2><p>관리자에서 수정한 현재 데이터를 <code>assets/data/site-data.json</code> 파일로 GitHub 저장소에 직접 덮어씁니다. 저장소 소유자, 저장소명, 브랜치, 토큰을 입력한 뒤 실행하세요.</p><div class="admin-grid">${input('owner', 'GitHub 소유자/아이디', cfg.owner || '', 'text', '예: myid')}${input('repo', '저장소 이름', cfg.repo || '', 'text', '예: gaon-gil-edu')}${input('branch', '브랜치', cfg.branch || 'main')}${input('path', '데이터 파일 경로', cfg.path || 'assets/data/site-data.json')}${input('token', 'GitHub Personal Access Token', '', 'password', 'Contents: Read and write 권한 필요')}${input('message', '커밋 메시지', '관리자 페이지 데이터 업데이트')}</div><div class="notice-box"><b>주의:</b> 토큰은 저장하지 않고 이번 실행에만 사용합니다. Fine-grained token은 해당 저장소의 <b>Contents: Read and write</b> 권한이 필요합니다.</div><div class="admin-actions"><button class="btn btn-primary" type="submit" id="pushGithub">현재 데이터 GitHub에 반영</button><button class="btn btn-line" type="button" id="saveGithubCfg">저장소 정보만 저장</button></div><pre class="json-box" id="githubResult" style="min-height:80px;white-space:pre-wrap;">실행 결과가 여기에 표시됩니다.</pre></form>`);
    $('#downloadJson').addEventListener('click', () => downloadFile('site-data.json', JSON.stringify(state, null, 2), 'application/json'));
    $('#copyJson').addEventListener('click', async () => { await navigator.clipboard.writeText(JSON.stringify(state, null, 2)); toast('JSON을 복사했습니다.'); });
    $('#applyJson').addEventListener('click', () => { try { const next = JSON.parse($('#importJson').value); state = next; save(); toast('데이터를 가져왔습니다.'); render(); } catch { toast('JSON 형식이 올바르지 않습니다.'); } });
    $('#saveGithubCfg').addEventListener('click', () => { const fd = new FormData($('#githubSyncForm')); localStorage.setItem('gaon-gil-github-config', JSON.stringify({ owner: fd.get('owner'), repo: fd.get('repo'), branch: fd.get('branch'), path: fd.get('path') })); toast('저장소 정보를 저장했습니다.'); });
    $('#githubSyncForm').addEventListener('submit', async e => { e.preventDefault(); await pushToGithub(new FormData(e.currentTarget)); });
  }

  function base64Utf8(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  async function githubJson(url, token, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!res.ok) throw new Error(data?.message || `GitHub API 오류: ${res.status}`);
    return data;
  }

  async function pushToGithub(fd) {
    const owner = String(fd.get('owner') || '').trim();
    const repo = String(fd.get('repo') || '').trim();
    const branch = String(fd.get('branch') || 'main').trim();
    const path = String(fd.get('path') || 'assets/data/site-data.json').trim().replace(/^\/+/, '');
    const token = String(fd.get('token') || '').trim();
    const message = String(fd.get('message') || '관리자 페이지 데이터 업데이트').trim();
    const result = $('#githubResult');
    if (!owner || !repo || !branch || !path || !token) { toast('GitHub 정보와 토큰을 모두 입력해주세요.'); return; }
    localStorage.setItem('gaon-gil-github-config', JSON.stringify({ owner, repo, branch, path }));
    result.textContent = 'GitHub 저장소의 기존 site-data.json 정보를 확인하는 중...';
    try {
      const api = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;
      let sha = undefined;
      try {
        const current = await githubJson(api, token);
        sha = current.sha;
      } catch (err) {
        if (!String(err.message || '').includes('Not Found')) throw err;
      }
      result.textContent = '현재 데이터를 GitHub에 커밋하는 중...';
      const payload = {
        message,
        content: base64Utf8(JSON.stringify(state, null, 2)),
        branch
      };
      if (sha) payload.sha = sha;
      const updated = await githubJson(api.replace(/\?ref=.*$/, ''), token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      result.textContent = `완료되었습니다.\n커밋: ${updated.commit?.html_url || '커밋 URL 없음'}\n파일: ${updated.content?.html_url || path}\n잠시 후 GitHub Pages에 반영됩니다.`;
      toast('GitHub에 반영했습니다.');
    } catch (err) {
      result.textContent = `실패했습니다.\n${err.message}\n\n확인할 내용:\n1. 저장소 소유자/이름/브랜치가 맞는지\n2. 토큰에 Contents: Read and write 권한이 있는지\n3. GitHub Pages가 main/root 또는 사용 중인 브랜치로 설정되어 있는지`;
      toast('GitHub 반영에 실패했습니다.');
    }
  }

  function downloadCsv() { const keys = ['date', 'name', 'phone', 'email', 'school', 'region', 'role', 'program', 'grade', 'classes', 'students', 'status', 'message']; const rows = [keys]; (state.inquiries || []).forEach(i => rows.push(keys.map(k => String(i[k] || '').replace(/"/g, '""')))); const csv = rows.map(r => r.map(x => `"${x}"`).join(',')).join('\n'); downloadFile('inquiries.csv', csv, 'text/csv;charset=utf-8'); }
  function downloadFile(name, content, type) { const blob = new Blob([content], { type }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
  function readFile(file, cb) { if (!file) return; const reader = new FileReader(); reader.onload = () => cb(reader.result); reader.readAsDataURL(file); }

  function render() {
    if (!isLogin()) { loginView(); return; }
    if (tab === 'dashboard') dashboard();
    if (tab === 'site') siteSettings();
    if (tab === 'home') homeSettings();
    if (tab === 'menu') menuPageSettings();
    if (tab === 'banners') bannerPopupSettings();
    if (tab === 'programs') programs();
    if (tab === 'boards') boards();
    if (tab === 'inquiries') inquiries();
    if (tab === 'data') dataTools();
  }

  load().then(render);
})();
