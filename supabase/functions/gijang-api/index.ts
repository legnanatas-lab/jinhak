
const GAONGIL_SITE_NAME = "가온길 에듀-가온길 입시 전략 연구소";
function normalizeBrandText(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replaceAll("기장군 진학진로 지원센터", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진학진로지원센터", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진로진학지원센터", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진로진학 지원센터", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진학진로 지원선테", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진학진로지원선테", GAONGIL_SITE_NAME)
      .replaceAll("기장군 진학진로 지원센타", GAONGIL_SITE_NAME)
      .replaceAll("가온길 에듀-입시 전략 연구소", GAONGIL_SITE_NAME)
      .replaceAll("가온길 에듀-가인길 입시 전략 연구소", GAONGIL_SITE_NAME)
      .replaceAll("가온길 에듀-가인골 입시 전략 연구소", GAONGIL_SITE_NAME);
  }
  if (Array.isArray(value)) return value.map((item) => normalizeBrandText(item));
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) next[key] = normalizeBrandText(entry);
    return next;
  }
  return value;
}
function applyBranding(site: Record<string, unknown>) {
  const next = normalizeBrandText(site || {}) as Record<string, unknown>;
  next.siteName = GAONGIL_SITE_NAME;
  return next;
}
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function firstKeyFromJsonEnv(name: string) {
  try {
    const raw = Deno.env.get(name);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed.default || Object.values(parsed)[0] || "";
  } catch {
    return "";
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? firstKeyFromJsonEnv("SUPABASE_SECRET_KEYS");
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? firstKeyFromJsonEnv("SUPABASE_PUBLISHABLE_KEYS");

type Role = "admin" | "consultant";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function snakeToApp(row: Record<string, unknown>) {
  return {
    id: row.id,
    createdAt: row.created_at,
    programId: row.program_id,
    programTitle: row.program_title,
    programPath: row.program_path,
    status: row.status,
    applicantType: row.applicant_type,
    consultantId: row.consultant_id,
    consultantName: row.consultant_name,
    place: row.place,
    date: row.date,
    time: row.time,
    residence: row.residence,
    studentName: row.student_name,
    parentPhone: row.parent_phone,
    studentPhone: row.student_phone,
    school: row.school,
    grade: row.grade,
    password: row.password,
    content: row.content,
    memo: row.memo,
    viewCount: row.view_count,
    sortOrder: row.sort_order
  };
}

function appToSnake(app: Record<string, unknown>) {
  return {
    id: app.id,
    created_at: app.createdAt,
    program_id: app.programId,
    program_title: app.programTitle,
    program_path: app.programPath,
    status: app.status ?? "접수",
    applicant_type: app.applicantType,
    consultant_id: app.consultantId,
    consultant_name: app.consultantName,
    place: app.place,
    date: app.date,
    time: app.time,
    residence: app.residence,
    student_name: app.studentName,
    parent_phone: app.parentPhone,
    student_phone: app.studentPhone,
    school: app.school,
    grade: app.grade,
    password: app.password,
    content: app.content,
    memo: app.memo ?? "",
    view_count: app.viewCount ?? 0
  };
}

function profileToUser(row: Record<string, unknown>) {
  return {
    id: row.login_id,
    authUserId: row.auth_user_id,
    name: row.name,
    role: row.role,
    permissions: Array.isArray(row.permissions) ? row.permissions.map(String) : [],
    active: row.active,
    password: ""
  };
}

function publicProfile(row: Record<string, unknown>) {
  return {
    id: row.login_id,
    name: row.name,
    role: row.role,
    active: row.active
  };
}

function normalizePath(path = "") {
  const value = String(path || "").trim();
  if (!value || value === "/") return "/";
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function withProgramDefaults(site: Record<string, unknown>, fallback: Record<string, unknown>) {
  const next = applyBranding({ ...(site || {}) });
  if (!Array.isArray(next.applicationPrograms) || next.applicationPrograms.length === 0) {
    if (Array.isArray(fallback?.applicationPrograms)) next.applicationPrograms = fallback.applicationPrograms;
  }
  return next;
}

function findApplicationProgramSchedule(site: Record<string, unknown>, app: Record<string, unknown>) {
  const programs = Array.isArray(site?.applicationPrograms) ? site.applicationPrograms as Array<Record<string, unknown>> : [];
  const program = programs.find((item) => {
    if (item.enabled === false) return false;
    return String(item.id || "") === String(app.programId || "")
      || normalizePath(String(item.path || "")) === normalizePath(String(app.programPath || ""))
      || String(item.title || "") === String(app.programTitle || "");
  });
  if (!program) return null;
  const schedules = Array.isArray(program.schedules) ? program.schedules as Array<Record<string, unknown>> : [];
  const schedule = schedules.find((item) => {
    if (item.enabled === false) return false;
    const times = Array.isArray(item.times) ? item.times.map(String) : [];
    const scheduleIdMatches = String(app.scheduleId || "") && String(item.id || "") === String(app.scheduleId || "");
    const dateTeacherMatches = String(item.date || "") === String(app.date || "") && String(item.consultantId || "") === String(app.consultantId || "");
    return (scheduleIdMatches || dateTeacherMatches) && times.includes(String(app.time || ""));
  });
  if (!schedule) return null;
  return { program, schedule };
}

function schedulesOnlyMerge(existingPrograms: unknown, incomingPrograms: unknown) {
  const existing = Array.isArray(existingPrograms) ? existingPrograms as Array<Record<string, unknown>> : [];
  const incoming = Array.isArray(incomingPrograms) ? incomingPrograms as Array<Record<string, unknown>> : [];
  return existing.map((program) => {
    const next = incoming.find((item) => String(item.id || "") === String(program.id || ""));
    if (!next) return program;
    return {
      ...program,
      schedules: Array.isArray(next.schedules) ? next.schedules : []
    };
  });
}

async function rest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.msg || `Database request failed: ${response.status}`);
  }
  return data;
}

