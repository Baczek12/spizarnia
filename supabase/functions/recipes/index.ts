// Supabase Edge Function: "recipes"
// Generuje przepisy przez Gemini na podstawie składników ze spiżarni.
// Klucz GEMINI_API_KEY trzymany jest jako sekret (nigdy w repo/froncie).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const products: any[] = Array.isArray(body.products) ? body.products : [];
    const meal: string = body.meal || "";

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "Brak GEMINI_API_KEY w sekretach" }, 500);
    if (!products.length) return json({ recipes: [] }, 200);

    const list = products
      .map((p) => `- ${p.name}${p.brand ? " (" + p.brand + ")" : ""}: ${p.qty} ${p.unit || ""}`.trim())
      .join("\n");
    const mealLine = meal && meal !== "Wszystkie" ? `Skup się na pomysłach na: ${meal}.` : "";

    const prompt =
`Jesteś polskim szefem kuchni planującym posiłki z domowej spiżarni.
Na podstawie PONIŻSZYCH składników zaproponuj 3 ciekawe, wykonalne przepisy. ${mealLine}
Zasady:
- Bazuj na podanych składnikach + podstawy (sól, pieprz, olej, woda, cukier).
- Jeśli do dobrego dania brakuje 1-2 składników, dopisz je w "missing".
- Pisz po polsku, zwięźle i konkretnie. Każdy przepis 3-6 kroków.
- Dobierz trafne emoji do dania.

SKŁADNIKI W SPIŻARNI:
${list}

Zwróć WYŁĄCZNIE poprawny JSON w dokładnie tym formacie:
{"recipes":[{"name":"...","emoji":"🍝","meal":"Śniadanie|Obiad|Kolacja","ingredients":["..."],"missing":["..."],"steps":["..."]}]}`;

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
