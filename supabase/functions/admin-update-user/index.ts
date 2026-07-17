// Edge Function: admin-update-user
// تغيير البريد الإلكتروني و/أو كلمة المرور لمستخدم آخر عبر Admin API
// لا يمكن تنفيذ هذه العملية من المتصفح مباشرة لأنها تتطلب service_role key
//
// صلاحيات هذه العملية (نظام هرمي — Hierarchy Scope):
//   - تعديل البريد الإلكتروني: أي مدير يمكنه تعديل بريد أي مستخدم ضمن
//     نطاقه الإداري (get_user_subtree)، أو Super Admin لأي مستخدم.
//   - إعادة تعيين كلمة المرور: Super Admin فقط. يُمنع أي مدير آخر من تغيير
//     أو إعادة تعيين كلمة مرور أي مستخدم آخر (كل مستخدم يغيّر كلمة مروره
//     الخاصة به فقط من مكان آخر فى النظام).

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

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // التحقق من هوية المستدعي
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

    // التحقق من صلاحية المستدعي
    const { data: callerProfile, error: profileError } = await adminClient
      .from("users")
      .select("role")
      .eq("id", callerAuth.user.id)
      .maybeSingle();

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({ error: "تعذر التحقق من صلاحيات المستخدم" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerRole = callerProfile.role as UserRole;
    const isSuperAdmin = callerRole === "super_admin";

    // Agent / Premium Agent لا صلاحية إدارية لهم إطلاقاً على هذا المسار
    if (callerRole === "agent" || callerRole === "premium_agent") {
      return new Response(
        JSON.stringify({ error: "غير مصرح: ليس لديك صلاحية لتعديل بيانات مستخدمين آخرين" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { user_id, password, email } = body;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id مطلوب" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!password && !email) {
      return new Response(
        JSON.stringify({ error: "يجب توفير password أو email على الأقل" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── إعادة تعيين كلمة المرور: Super Admin فقط ───────────────
    if (password && !isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: "غير مصرح: إعادة تعيين كلمة مرور مستخدم آخر متاحة فقط لمدير النظام (Super Admin)" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── تعديل البريد الإلكتروني: يجب أن يكون المستخدم المستهدف ضمن
    //    النطاق الإداري للمستدعي (أو المستدعي Super Admin) ────────
    if (email && !isSuperAdmin) {
      const { data: subtree, error: subtreeError } = await adminClient.rpc("get_user_subtree", {
        user_id: callerAuth.user.id,
      });

      if (subtreeError || !subtree || !(subtree as string[]).includes(user_id)) {
        return new Response(
          JSON.stringify({ error: "غير مصرح: هذا المستخدم خارج نطاقك الإداري" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // بناء payload التحديث
    const updatePayload: { password?: string; email?: string } = {};
    if (password) updatePayload.password = password;
    if (email) updatePayload.email = email;

    // تحديث المستخدم عبر Admin API
    const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(
      user_id,
      updatePayload
    );

    if (updateError) {
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // لو الإيميل اتغير، حدّث في جدول users كمان
    if (email) {
      const { error: emailUpdateErr } = await adminClient
        .from("users")
        .update({ email, updated_at: new Date().toISOString() })
        .eq("id", user_id);

      if (emailUpdateErr) {
        console.error("Failed to update email in users table:", emailUpdateErr);
      }
    }

    // تسجيل النشاط
    await adminClient.from("activity_logs").insert({
      user_id: callerAuth.user.id,
      action_type: "user_update",
      entity_type: "user",
      entity_id: user_id,
      new_values: password ? { password_changed: true } : { email },
    });

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "خطأ غير متوقع" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