async function authAdmin(path: string, init: RequestInit = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.msg || `Auth admin request failed: ${response.status}`);
  }
  return data;
}

async function getAuthUser(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: ANON_KEY,
      Authorization: header
    }
  });
  if (!response.ok) return null;
  return await response.json();
}

async function getProfile(req: Request) {
  const authUser = await getAuthUser(req);
  if (!authUser?.id) return null;
  const rows = await rest(`staff_profiles?auth_user_id=eq.${encodeURIComponent(authUser.id)}&active=eq.true&select=*`);
  if (!rows?.[0]) return null;
  return profileToUser(rows[0]);
}

async function requireRole(req: Request, roles: Role[]) {
  const profile = await getProfile(req);
  if (!profile || !roles.includes(profile.role as Role)) {
    throw new Error("권한이 없습니다.");
  }
  return profile;
}

function hasPermission(profile: ReturnType<typeof profileToUser>, permission: string) {
  return profile.role === "admin" || (Array.isArray(profile.permissions) && profile.permissions.includes(permission));
}

async function requireProgramManager(req: Request) {
  const profile = await requireRole(req, ["admin", "consultant"]);
  if (!hasPermission(profile, "manage_programs")) throw new Error("프로그램 일정 관리 권한이 없습니다.");
  return profile;
}

async function stateValue(key: string, fallback: unknown) {
  const rows = await rest(`app_state?key=eq.${encodeURIComponent(key)}&select=value&limit=1`);
  return rows?.[0]?.value ?? fallback;
}

async function saveState(key: string, value: unknown) {
  await rest("app_state?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() })
  });
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value as Array<Record<string, unknown>> : [];
}

async function loadTestData() {
  const [testRequests, testTickets, testResults] = await Promise.all([
    stateValue("testRequests", []),
    stateValue("testTickets", []),
    stateValue("testResults", [])
  ]);
  return {
    testRequests: asRecordArray(testRequests),
    testTickets: asRecordArray(testTickets),
    testResults: asRecordArray(testResults)
  };
}

async function saveTestData(data: Record<string, unknown>) {
  if (Array.isArray(data.testRequests)) await saveState("testRequests", data.testRequests);
  if (Array.isArray(data.testTickets)) await saveState("testTickets", data.testTickets);
  if (Array.isArray(data.testResults)) await saveState("testResults", data.testResults);
}

async function listProfiles() {
  const rows = await rest("staff_profiles?active=eq.true&select=auth_user_id,login_id,name,role,permissions,active&order=role.asc,name.asc");
  return rows.map(profileToUser);
}

async function listPublicConsultants() {
  const rows = await rest("staff_profiles?active=eq.true&role=eq.consultant&select=login_id,name,role,active&order=name.asc");
  return rows.map(publicProfile);
}

async function listAllProfiles() {
  const rows = await rest("staff_profiles?select=auth_user_id,login_id,name,role,permissions,active");
  return rows.map(profileToUser);
}

