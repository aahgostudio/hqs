// 어닝톡 푸시 보내는 서버 함수 (Supabase Edge Function 'push')
// DB(on_chat_msg)가 보낸 묶음을 받아 각 폰으로 웹 푸시. 없어진 구독은 DB에서 지움 → 다음부터 알림톡.
// 키는 코드에 없음: DB의 push_keys()에서 서비스 키로 읽어옴.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
let cfg: { pub: string; priv: string; subject: string; secret: string } | null = null;

Deno.serve(async (req) => {
  if (!cfg) {
    const { data, error } = await sb.rpc("push_keys");
    if (error || !data) return new Response("no_keys", { status: 500 });
    cfg = data; webpush.setVapidDetails(cfg!.subject, cfg!.pub, cfg!.priv);
  }
  if (req.headers.get("x-push-secret") !== cfg!.secret) return new Response("forbidden", { status: 401 });
  const { msgs = [] } = await req.json().catch(() => ({ msgs: [] }));
  const dead: string[] = []; let ok = 0, fail = 0;
  await Promise.all(msgs.flatMap((m: any) => (m.subs || []).map(async (s: any) => {
    try {
      await webpush.sendNotification(s, JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag }), { TTL: 86400, urgency: "high" });
      ok++;
    } catch (e: any) {
      fail++; if (e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint);
    }
  })));
  if (dead.length) await sb.rpc("push_dead", { p_endpoints: dead });
  return Response.json({ ok, fail, dead: dead.length });
});
