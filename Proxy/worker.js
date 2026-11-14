/**
 * وسيط مباريات كورة تايم.
 *
 * المشكلة التي يحلّها: بلا وسيط يحتاج كل مستخدم مفتاحاً باسمه من
 * API-Football — وأغلب من يحمّل تطبيقاً لا يسجّل في خدمة ليستعمله، فيرى
 * شاشة شبه فارغة ويحذف التطبيق. ومع الوسيط يُطلب يوم المباريات مرّة واحدة
 * ويُخدَم لكل المستخدمين من الذاكرة، فمفتاح واحد يكفي الجميع.
 *
 * المفتاح يعيش في أسرار Cloudflare ولا يغادر الخادم إطلاقاً — لا يُشحن
 * داخل التطبيق حيث يمكن استخراجه من الحزمة.
 *
 * الاستجابة تحمل شكل API-Football نفسه لكن مقلّمة إلى الحقول التي يقرؤها
 * التطبيقان، فيعمل المحلّل الموجود فيهما بلا تغيير ويصغر الحِمل على شبكة
 * الجوال إلى نحو العُشر.
 */

const UPSTREAM = "https://v3.football.api-sports.io/fixtures";

// اليوم يتغيّر باستمرار فيُخزَّن دقيقة؛ بقيّة الأيام تُخزَّن ست ساعات.
const TTL_TODAY = 60;
const TTL_OTHER = 6 * 60 * 60;

// أبعد ممّا يعرضه التطبيق (‏٤− إلى ١٠+) بهامش، فلا يُستنزف المفتاح بطلبات
// عشوائية لتواريخ بعيدة.
const MAX_DAYS_BACK = 30;
const MAX_DAYS_AHEAD = 60;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (request.method !== "GET") return cors(json({ error: "method" }, 405));

    if (url.pathname === "/health") {
      return cors(json({ ok: true, hasKey: Boolean(env.API_FOOTBALL_KEY) }));
    }

    if (url.pathname !== "/fixtures") return cors(json({ error: "not_found" }, 404));

    const date = url.searchParams.get("date") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return cors(json({ error: "bad_date" }, 400));
    }

    const days = dayOffset(date);
    if (days === null || days < -MAX_DAYS_BACK || days > MAX_DAYS_AHEAD) {
      return cors(json({ error: "out_of_range" }, 400));
    }

    if (!env.API_FOOTBALL_KEY) {
      // بلا مفتاح لا نتظاهر بالنجاح: التطبيق يسقط إلى مصدره القديم.
      return cors(json({ error: "no_key", response: [] }, 503));
    }

    const cache = caches.default;
    const cacheKey = new Request(`${url.origin}/fixtures?date=${date}`, request);
    const hit = await cache.match(cacheKey);
    if (hit) return cors(hit);

    let upstream;
    try {
      upstream = await fetch(`${UPSTREAM}?date=${date}`, {
        headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
      });
    } catch (error) {
      return cors(json({ error: "upstream_unreachable", response: [] }, 502));
    }

    if (!upstream.ok) {
      return cors(json({ error: "upstream_" + upstream.status, response: [] }, 502));
    }

    let payload;
    try {
      payload = await upstream.json();
    } catch (error) {
      return cors(json({ error: "upstream_bad_json", response: [] }, 502));
    }

    const fixtures = Array.isArray(payload?.response) ? payload.response : [];
    const body = { date, count: fixtures.length, response: fixtures.map(trim) };

    const ttl = days === 0 ? TTL_TODAY : TTL_OTHER;
    const response = json(body, 200, {
      "Cache-Control": `public, max-age=${ttl}`,
      "X-KT-Count": String(fixtures.length),
    });

    // يوم فارغ قد يكون حدّ الخطة لا يوماً بلا مباريات، فلا نخزّنه طويلاً.
    if (fixtures.length > 0) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return cors(response);
  },
};

/** الحقول التي يقرؤها التطبيقان فقط، بشكل API-Football نفسه. */
function trim(item) {
  const fixture = item?.fixture ?? {};
  const league = item?.league ?? {};
  const teams = item?.teams ?? {};
  const goals = item?.goals ?? {};
  return {
    fixture: {
      id: fixture.id ?? null,
      date: fixture.date ?? null,
      status: {
        short: fixture.status?.short ?? null,
        elapsed: fixture.status?.elapsed ?? null,
      },
      venue: { name: fixture.venue?.name ?? null },
    },
    league: {
      id: league.id ?? null,
      name: league.name ?? null,
      country: league.country ?? null,
      logo: league.logo ?? null,
      round: league.round ?? null,
    },
    teams: {
      home: { name: teams.home?.name ?? null, logo: teams.home?.logo ?? null },
      away: { name: teams.away?.name ?? null, logo: teams.away?.logo ?? null },
    },
    goals: { home: goals.home ?? null, away: goals.away ?? null },
  };
}

function dayOffset(date) {
  const asked = Date.parse(date + "T00:00:00Z");
  if (Number.isNaN(asked)) return null;
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((asked - utcToday) / 86400000);
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function cors(response) {
  const out = new Response(response.body, response);
  out.headers.set("Access-Control-Allow-Origin", "*");
  out.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return out;
}