async function listApplications(profile: ReturnType<typeof profileToUser>) {
  const orderedQuery = profile.role === "admin"
    ? "applications?select=*&order=sort_order.asc.nullslast,created_at.desc"
    : `applications?consultant_id=eq.${encodeURIComponent(String(profile.id))}&select=*&order=sort_order.asc.nullslast,created_at.desc`;
  const fallbackQuery = profile.role === "admin"
    ? "applications?select=*&order=created_at.desc"
    : `applications?consultant_id=eq.${encodeURIComponent(String(profile.id))}&select=*&order=created_at.desc`;
  try {
    const rows = await rest(orderedQuery);
    return rows.map(snakeToApp);
  } catch (error) {
    if (!String(error.message || "").includes("sort_order")) throw error;
    const rows = await rest(fallbackQuery);
    return rows.map(snakeToApp);
  }
}

async function listPublicReservations() {
  const orderedQuery = `applications?status=neq.${encodeURIComponent("취소")}&select=id,created_at,program_id,program_title,program_path,status,consultant_id,consultant_name,place,date,time,sort_order&order=date.asc,time.asc`;
  const fallbackQuery = `applications?status=neq.${encodeURIComponent("취소")}&select=id,created_at,program_id,program_title,program_path,status,consultant_id,consultant_name,place,date,time&order=date.asc,time.asc`;
  try {
    const rows = await rest(orderedQuery);
    return rows.map(snakeToApp);
  } catch (error) {
    if (!String(error.message || "").includes("sort_order")) throw error;
    const rows = await rest(fallbackQuery);
    return rows.map(snakeToApp);
  }
}

