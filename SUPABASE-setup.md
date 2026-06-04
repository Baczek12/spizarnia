# Konfiguracja Supabase dla Spiżarni

## 1. Załóż projekt
1. Wejdź na https://supabase.com → zaloguj się → **New project** (plan darmowy).
2. Nazwa dowolna, ustaw hasło do bazy (zapisz je), region: najlepiej Frankfurt (eu-central).
3. Poczekaj ~1-2 min, aż projekt się utworzy.

## 2. Utwórz tabelę (SQL)
W panelu Supabase: lewe menu → **SQL Editor** → **New query** → wklej poniższe i kliknij **Run**:

```sql
-- Tabela przechowująca cały stan spiżarni jako JSON
create table if not exists pantry (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Włącz Row Level Security
alter table pantry enable row level security;

-- Polityka: pełny dostęp dla klucza anon (apka bez logowania)
-- Uwaga: każdy, kto zna URL + klucz anon, może czytać/zapisywać.
-- Dla prywatnej spiżarni to akceptowalne, dane nie są wrażliwe.
create policy "pantry public access"
  on pantry for all
  using (true) with check (true);

-- Włącz aktualizacje na żywo (realtime) dla tej tabeli
alter publication supabase_realtime add table pantry;
```

## 3. Skopiuj klucze
Lewe menu → **Project Settings** (ikona koła zębatego) → **API**:
- **Project URL** — np. `https://abcdxyz.supabase.co`
- **anon public** — długi klucz (zaczyna się od `eyJ...`)

Przekaż te dwie wartości — wstawię je do `spizarnia.html` (sekcja `KONFIGURACJA SUPABASE`)
i wrzucę całość na GitHub Pages.

## Jak to działa
- Cały stan spiżarni zapisywany jest jako jeden wiersz `id = 'default'`, kolumna `data` (JSON).
- Przy każdej zmianie apka nadpisuje ten wiersz (debounce 0,6 s).
- `localStorage` działa jako cache offline — apka działa bez internetu, a po połączeniu dosynchronizuje.
- Realtime: zmiana na jednym urządzeniu pojawia się na drugim automatycznie.
- Konflikt rozwiązywany po czasie (`updated_at`) — nowszy zapis wygrywa.
