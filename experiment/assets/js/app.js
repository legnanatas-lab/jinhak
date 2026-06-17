(() => {
  const STORAGE_KEY = 'gaon-gil-edu-data';
  const SESSION_KEY = 'gaon-gil-edu-session';
  const ADMIN_ID = 'admin';
  const ADMIN_PW = '000000';
  let state = structuredClone(window.DEFAULT_DATA || {});
  let currentBanner = 0;
  let bannerTimer = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('#app');

  function escapeHtml(str = '') {
    return String(str).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }
  function nl2br(str = '') { return escapeHtml(str).replace(/\n/g, '<br>'); }
  function safeUrl(url = '') { return String(url || '').replace(/'/g, '%27').replace(/\)/g, '%29'); }
  function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  function versionNumber(v = '0.0.0') {
    return String(v).split('.').reduce((acc, part, i) => acc + (Number.parseInt(part, 10) || 0) * Math.pow(1000, 2 - i), 0);
  }

  async function loadData() {
    try {
      let local = null;
      try { local = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { local = null; }
      let remote = null;
      try {
        const res = await fetch('assets/data/site-data.json', { cache: 'no-store' });
        if (res.ok) remote = await res.json();
      } catch { remote = null; }
      const base = remote || structuredClone(window.DEFAULT_DATA || {});
      if (local && versionNumber(local.version) >= versionNumber(base.version)) state = local;
      else state = base;
    } catch (err) { console.warn('데이터 파일을 불러오지 못해 기본 데이터를 사용합니다.', err); }
  }

  function toast(msg) {
    const old = $('.toast'); if (old) old.remove();
    const node = document.createElement('div'); node.className = 'toast'; node.textContent = msg;
    document.body.appendChild(node); setTimeout(() => node.remove(), 2600);
  }

  function currentRoute() {
    const hash = location.hash || '#/home';
    return hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
  }

  function buildNav() {
    const nav = $('#mainNav');
    nav.innerHTML = (state.menus || []).map(item => {
      const has = item.children && item.children.length;
      return `<div class="nav-item">
        <a class="nav-link" href="${escapeHtml(item.href || '#/home')}">${escapeHtml(item.title)} ${has ? '<span>⌄</span>' : ''}</a>
        ${has ? `<div class="dropdown">${item.children.map(c => `<a href="${escapeHtml(c.href || '#/home')}">${escapeHtml(c.title)}</a>`).join('')}</div>` : ''}
      </div>`;
    }).join('');
    $$('.nav-link', nav).forEach(link => {
      link.addEventListener('click', (e) => {
        if (window.matchMedia('(max-width:900px)').matches && link.nextElementSibling) {
          e.preventDefault(); link.parentElement.classList.toggle('open');
        }
      });
    });
  }

  function updateShell() {
    const site = state.site || {};
    document.title = site.name || '가온길 에듀';
    const brandMark = $('#brandMark');
    if (site.logoImage) {
      brandMark.classList.add('has-image');
      brandMark.innerHTML = `<img src="${escapeHtml(site.logoImage)}" alt="${escapeHtml(site.logoText || site.name || '로고')}" decoding="async">`;
    } else {
      brandMark.classList.remove('has-image');
      brandMark.textContent = site.logoMark || 'G';
    }
    $('#brandText').textContent = site.logoText || site.name || '가온길 에듀';
    $('#footerName').textContent = site.name || '가온길 에듀';
    $('#footerDescription').textContent = site.footer || '';
    $('#footerContact').innerHTML = `전화 ${escapeHtml(site.phone || '')}<br>이메일 ${escapeHtml(site.email || '')}<br>${escapeHtml(site.address || '')}`;
    $('#footerLinks').innerHTML = `<a href="#/inquiry">예약 및 문의</a> · <a href="#/board/notices">공지사항</a> · <a href="#/programs">프로그램</a>`;
    $('#copyright').textContent = site.copyright || '';
    $('#footerBadges').innerHTML = (state.about?.business || []).slice(0, 3).map(x => `<span>${escapeHtml(x)}</span>`).join('');
  }

  function svgThumb(label) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380" role="img" aria-label="${escapeHtml(label)}"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#dcfce7"/></linearGradient></defs><rect width="600" height="380" fill="url(#g)"/><circle cx="490" cy="70" r="90" fill="rgba(255,255,255,.55)"/><path d="M70 270c90-100 155-44 225-105 75-66 135-70 230 20" fill="none" stroke="rgba(39,110,241,.25)" stroke-width="18" stroke-linecap="round"/><text x="38" y="72" font-size="33" font-family="Noto Sans KR, Arial" font-weight="800" fill="#17324d">${escapeHtml(label)}</text></svg>`;
  }

  function hero() {
    const visible = (state.banners || []).filter(b => b.visible !== false);
    const banner = visible[currentBanner % Math.max(visible.length, 1)] || {};
    const home = state.home || {};
    const height = Number(state.site?.heroHeight || 640);
    const bg = banner.image || '';
    const title = banner.title || home.heroTitle || '';
    const subtitle = banner.subtitle || home.heroSubtitle || '';
    const button = banner.button || home.primaryButton || '프로그램 보기';
    const link = banner.link || home.primaryLink || '#/programs';
    clearInterval(bannerTimer);
    if (visible.length > 1) {
      bannerTimer = setInterval(() => { currentBanner = (currentBanner + 1) % visible.length; render(false); }, Number(state.site?.bannerInterval || 5400));
    }
    return `<section class="hero" style="--hero-height:${height}px">
      <div class="hero-bg" ${bg ? `style="background-image:url('${safeUrl(bg)}')"` : ''}></div>
      <div class="hero-orbs" aria-hidden="true"><span></span><span></span><span></span></div>
      <div class="container hero-content" style="max-width:${Number(state.site?.heroMaxWidth || 1180)}px">
        <div class="hero-copy">
          <span class="eyebrow">${escapeHtml(home.heroEyebrow || state.site?.tagline || '')}</span>
          <h1>${nl2br(title || home.heroTitle)}</h1>
          <p>${escapeHtml(subtitle || home.heroSubtitle)}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="${escapeHtml(link)}">${escapeHtml(button)} →</a>
            <a class="btn btn-white" href="${escapeHtml(home.secondaryLink || '#/inquiry')}">${escapeHtml(home.secondaryButton || '예약 문의')}</a>
          </div>
        </div>
        <div class="hero-panel">
          <div class="panel-glow"></div>
          <h3>${escapeHtml(state.site?.tagline || '교육 프로그램')}</h3>
          <div class="mini-board">${(state.stats || []).slice(0, 4).map(s => `<div><b>${escapeHtml(s.value)}</b><span>${escapeHtml(s.label)}</span></div>`).join('')}</div>
        </div>
      </div>
      ${visible.length > 1 ? `<div class="hero-dots">${visible.map((_, i) => `<button class="hero-dot ${i === currentBanner ? 'active' : ''}" data-banner="${i}" aria-label="${i + 1}번 배너"></button>`).join('')}</div>` : ''}
    </section>`;
  }

  function programCard(p) {
    return `<article class="card program-card">
      <a href="#/program/${escapeHtml(p.slug)}">
        <div class="thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">` : svgThumb(p.title)}</div>
        <div class="card-body">
          <span class="badge">${escapeHtml((state.categories || []).find(c => c.slug === p.category)?.title || p.category || '')}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.summary)}</p>
          <div class="meta-row"><span>대상 ${escapeHtml(p.target || '-')}</span><span>차시 ${escapeHtml(p.duration || '-')}</span></div>
        </div>
      </a>
    </article>`;
  }

  function noticePreview() {
    const posts = (state.boards?.notices?.posts || []).slice(0, 3);
    return `<div class="notice-bar"><strong>공지</strong><div>${posts.map(p => `<a href="#/post/notices/${escapeHtml(p.id)}">${escapeHtml(p.title)}</a>`).join('')}</div><a href="#/board/notices">더보기</a></div>`;
  }

  function home() {
    const h = state.home || {};
    const featured = (state.programs || []).slice(0, 6);
    return `${hero()}
      <section class="section section-first"><div class="container">${noticePreview()}</div></section>
      <section class="section">
        <div class="container">
          <div class="section-title">
            <div><span class="badge">${escapeHtml(h.featuredKicker || 'Best Program')}</span><h2>${escapeHtml(h.featuredTitle || '대표 프로그램')}</h2><p>${escapeHtml(h.featuredDescription || '')}</p></div>
            <a class="btn btn-line" href="#/programs">전체보기</a>
          </div>
          <div class="grid grid-3">${featured.map(programCard).join('')}</div>
        </div>
      </section>
      <section class="section section-impact">
        <div class="container grid grid-2 impact-grid">
          <div class="content-block impact-copy">
            <span class="badge">${escapeHtml(h.whyKicker || 'Why')}</span>
            <h2>${escapeHtml(h.whyTitle || '')}</h2>
            <p>${escapeHtml(h.whyBody || '')}</p>
            <div class="pill-list">${(state.about?.strengths || []).map(x => `<span class="pill">${escapeHtml(x)}</span>`).join('')}</div>
          </div>
          <div class="impact-stack">${(state.about?.business || []).slice(0, 6).map((x, i) => `<div class="impact-item"><span>${String(i + 1).padStart(2, '0')}</span><b>${escapeHtml(x)}</b></div>`).join('')}</div>
        </div>
      </section>
      <section class="section">
        <div class="container">
          <div class="section-title"><div><span class="badge">Process</span><h2>${escapeHtml(h.processTitle || '진행 방식')}</h2><p>${escapeHtml(h.processDescription || '')}</p></div></div>
          <div class="grid grid-4">${(state.process || []).map(x => `<article class="card step-card"><b>${escapeHtml(x.title)}</b><p>${escapeHtml(x.body)}</p></article>`).join('')}</div>
        </div>
      </section>
      <section class="section section-soft">
        <div class="container">
          <div class="section-title"><div><span class="badge">News</span><h2>${escapeHtml(h.boardTitle || '소식')}</h2><p>${escapeHtml(h.boardDescription || '')}</p></div></div>
          <div class="grid grid-2">${boardPreview('notices')}${boardPreview('education')}</div>
        </div>
      </section>
      ${contactStrip()}`;
  }

  function boardPreview(key) {
    const b = state.boards?.[key] || { label: '', posts: [] };
    return `<div class="content-block preview-board"><h3>${escapeHtml(b.label)}</h3>${(b.posts || []).slice(0, 4).map(p => `<a href="#/post/${key}/${p.id}"><span>${escapeHtml(p.title)}</span><em>${escapeHtml(p.date || '')}</em></a>`).join('') || '<p>등록된 글이 없습니다.</p>'}<a class="btn btn-line btn-small" href="#/board/${key}">더보기</a></div>`;
  }

  function pageHero(title, desc) {
    return `<section class="page-hero"><div class="container"><div class="breadcrumb"><a href="#/home">홈</a> / ${escapeHtml(title)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(desc || '')}</p></div></section>`;
  }

  function programs(categorySlug = null) {
    const cat = categorySlug ? (state.categories || []).find(c => c.slug === categorySlug) : null;
    const list = categorySlug ? (state.programs || []).filter(p => p.category === categorySlug) : (state.programs || []);
    const title = cat?.title || '전체 프로그램';
    const desc = cat?.description || '가온길 에듀의 교육 프로그램을 대상과 목적에 맞게 선택하세요.';
    return `${pageHero(title, desc)}
      <section class="section"><div class="container">
        <div class="board-tools"><div class="pill-list">${(state.categories || []).map(c => `<a class="pill" href="#/programs/${escapeHtml(c.slug)}">${escapeHtml(c.title)}</a>`).join('')}</div><input class="search-input" id="programSearch" placeholder="프로그램 검색" aria-label="프로그램 검색"></div>
        <div class="grid grid-3" id="programGrid">${list.map(programCard).join('') || `<div class="empty">등록된 프로그램이 없습니다.</div>`}</div>
      </div></section>`;
  }

  function programDetail(slug) {
    const p = (state.programs || []).find(x => x.slug === slug);
    if (!p) return notFound();
    return `${pageHero(p.title, p.summary)}
      <section class="section"><div class="container grid grid-2">
        <div>
          <div class="content-block"><div class="thumb detail-thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">` : svgThumb(p.title)}</div><div class="pill-list">${(p.tags || []).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join('')}</div></div>
          <div class="content-block"><h3>운영 정보</h3><p><strong>대상</strong> ${escapeHtml(p.target || '-')}</p><p><strong>운영 차시</strong> ${escapeHtml(p.duration || '-')}</p><a class="btn btn-primary" href="#/inquiry?program=${encodeURIComponent(p.title)}">이 프로그램 문의하기</a></div>
        </div>
        <div>${(p.sections || []).map(sec => `<div class="content-block"><h2>${escapeHtml(sec.heading)}</h2><ul>${(sec.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`).join('')}</div>
      </div></section>`;
  }

  function about() {
    const p = state.pages?.about || {};
    return `${pageHero(p.title || '기관소개', p.description || '')}
      <section class="section"><div class="container grid grid-2">
        <div class="content-block"><span class="badge">About</span><h2>${escapeHtml(p.title || '')}</h2><p>${nl2br(p.body || '')}</p></div>
        <div class="content-block visual-card">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">` : svgThumb('가온길 에듀')}</div>
      </div>
      <div class="container grid grid-3 feature-grid">${(state.about?.strengths || []).map((x, i) => `<div class="card card-body feature"><div class="feature-icon">${i + 1}</div><div><h3>${escapeHtml(x)}</h3><p>관리자 페이지에서 강점 문구를 수정할 수 있습니다.</p></div></div>`).join('')}</div></section>`;
  }

  function awards() {
    const p = state.pages?.awards || {};
    return `${pageHero(p.title || '수상·인증', p.description || '')}<section class="section"><div class="container grid grid-2">${(p.items || []).map((x, i) => `<div class="content-block"><span class="badge">${String(i + 1).padStart(2, '0')}</span><h2>${escapeHtml(x)}</h2><p>관리자 페이지에서 실제 수상·인증 내역으로 수정할 수 있습니다.</p></div>`).join('')}</div></section>`;
  }

  function history() {
    const p = state.pages?.history || {};
    return `${pageHero(p.title || '활동이력', p.description || '')}<section class="section"><div class="container timeline">${(p.items || []).map(y => `<div class="timeline-item"><b>${escapeHtml(y.year)}</b><div class="content-block"><ul>${(y.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div></div>`).join('')}</div></section>`;
  }

  function board(boardKey) {
    const b = state.boards?.[boardKey];
    if (!b) return notFound();
    const posts = (b.posts || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (boardKey === 'gallery') {
      return `${pageHero(b.label, b.description)}<section class="section"><div class="container"><div class="grid grid-3">${posts.map(p => `<article class="card program-card"><a href="#/post/${boardKey}/${p.id}"><div class="thumb">${p.image ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">` : svgThumb(p.title)}</div><div class="card-body"><span class="badge">${escapeHtml(p.category || '')}</span><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.date || '')} · 조회 ${Number(p.views || 0)}</p></div></a></article>`).join('') || '<div class="empty">등록된 게시글이 없습니다.</div>'}</div></div></section>`;
    }
    return `${pageHero(b.label, b.description)}<section class="section"><div class="container">
      <div class="board-tools"><input class="search-input" id="boardSearch" placeholder="게시글 검색" aria-label="게시글 검색">${boardKey === 'qna' ? '<a class="btn btn-primary" href="#/inquiry">문의 작성</a>' : ''}</div>
      <div class="board-list" id="boardList"><div class="board-row header"><span>번호</span><span>제목</span><span class="hide-s">작성일</span><span class="hide-m">조회</span></div>${posts.map((p, i) => boardRow(boardKey, p, posts.length - i)).join('') || '<div class="empty">등록된 게시글이 없습니다.</div>'}</div>
    </div></section>`;
  }

  function boardRow(key, p, no) {
    return `<div class="board-row" data-title="${escapeHtml((p.title || '').toLowerCase())}"><span>${no}</span><span><a class="board-title-link" href="#/post/${key}/${p.id}">${escapeHtml(p.title)}</a><br><small>${escapeHtml(p.category || '')} · ${escapeHtml(p.author || '')}</small></span><span class="hide-s">${escapeHtml(p.date || '')}</span><span class="hide-m">${Number(p.views || 0)}</span></div>`;
  }

  function post(boardKey, id) {
    const b = state.boards?.[boardKey];
    const p = b?.posts?.find(x => x.id === id);
    if (!b || !p) return notFound();
    p.views = Number(p.views || 0) + 1; saveData();
    return `${pageHero(b.label, b.description)}<section class="section"><div class="container"><article class="content-block post-view">
      <h2>${escapeHtml(p.title)}</h2><div class="post-meta">${escapeHtml(p.author || '')} · ${escapeHtml(p.date || '')} · 조회 ${Number(p.views || 0)}</div>
      ${p.image ? `<div class="thumb detail-thumb"><img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async"></div>` : ''}
      <div class="post-content">${nl2br(p.content || '')}</div>
      <div class="admin-actions"><a class="btn btn-line" href="#/board/${boardKey}">목록</a><a class="btn btn-primary" href="#/inquiry">문의하기</a></div>
    </article></div></section>`;
  }

  function inquiry() {
    const params = new URLSearchParams((location.hash.split('?')[1] || ''));
    const program = params.get('program') || '';
    const info = state.inquiryForm || {};
    return `${pageHero(info.title || '예약 및 문의', info.description || '')}<section class="section"><div class="container grid grid-2">
      <form class="content-block form" id="inquiryForm">
        <div class="form-grid">
          <div class="field"><label>작성자</label><input name="name" required placeholder="성함"></div><div class="field"><label>연락처</label><input name="phone" required placeholder="010-0000-0000"></div>
          <div class="field"><label>이메일</label><input name="email" type="email" placeholder="email@example.com"></div><div class="field"><label>기관/학교명</label><input name="school" placeholder="소속 기관 또는 학교"></div>
          <div class="field"><label>지역</label><input name="region" placeholder="예: 서울, 대구, 부산"></div><div class="field"><label>직급</label><input name="role" placeholder="예: 교사, 담당자"></div>
          <div class="field"><label>희망 시작일</label><input name="startDate" type="datetime-local"></div><div class="field"><label>희망 종료일</label><input name="endDate" type="datetime-local"></div>
          <div class="field"><label>프로그램</label><input name="program" value="${escapeHtml(program)}" placeholder="희망 프로그램"></div><div class="field"><label>학년</label><input name="grade" placeholder="예: 고1"></div>
          <div class="field"><label>학급</label><input name="classes" placeholder="예: 4학급"></div><div class="field"><label>인원</label><input name="students" placeholder="예: 학급당 25명"></div>
        </div>
        <div class="field"><label>세부사항</label><textarea name="message" placeholder="추가 문의 내용을 작성해주세요."></textarea></div>
        <label class="notice-box"><input type="checkbox" required> ${escapeHtml(info.privacyText || '개인정보 수집 및 이용에 동의합니다.')}</label>
        <button class="btn btn-primary" type="submit">제출하기</button>
      </form>
      <aside><div class="content-block"><h2>${escapeHtml(info.sideTitle || '문의 안내')}</h2><p>${nl2br(info.sideBody || '')}</p><p>전화 ${escapeHtml(state.site?.phone || '')}<br>이메일 ${escapeHtml(state.site?.email || '')}</p></div><div class="content-block"><h2>필수 기재 항목</h2><ul><li>학교/기관명</li><li>지역과 희망 일정</li><li>학년, 학급 수, 인원</li><li>희망 프로그램과 운영 목적</li></ul></div></aside>
    </div></section>`;
  }

  function contactStrip() {
    const h = state.home || {};
    return `<section class="section"><div class="container"><div class="contact-strip"><div><h2>${escapeHtml(h.ctaTitle || '')}</h2><p>${escapeHtml(h.ctaBody || '')}</p></div><a class="btn btn-white" href="${escapeHtml(h.ctaLink || '#/inquiry')}">${escapeHtml(h.ctaButton || '문의하기')}</a></div></div></section>`;
  }

  function notFound() { return `${pageHero('페이지를 찾을 수 없습니다', '요청하신 주소가 없거나 삭제되었습니다.')}<section class="section"><div class="container"><a class="btn btn-primary" href="#/home">홈으로 이동</a></div></section>`; }

  function showNoticePopups() {
    const cfg = state.noticePopup || {};
    const layer = $('#popupLayer'); if (!layer) return;
    layer.innerHTML = '';
    const route = currentRoute()[0] || 'home';
    if (!cfg.enabled || (cfg.showOnHomeOnly !== false && route !== 'home')) return;
    if (cfg.showOncePerSession && sessionStorage.getItem('notice-popups-closed') === '1') return;
    const boardKey = cfg.sourceBoard || 'notices';
    const posts = (state.boards?.[boardKey]?.posts || []).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0, Math.max(0, Number(cfg.count || 1)));
    if (!posts.length) return;
    layer.style.setProperty('--popup-width', `${Number(cfg.width || 380)}px`);
    layer.style.setProperty('--popup-height', `${Number(cfg.height || 310)}px`);
    layer.innerHTML = `<div class="popup-stack">${posts.map((p, i) => `<article class="notice-popup" style="--offset:${i}"><header><strong>${escapeHtml(cfg.title || '공지사항')}</strong><button data-close-popup aria-label="닫기">×</button></header><a class="popup-body" href="#/post/${boardKey}/${p.id}"><span class="badge">${escapeHtml(p.category || '공지')}</span><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.content || '').slice(0, 120)}${(p.content || '').length > 120 ? '…' : ''}</p><em>${escapeHtml(p.date || '')}</em></a><footer><label><input type="checkbox" data-no-more> 이번 접속 동안 보지 않기</label><a href="#/board/${boardKey}">전체보기</a></footer></article>`).join('')}</div>`;
    $$('[data-close-popup]', layer).forEach(btn => btn.addEventListener('click', () => {
      const noMore = $('[data-no-more]', btn.closest('.notice-popup'))?.checked;
      btn.closest('.notice-popup').remove();
      if (noMore || !$('.notice-popup', layer)) sessionStorage.setItem('notice-popups-closed', '1');
    }));
  }

  function afterRender(runPopup = true) {
    $$('.hero-dot').forEach(btn => btn.addEventListener('click', () => { currentBanner = Number(btn.dataset.banner); render(); }));
    const ps = $('#programSearch');
    if (ps) ps.addEventListener('input', () => {
      const term = ps.value.trim().toLowerCase(); const route = currentRoute(); const categorySlug = route[1] || null;
      const list = categorySlug ? (state.programs || []).filter(p => p.category === categorySlug) : (state.programs || []);
      $('#programGrid').innerHTML = list.filter(p => `${p.title} ${p.summary} ${(p.tags || []).join(' ')}`.toLowerCase().includes(term)).map(programCard).join('') || '<div class="empty">검색 결과가 없습니다.</div>';
    });
    const bs = $('#boardSearch');
    if (bs) bs.addEventListener('input', () => {
      const term = bs.value.trim().toLowerCase();
      $$('#boardList .board-row:not(.header)').forEach(row => row.style.display = row.dataset.title.includes(term) ? '' : 'none');
    });
    const form = $('#inquiryForm');
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault(); const fd = new FormData(form); const item = Object.fromEntries(fd.entries());
      item.id = `inq-${Date.now()}`; item.date = new Date().toISOString().slice(0, 10); item.status = '접수';
      state.inquiries = state.inquiries || []; state.inquiries.unshift(item);
      state.boards.qna.posts.unshift({ id: `q-${Date.now()}`, title: `[문의] ${item.program || item.school || item.name || '프로그램 문의'}`, author: item.name || '문의자', date: item.date, views: 0, category: '문의', content: `기관/학교: ${item.school || '-'}\n연락처: ${item.phone || '-'}\n이메일: ${item.email || '-'}\n희망일정: ${item.startDate || '-'} ~ ${item.endDate || '-'}\n학년/학급/인원: ${item.grade || '-'} / ${item.classes || '-'} / ${item.students || '-'}\n\n${item.message || ''}` });
      saveData(); form.reset(); toast('문의가 접수되었습니다. 관리자 페이지에서 확인할 수 있습니다.'); location.hash = '#/board/qna';
    });
    if (runPopup) showNoticePopups();
  }

  function render(runPopup = true) {
    const route = currentRoute(); const [head, a, b] = route;
    clearInterval(bannerTimer);
    let html = '';
    if (!head || head === 'home') html = home();
    else if (head === 'programs') html = programs(a || null);
    else if (head === 'program') html = programDetail(a);
    else if (head === 'about') html = about();
    else if (head === 'awards') html = awards();
    else if (head === 'history') html = history();
    else if (head === 'board') html = board(a || 'notices');
    else if (head === 'post') html = post(a, b);
    else if (head === 'inquiry') html = inquiry();
    else html = notFound();
    app.innerHTML = html; app.focus({ preventScroll: true }); afterRender(runPopup); setActiveNav();
  }

  function setActiveNav() {
    const h = location.hash || '#/home';
    $$('.nav-link').forEach(a => {
      const href = a.getAttribute('href');
      a.classList.toggle('active', href === h || (href !== '#/home' && h.startsWith(href)));
    });
  }

  function bindShell() {
    $('#navToggle').addEventListener('click', () => { const nav = $('#mainNav'); nav.classList.toggle('open'); $('#navToggle').setAttribute('aria-expanded', nav.classList.contains('open')); });
    window.addEventListener('hashchange', () => { $('#mainNav').classList.remove('open'); render(); window.scrollTo(0, 0); });
    window.addEventListener('scroll', () => { $('#siteHeader').classList.toggle('is-scrolled', scrollY > 8); $('#topBtn').classList.toggle('show', scrollY > 600); });
    $('#topBtn').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    $('#footerAdminLogin').addEventListener('submit', e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      if (fd.get('id') === ADMIN_ID && fd.get('pw') === ADMIN_PW) { sessionStorage.setItem(SESSION_KEY, '1'); location.href = 'admin.html'; }
      else toast('관리자 아이디 또는 비밀번호가 올바르지 않습니다.');
    });
  }

  loadData().then(() => { updateShell(); buildNav(); bindShell(); if (!location.hash) location.replace('#/home'); render(); });
})();