async function saveApplicationChange(app: Record<string, unknown>, sortOrder: number) {
  const id = String(app.id || "");
  if (!id) throw new Error("수정할 신청 ID가 없습니다.");
  const consultantId = String(app.consultantId || "").trim();
  let consultantName = String(app.consultantName || "").trim();
  if (consultantId) {
    const consultants = await listProfiles();
    const consultant = consultants.find((item: Record<string, unknown>) => item.id === consultantId && item.role === "consultant");
    if (!consultant) throw new Error("배정할 컨설턴트를 확인할 수 없습니다.");
    consultantName = String(consultant.name || consultantName);
  }
  const patch = {
    status: app.status ?? "접수",
    program_id: app.programId,
    program_title: app.programTitle,
    program_path: app.programPath,
    applicant_type: app.applicantType,
    consultant_id: consultantId,
    consultant_name: consultantName,
    place: app.place,
    date: app.date,
    time: app.time,
    residence: app.residence,
    student_name: app.studentName,
    parent_phone: app.parentPhone,
    student_phone: app.studentPhone,
    school: app.school,
    grade: app.grade,
    content: app.content,
    memo: app.memo ?? "",
    sort_order: Number(app.sortOrder ?? sortOrder) || sortOrder
  };
  try {
    const updated = await rest(`applications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch)
    });
    return snakeToApp(updated[0]);
  } catch (error) {
    if (!String(error.message || "").includes("sort_order")) throw error;
    const { sort_order, ...patchWithoutSort } = patch;
    const updated = await rest(`applications?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patchWithoutSort)
    });
    return snakeToApp(updated[0]);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("Supabase 함수 환경변수가 없습니다.");
    const body = await req.json();
    const action = body.action;
    const payload = body.payload ?? {};

    if (action === "bootstrap") {
      const site = withProgramDefaults(await stateValue("site", payload.site ?? {}), payload.site ?? {});
      const applicationsCount = await rest("applications?select=id&limit=1");
      if ((applicationsCount ?? []).length === 0 && Array.isArray(payload.applications)) {
        const seedRows = payload.applications.map((item: Record<string, unknown>) => appToSnake(item));
        if (seedRows.length) {
          await rest("applications", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(seedRows)
          });
        }
      }
      await saveState("site", site);
      const testData = await loadTestData();
      return json({ site, users: await listPublicConsultants(), applications: await listPublicReservations(), ...testData });
    }

    if (action === "submitTestRequest") {
      const request = (payload.request ?? {}) as Record<string, unknown>;
      const data = await loadTestData();
      const clean = {
        ...request,
        id: String(request.id || crypto.randomUUID()),
        type: String(request.type || "student"),
        status: "신청",
        createdAt: String(request.createdAt || new Date().toISOString()),
        name: String(request.name || "").trim(),
        school: String(request.school || "").trim(),
        grade: String(request.grade || "").trim(),
        phone: String(request.phone || "").trim(),
        email: String(request.email || "").trim(),
        message: String(request.message || "").trim(),
        ticketId: "",
        ticketCode: "",
        sentAt: ""
      };
      if (!clean.name || !clean.phone || !clean.email) throw new Error("이름, 연락처, 이메일은 필수입니다.");
      data.testRequests = [clean, ...data.testRequests];
      await saveTestData(data);
      return json(data);
    }

    if (action === "listTestData") {
      await requireRole(req, ["admin"]);
      return json(await loadTestData());
    }

    if (action === "saveTestData") {
      await requireRole(req, ["admin"]);
      const data = {
        testRequests: Array.isArray(payload.testRequests) ? payload.testRequests : [],
        testTickets: Array.isArray(payload.testTickets) ? payload.testTickets : [],
        testResults: Array.isArray(payload.testResults) ? payload.testResults : []
      };
      await saveTestData(data);
      return json(data);
    }

    if (action === "lookupTestTicket") {
      const code = String(payload.code || "").trim().toUpperCase();
      const password = String(payload.password || "");
      const type = String(payload.type || "student");
      const data = await loadTestData();
      const ticket = data.testTickets.find((item: Record<string, unknown>) => String(item.type || "") === type && String(item.code || "").toUpperCase() === code && String(item.password || "") === password);
      if (!ticket) throw new Error("검사권 번호 또는 비밀번호가 일치하지 않습니다.");
      const resultId = String(ticket.resultId || "");
      const result = resultId ? data.testResults.find((item: Record<string, unknown>) => String(item.id || "") === resultId) : null;
      return json({ ...data, ticket, result });
    }

    if (action === "submitTestResult") {
      const ticketId = String(payload.ticketId || "");
      const code = String(payload.code || "").trim().toUpperCase();
      const type = String(payload.type || "student");
      const incoming = (payload.result ?? {}) as Record<string, unknown>;
      const data = await loadTestData();
      const ticket = data.testTickets.find((item: Record<string, unknown>) => String(item.id || "") === ticketId && String(item.code || "").toUpperCase() === code && String(item.type || "") === type);
      if (!ticket) throw new Error("검사권을 확인할 수 없습니다.");
      if (ticket.resultId) throw new Error("이미 완료된 검사권입니다.");
      const result = { ...incoming, id: String(incoming.id || crypto.randomUUID()), ticketId: ticket.id, ticketCode: ticket.code, type, createdAt: String(incoming.createdAt || new Date().toISOString()) };
      data.testResults = [result, ...data.testResults];
      data.testTickets = data.testTickets.map((item: Record<string, unknown>) => {
        if (String(item.id || "") !== String(ticket.id || "")) return item;
        const personName = type === "parent" ? result.parentName : result.studentName;
        return { ...item, resultId: result.id, status: "완료", completedAt: result.createdAt, name: personName || item.name, school: result.school || item.school, grade: result.grade || item.grade, childName: result.childName || item.childName, childGrade: result.childGrade || item.childGrade, phone: result.phone || item.phone };
      });
      await saveTestData(data);
      return json({ ...data, result });
    }

    if (action === "me") {
      const profile = await requireRole(req, ["admin", "consultant"]);
      return json({ user: profile, users: profile.role === "admin" ? await listProfiles() : await listPublicConsultants() });
    }

    if (action === "listUsers") {
      await requireRole(req, ["admin"]);
      return json({ users: await listProfiles() });
    }

    if (action === "submitApplication") {
      const app = payload.application ?? {};
      const site = withProgramDefaults(await stateValue("site", {}), payload.site ?? {});
      const planned = findApplicationProgramSchedule(site, app);
      if (!planned) throw new Error("관리자가 설정한 신청 가능 일정과 일치하지 않습니다.");
      const consultants = await listProfiles();
      const schedule = planned.schedule;
      const program = planned.program;
      const consultant = consultants.find((item: Record<string, unknown>) => item.id === schedule.consultantId && item.role === "consultant");
      if (!consultant) throw new Error("선택한 컨설턴트를 확인할 수 없습니다.");
      const row = appToSnake({
        ...app,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        programId: program.id,
        programTitle: program.title,
        programPath: program.path,
        status: "접수",
        consultantId: schedule.consultantId,
        consultantName: consultant.name,
        place: schedule.place,
        date: schedule.date
      });
      try {
        const inserted = await rest("applications", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(row)
        });
        return json({ application: snakeToApp(inserted[0]) });
      } catch (error) {
        if (String(error.message || "").includes("duplicate")) {
          throw new Error("이미 같은 컨설턴트의 같은 날짜와 시간에 접수된 신청이 있습니다.");
        }
        throw error;
      }
    }

    if (action === "lookupApplication") {
      const name = String(payload.name ?? "").trim();
      const password = String(payload.password ?? "");
      const rows = await rest(`applications?student_name=eq.${encodeURIComponent(name)}&password=eq.${encodeURIComponent(password)}&select=*&order=created_at.desc`);
      return json({ applications: rows.map(snakeToApp) });
    }

    if (action === "listApplications") {
      const profile = await requireRole(req, ["admin", "consultant"]);
      return json({ applications: await listApplications(profile) });
    }

    if (action === "deleteApplication") {
      await requireRole(req, ["admin"]);
      await rest(`applications?id=eq.${encodeURIComponent(String(payload.id))}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      });
      return json({ ok: true });
    }

    if (action === "saveApplicationChanges") {
      await requireRole(req, ["admin"]);
      const incoming = Array.isArray(payload.applications) ? payload.applications : [];
      const updated = [];
      for (let index = 0; index < incoming.length; index += 1) {
        updated.push(await saveApplicationChange(incoming[index], index + 1));
      }
      return json({ applications: updated });
    }

    if (action === "saveSite") {
      await requireRole(req, ["admin"]);
      await saveState("site", payload.site ?? {});
      return json({ ok: true });
    }

    if (action === "savePrograms") {
      const profile = await requireProgramManager(req);
      const site = withProgramDefaults(await stateValue("site", payload.site ?? {}), payload.site ?? {});
      if (profile.role === "admin") {
        site.applicationPrograms = Array.isArray(payload.applicationPrograms) ? payload.applicationPrograms : site.applicationPrograms;
        if (Array.isArray(payload.nav)) site.nav = payload.nav;
      } else {
        site.applicationPrograms = schedulesOnlyMerge(site.applicationPrograms, payload.applicationPrograms);
      }
      await saveState("site", site);
      return json({ site });
    }

    if (action === "saveUsers") {
      await requireRole(req, ["admin"]);
      const domain = String(payload.authEmailDomain || "gijang.local").replace(/^@/, "");
      const nextUsers = Array.isArray(payload.users) ? payload.users : [];
      const previousUsers = await listAllProfiles();
      const keptAuthUserIds = new Set<string>();
      for (const user of nextUsers) {
        const loginId = String(user.id || "").trim();
        if (!loginId) continue;
        const email = loginId.includes("@") ? loginId : `${loginId}@${domain}`;
        let authUserId = String(user.authUserId || "");
        const password = String(user.password || "");
        const permissions = Array.isArray(user.permissions) ? user.permissions.map(String).filter(Boolean) : [];
        if (!authUserId) {
          const created = await authAdmin("/users", {
            method: "POST",
            body: JSON.stringify({
              email,
              password: password || "000000",
              email_confirm: true,
              user_metadata: { login_id: loginId, name: user.name, role: user.role, permissions }
            })
          });
          authUserId = created.id ?? created.user?.id;
          if (!authUserId) throw new Error("생성된 Supabase Auth 사용자 ID를 확인하지 못했습니다.");
        } else {
          const updateBody: Record<string, unknown> = {
            email,
            user_metadata: { login_id: loginId, name: user.name, role: user.role, permissions }
          };
          if (password) updateBody.password = password;
          await authAdmin(`/users/${authUserId}`, {
            method: "PUT",
            body: JSON.stringify(updateBody)
          });
        }
        keptAuthUserIds.add(authUserId);
        await rest("staff_profiles?on_conflict=auth_user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            auth_user_id: authUserId,
            login_id: loginId,
            name: user.name,
            role: user.role,
            permissions,
            active: true,
            updated_at: new Date().toISOString()
          })
        });
      }
      for (const user of previousUsers) {
        if (user.role === "admin") continue;
        const authUserId = String(user.authUserId || "");
        if (authUserId && !keptAuthUserIds.has(authUserId)) {
          await rest(`staff_profiles?auth_user_id=eq.${encodeURIComponent(authUserId)}`, {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({ active: false, updated_at: new Date().toISOString() })
          });
        }
      }
      return json({ users: await listProfiles() });
    }

    if (action === "changePassword") {
      const profile = await requireRole(req, ["admin", "consultant"]);
      const password = String(payload.password || "");
      if (password.length < 6) throw new Error("새 비밀번호는 6자 이상이어야 합니다.");
      await authAdmin(`/users/${profile.authUserId}`, {
        method: "PUT",
        body: JSON.stringify({ password })
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    return json({ error: error.message || "요청 처리에 실패했습니다." }, 400);
  }
});
