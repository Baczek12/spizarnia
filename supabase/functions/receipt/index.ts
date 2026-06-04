// Supabase Edge Function: "receipt"
// Zdjęcie paragonu → Gemini Vision → lista produktów spożywczych (JSON).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const CATS = "Przetwory, Sosy/Pasty, Nabiał, Suche, Tłuszcze, Warzywa, Mięso, Wędliny, Ryby i owoce morza, Owoce, Przyprawy, Makarony i kasze, Pieczywo, Napoje, Kawa / Herbata, Mrożonki, Do pieczenia, Słodycze, Słone przekąski, Inne";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const image: string = (body.image || "").replace(/^data:[^;]+;base64,/, "");
    const mime: string = body.mime || "image/jpeg";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "Brak GEMINI_API_KEY" }, 500);
    if (!image) return json({ items: [] }, 200);

    const prompt =
`Przeanalizuj to zdjęcie paragonu zakupowego (lub zdjęcie produktów).
Wypisz WYŁĄCZNIE produkty spożywcze i napoje.
Pomiń: chemię, środki czystości, kosmetyki, higienę, alkohol, papierosy, torby/reklamówki, opłaty, kaucje, rabaty.
Dla każdego produktu podaj:
- "name": czytelna, znormalizowana nazwa po polsku (rozwiń skróty z paragonu, popraw literówki),
- "qty": liczba sztuk/opakowań jako liczba całkowita (domyślnie 1),
- "unit": jednostka lub rozmiar jeśli widać (np. "szt", "500 g", "1 l", "op"), inaczej "szt",
- "category": dokładnie jedna z: ${CATS}.
Zwróć WYŁĄCZNIE poprawny JSON w formacie:
{"items":[{"name":"...","qty":1,"unit":"szt","category":"..."}]}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const gr = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: image } }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!gr.ok) {
      const t = await gr.text();
      return json({ error: "Gemini HTTP " + gr.status, detail: t.slice(0, 400) }, 502);
    }
    const data = await gr.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    let parsed: any;
    try { parsed = JSON.parse(text); } catch { parsed = { items: [] }; }
    if (!Array.isArray(parsed.items)) parsed = { items: [] };
    return json(parsed, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
