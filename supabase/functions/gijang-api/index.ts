const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

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
    viewCount: row.view_count
  };
}

function appToSnake(app: Record<string, unknown>) {
  return {
    id: app.id,
    created_at: app.createdAt,
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

async function listProfiles() {
  const rows = await rest("staff_profiles?active=eq.true&select=auth_user_id,login_id,name,role,active&order=role.asc,name.asc");
  return rows.map(profileToUser);
}

async function listPublicConsultants() {
  const rows = await rest("staff_profiles?active=eq.true&role=eq.consultant&select=login_id,name,role,active&order=name.asc");
  return rows.map(publicProfile);
}

async function listAllProfiles() {
  const rows = await rest("staff_profiles?select=auth_user_id,login_id,name,role,active");
  return rows.map(profileToUser);
}

async function listApplications(profile: ReturnType<typeof profileToUser>) {
  const query = profile.role === "admin"
    ? "applications?select=*&order=created_at.desc"
    : `applications?consultant_id=eq.${encodeURIComponent(String(profile.id))}&select=*&order=created_at.desc`;
  const rows = await rest(query);
  return rows.map(snakeToApp);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) throw new Error("Supabase 함수 환경변수가 없습니다.");
    const body = await req.json();
    const action = body.action;
    const payload = body.payload ?? {};

    if (action === "bootstrap") {
      const site = await stateValue("site", payload.site ?? {});
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
      return json({ site, users: await listPublicConsultants(), applications: [] });
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
      const consultants = await listProfiles();
      const consultant = consultants.find((item: Record<string, unknown>) => item.id === app.consultantId && item.role === "consultant");
      if (!consultant) throw new Error("선택한 컨설턴트를 확인할 수 없습니다.");
      const row = appToSnake({
        ...app,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        status: "접수",
        consultantName: consultant.name
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

    if (action === "saveSite") {
      await requireRole(req, ["admin"]);
      await saveState("site", payload.site ?? {});
      return json({ ok: true });
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
        if (!authUserId) {
          const created = await authAdmin("/users", {
            method: "POST",
            body: JSON.stringify({
              email,
              password: password || "0000",
              email_confirm: true,
              user_metadata: { login_id: loginId, name: user.name, role: user.role }
            })
          });
          authUserId = created.id ?? created.user?.id;
          if (!authUserId) throw new Error("생성된 Supabase Auth 사용자 ID를 확인하지 못했습니다.");
        } else {
          const updateBody: Record<string, unknown> = {
            email,
            user_metadata: { login_id: loginId, name: user.name, role: user.role }
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
      if (password.length < 4) throw new Error("새 비밀번호는 4자 이상이어야 합니다.");
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
