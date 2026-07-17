// Edge Function: admin-create-user
//
// المشكلة التي يحلها هذا الملف:
// كانت صفحة Users.tsx تستخدم supabase.auth.signUp() من المتصفح مباشرة لإنشاء
// مستخدمين جدد. هذا يسبب مشكلتين خطيرتين:
//   1) signUp() يستبدل جلسة المستخدم الحالي (المدير) بجلسة المستخدم الجديد،
//      أي أن المدير كان "يخرج" من حسابه فجأة بعد إنشاء أي مستخدم.
//   2) trigger on_auth_user_created يُدرج تلقائياً صفاً في public.users،
//      فيتعارض مع أي إدراج يدوي لاحق من نفس الطلب (خطأ تكرار مفتاح أساسي).
//
// الحل: إنشاء المستخدم من جهة الخادم (Edge Function) باستخدام service_role
// و Admin API الرسمي لـ Supabase Auth. هذا لا يغيّر جلسة المتصفح للمستدعي،
// ولا يتعارض مع أي إدراج آخر لأن الـ trigger هو من يُدرج صف public.users
// تلقائياً بكل البيانات (role, manager_id, target, phone) من user_metadata.
//
// صلاحية الإنشاء (نظام هرمي — Hierarchy Scope):
//   - Group Leader          → Agent / Premium Agent فقط، داخل نطاقه.
//   - Supervisor             → Group Leader / Agent / Premium Agent داخل نطاقه.
//   - General Supervisor     → أي درجة أقل منه داخل نطاقه الإداري.
//   - Development Manager    → أي درجة أقل منه داخل نطاقه الإداري.
//   - Super Admin             → أي مستخدم بلا قيود.
//   - Agent / Premium Agent   → ممنوعون من إنشاء أي مستخدم.
//
// المدير المباشر (manager_id) لأي مستخدم جديد ممكن يكون أي درجة وظيفية أعلى
// (مش لازم الدرجة اللي فوق مباشرة بالظبط) طالما هو داخل النطاق الإداري
// للمستدعي. مثال: Agent ينفع يتحط تحت Group Leader أو Supervisor أو أعلى.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UserRole =
  | "super_admin"
  | "development_manager"
  | "general_supervisor"
  | "supervisor"
  | "group_leader"
  | "agent"
  | "premium_agent";

// نفس ترتيب الدرجات المستخدم فى قاعدة البيانات (get_role_level) وفى الواجهة
const ROLE_LEVEL: Record<UserRole, number> = {
  super_admin: 1,
  development_manager: 2,
  general_supervisor: 3,
  supervisor: 4,
  group_leader: 5,
  agent: 6,
  premium_agent: 6,
};

// كل درجة، هل تحتاج مدير مباشر أصلاً؟ (Super Admin فقط لا يحتاج)
const NO_MANAGER_REQUIRED: UserRole[] = ["super_admin"];

const ALL_ROLES = Object.keys(ROLE_LEVEL) as UserRole[];

// الأدوار التي يحق لدرجة وظيفية معيّنة إنشاؤها
function getCreatableRoles(callerRole: UserRole): UserRole[] {
  if (callerRole === "super_admin") return ALL_ROLES;
  const callerLevel = ROLE_LEVEL[callerRole];
  return ALL_ROLES.filter((r) => ROLE_LEVEL[r] > callerLevel);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: لا يوجد رمز دخول" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // عميل بصلاحيات المستدعي نفسه، لمعرفة هويته والتحقق من صلاحيته
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerAuth, error: callerAuthError } = await callerClient.auth.getUser();
    if (callerAuthError || !callerAuth?.user) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: جلسة غير صالحة" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // عميل بصلاحيات service_role لتنفيذ العمليات الإدارية
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from("users")
      .select("id, role")
      .eq("id", callerAuth.user.id)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "تعذر التحقق من صلاحيات المستخدم" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRole = callerProfile.role as UserRole;

    // Agent / Premium Agent ممنوعون تماماً من إنشاء أي مستخدم
    if (!(callerRole in ROLE_LEVEL) || ROLE_LEVEL[callerRole] >= ROLE_LEVEL["agent"]) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: ليس لديك صلاحية لإنشاء مستخدمين" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { email, password, name, role, phone, manager_id, target } = body;

    if (!email || !password || !name || !role) {
      return new Response(
        JSON.stringify({ error: "البيانات المطلوبة: email, password, name, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!(role in ROLE_LEVEL)) {
      return new Response(
        JSON.stringify({ error: "درجة وظيفية غير صحيحة" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const newRole = role as UserRole;

    // 1) هل يحق لهذه الدرجة الوظيفية (المستدعي) إنشاء الدرجة المطلوبة؟
    const creatableRoles = getCreatableRoles(callerRole);
    if (!creatableRoles.includes(newRole)) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: لا يمكنك إنشاء مستخدم بهذه الدرجة الوظيفية" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2) التحقق من المدير المباشر (manager_id): إلزامي لكل الأدوار ما عدا super_admin
    const managerRequired = !NO_MANAGER_REQUIRED.includes(newRole);
    if (managerRequired && !manager_id) {
      return new Response(
        JSON.stringify({ error: "المدير المباشر مطلوب لهذه الدرجة الوظيفية" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (callerRole !== "super_admin" && manager_id) {
      // نطاق المستدعي الإداري (نفسه + كل من تحته فى الهيكل)
      const { data: subtree, error: subtreeError } = await adminClient.rpc("get_user_subtree", {
        user_id: callerAuth.user.id,
      });

      if (subtreeError || !subtree) {
        return new Response(
          JSON.stringify({ error: "تعذر التحقق من النطاق الإداري" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!(subtree as string[]).includes(manager_id)) {
        return new Response(
          JSON.stringify({ error: "غير مصرح: يجب أن يكون المدير المباشر ضمن نطاقك الإداري" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 3) التحقق أن درجة المدير المُختار أعلى فعلاً من درجة المستخدم الجديد
    //    (مش لازم الدرجة اللي فوق مباشرة بالظبط — أي درجة أعلى تصح،
    //    مثلاً Agent ينفع تحت Group Leader أو Supervisor أو أعلى)
    if (managerRequired && manager_id) {
      const { data: managerProfile, error: managerError } = await adminClient
        .from("users")
        .select("role")
        .eq("id", manager_id)
        .maybeSingle();

      if (managerError || !managerProfile) {
        return new Response(
          JSON.stringify({ error: "المدير المباشر المختار غير موجود" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const managerRole = managerProfile.role as UserRole;
      if (!(managerRole in ROLE_LEVEL) || ROLE_LEVEL[managerRole] >= ROLE_LEVEL[newRole]) {
        return new Response(
          JSON.stringify({ error: "المدير المباشر يجب أن يكون بدرجة وظيفية أعلى من الدرجة المطلوب إنشاؤها" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name,
        role,
        phone: phone || null,
        manager_id: manager_id || null,
        target: target ?? 0,
      },
    });

    if (createError) {
      const isDuplicate = createError.message?.toLowerCase().includes("already") ||
        createError.message?.toLowerCase().includes("registered");
      return new Response(
        JSON.stringify({
          error: isDuplicate ? "البريد الإلكتروني مسجل مسبقاً" : createError.message,
        }),
        { status: isDuplicate ? 409 : 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await adminClient.from("activity_logs").insert({
      user_id: callerAuth.user.id,
      action_type: "user_create",
      entity_type: "user",
      entity_id: createdUser.user?.id,
      new_values: { email, name, role },
    });

    return new Response(
      JSON.stringify({ success: true, user_id: createdUser.user?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "خطأ غير متوقع" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
