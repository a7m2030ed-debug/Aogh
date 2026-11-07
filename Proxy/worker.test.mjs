// اختبار منطق الوسيط بلا Cloudflare: نستبدل fetch وذاكرة الحوافّ.
import worker from "./worker.js";

const FIXTURE = {
  fixture: { id: 1, date: "2026-08-23T18:00:00+00:00", status: { short: "1H", elapsed: 23 },
             venue: { name: "ملعب الأول بارك" }, timezone: "UTC", periods: {}, referee: "x" },
  league: { id: 307, name: "Pro League", country: "Saudi-Arabia", logo: "l.png",
            round: "Regular Season - 3", season: 2026, flag: "f.svg" },
  teams: { home: { name: "Al Nassr", logo: "h.png", id: 2939, winner: null },
           away: { name: "Al Hilal", logo: "a.png", id: 2932, winner: null } },
  goals: { home: 1, away: 0 },
  score: { halftime: {}, fulltime: {}, extratime: {}, penalty: {} },
  events: [{ big: "payload" }],
};

globalThis.caches = { default: { store: new Map(),
  async match(req) { return this.store.get(req.url)?.clone(); },
  async put(req, res) { this.store.set(req.url, res.clone()); } } };

let upstreamCalls = 0;
globalThis.fetch = async (url, init) => {
  upstreamCalls++;
  if (!init?.headers?.["x-apisports-key"]) throw new Error("لا مفتاح في الطلب الصاعد");
  return new Response(JSON.stringify({ response: [FIXTURE] }), { status: 200 });
};

const ctx = { waitUntil: (p) => p };
const env = { API_FOOTBALL_KEY: "SECRET" };
const call = (path) => worker.fetch(new Request("https://p.dev" + path), env, ctx);
const today = new Date().toISOString().slice(0, 10);
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`); };

// ١) الصحّة
let r = await call("/health"); let b = await r.json();
check("health يرى المفتاح", r.status === 200 && b.hasKey === true);

// ٢) يوم صالح
r = await call(`/fixtures?date=${today}`); b = await r.json();
check("يوم صالح يردّ 200", r.status === 200);
check("عدد المباريات صحيح", b.response?.length === 1);

// ٣) التقليم: الحقول المطلوبة موجودة والزائدة محذوفة
const f = b.response[0];
check("fixture.date موجود", f.fixture.date === FIXTURE.fixture.date);
check("status.short و elapsed موجودان", f.fixture.status.short === "1H" && f.fixture.status.elapsed === 23);
check("league.country موجود (لتأهيل الاسم)", f.league.country === "Saudi-Arabia");
check("أسماء الفريقين وشعاراهما", f.teams.home.name === "Al Nassr" && f.teams.away.logo === "a.png");
check("الأهداف", f.goals.home === 1 && f.goals.away === 0);
check("الحقول الزائدة حُذفت", f.events === undefined && f.score === undefined && f.league.season === undefined);
const size = JSON.stringify(f).length, raw = JSON.stringify(FIXTURE).length;
check("الحمل أصغر", size < raw, `${size} بايت بدل ${raw}`);

// ٤) التخزين: الطلب الثاني لا يمسّ المصدر
const before = upstreamCalls;
await call(`/fixtures?date=${today}`);
check("الطلب الثاني من الذاكرة", upstreamCalls === before, `طلبات صاعدة: ${upstreamCalls}`);

// ٥) مدخلات خاطئة
r = await call("/fixtures?date=2026-13-99"); check("تاريخ خاطئ يُرفض", r.status === 400);
r = await call("/fixtures?date=1999-01-01"); check("تاريخ بعيد يُرفض", r.status === 400);
r = await call("/nope"); check("مسار مجهول 404", r.status === 404);

// ٦) بلا مفتاح: يعترف بالعطل ولا يتظاهر بالنجاح
r = await worker.fetch(new Request(`https://p.dev/fixtures?date=${today}`), {}, ctx);
b = await r.json();
check("بلا مفتاح 503 وقائمة فارغة", r.status === 503 && Array.isArray(b.response) && b.response.length === 0);

// ٧) CORS
r = await call("/health");
check("ترويسة CORS", r.headers.get("Access-Control-Allow-Origin") === "*");

console.log(`\nنجح ${pass} وفشل ${fail}`);
process.exit(fail ? 1 : 0);
