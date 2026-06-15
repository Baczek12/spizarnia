// Supabase Edge Function: "recipes"
// Generuje przepisy przez Gemini na podstawie składników ze spiżarni.
// Klucz GEMINI_API_KEY trzymany jest jako sekret (nigdy w repo/froncie).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Tylko zalogowany użytkownik (waliduje token sesji przez Supabase Auth).
async function requireUser(req: Request): Promise<boolean> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data, error } = await sb.auth.getUser(jwt);
    return !error && !!data.user;
  } catch { return false; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await requireUser(req))) return json({ error: "Wymagane logowanie" }, 401);
  try {
    const body = await req.json().catch(() => ({}));
    const products: any[] = Array.isArray(body.products) ? body.products : [];
    const meal: string = body.meal || "";
    const prefs: string[] = Array.isArray(body.prefs) ? body.prefs.slice(0, 8) : [];
    const useFirst: string[] = Array.isArray(body.useFirst) ? body.useFirst.slice(0, 30) : [];

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "Brak GEMINI_API_KEY w sekretach" }, 500);
    if (!products.length) return json({ recipes: [] }, 200);

    const list = products
      .map((p) => `- ${p.name}${p.brand ? " (" + p.brand + ")" : ""}: ${p.qty} ${p.unit || ""}`.trim())
      .join("\n");
    const mealLine = meal && meal !== "Wszystkie" ? `Skup się na pomysłach na: ${meal}.` : "";
    const prefLine = prefs.length
      ? `Użytkownik ma dziś ochotę na: ${prefs.join(", ")}. Postaraj się to uwzględnić w stylu/kuchni dań, ale priorytetem zawsze są dostępne składniki.`
      : "";
    const wasteLine = useFirst.length
      ? `TRYB ANTY-MARNOWANIE: te produkty KOŃCZĄ SIĘ lub są PO TERMINIE — ułóż przepisy tak, by zużyć je w PIERWSZEJ kolejności: ${useFirst.join(", ")}. Każdy przepis powinien wykorzystywać przynajmniej jeden z nich.`
      : "";

    const prompt =
`Jesteś polskim szefem kuchni planującym posiłki z domowej spiżarni.
Na podstawie PONIŻSZYCH składników zaproponuj 3 ciekawe, wykonalne przepisy (porcja dla 2 osób). ${mealLine} ${prefLine} ${wasteLine}
Zasady:
- Bazuj na podanych składnikach + podstawy (sól, pieprz, olej, woda, cukier).
- Przy KAŻDYM składniku w "ingredients" i "missing" podaj DOKŁADNĄ ILOŚĆ potrzebną do dania, np. "Ryż – 1 szklanka (200 g)", "Mleko kokosowe – 400 ml", "Curry – 1 łyżeczka", "Czosnek – 2 ząbki", "Kurczak – 500 g".
- Kroki ("steps") opisz BARDZO DOKŁADNIE i po kolei: ile dokładnie czego dodać (miary: g, ml, łyżka, łyżeczka, szklanka, szczypta), jak długo gotować/smażyć/dusić/piec i w jakiej temperaturze lub na jakim ogniu. Podaj 6-9 konkretnych, ponumerowanych w treści kroków.
- Jeśli do dobrego dania brakuje 1-2 składników, dopisz je w "missing" (też z ilością).
- Pisz po polsku, naturalnie. Dobierz trafne emoji do dania.

SKŁADNIKI W SPIŻARNI:
${list}

Zwróć WYŁĄCZNIE poprawny JSON w dokładnie tym formacie:
{"recipes":[{"name":"...","emoji":"🍝","meal":"Śniadanie|Obiad|Kolacja","ingredients":["Składnik – ilość", "..."],"missing":["Składnik – ilość"],"steps":["Krok 1: ...", "Krok 2: ..."]}]}`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const gr = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
      }),
    });

    if (!gr.ok) {
      const t = await gr.text();
      return json({ error: "Gemini HTTP " + gr.status, detail: t }, 502);
    }
    const data = await gr.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { recipes: [] }; }
    if (!Array.isArray(parsed.recipes)) parsed = { recipes: [] };
    return json(parsed, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
