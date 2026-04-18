-- ============================================
-- EVIDENCIJA RADNIKA — Supabase SQL Schema
-- Pokreni ovo u Supabase SQL editoru
-- ============================================

-- Tablica radnici
CREATE TABLE IF NOT EXISTS radnici (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  ime TEXT NOT NULL,
  role TEXT DEFAULT 'radnik' CHECK (role IN ('admin', 'radnik')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tablica javljanja (dolasci)
CREATE TABLE IF NOT EXISTS javljanja (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  radnik_id UUID REFERENCES radnici(id) ON DELETE CASCADE,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL CHECK (status IN ('dosao', 'bolovanje')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(radnik_id, datum)
);

-- Tablica doznaka
CREATE TABLE IF NOT EXISTS doznake (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  radnik_id UUID REFERENCES radnici(id) ON DELETE CASCADE,
  javljanje_id UUID REFERENCES javljanja(id) ON DELETE SET NULL,
  naziv_datoteke TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  datum DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index za brže pretrage po datumu
CREATE INDEX IF NOT EXISTS idx_javljanja_datum ON javljanja(datum);
CREATE INDEX IF NOT EXISTS idx_javljanja_radnik ON javljanja(radnik_id);
CREATE INDEX IF NOT EXISTS idx_doznake_radnik ON doznake(radnik_id);
CREATE INDEX IF NOT EXISTS idx_doznake_datum ON doznake(datum);

-- RLS (Row Level Security) — isključi jer koristimo service key s backenda
ALTER TABLE radnici DISABLE ROW LEVEL SECURITY;
ALTER TABLE javljanja DISABLE ROW LEVEL SECURITY;
ALTER TABLE doznake DISABLE ROW LEVEL SECURITY;

-- Kreiraj storage bucket za doznake
-- (Ovo napravi ručno u Supabase Dashboard > Storage > New bucket)
-- Bucket name: doznake
-- Public: DA (ili NE ako želiš private URLs)

-- ============================================
-- INICIJALNI ADMIN KORISNIK
-- Lozinka: admin123 (PROMIJENI odmah!)
-- bcrypt hash za "admin123":
-- ============================================
INSERT INTO radnici (username, password_hash, ime, role)
VALUES (
  'admin',
  '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lHHi',
  'Administrator',
  'admin'
) ON CONFLICT (username) DO NOTHING;

-- Primjer radnika (obriši ili prilagodi)
-- INSERT INTO radnici (username, password_hash, ime, role)
-- VALUES ('ivan.horvat', '$2a$10$...', 'Ivan Horvat', 'radnik');
