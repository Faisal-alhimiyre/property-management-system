-- AR 3D layout snapshots linked to Walajna apartments (run in Supabase SQL editor).
BEGIN;

CREATE TABLE IF NOT EXISTS public.apartment_ar_layouts (
  id SERIAL PRIMARY KEY,
  apartment_id INTEGER NOT NULL UNIQUE REFERENCES public.apartments(id) ON DELETE CASCADE,
  building_id INTEGER REFERENCES public.buildings(id) ON DELETE SET NULL,
  owner_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  spec JSONB NOT NULL,
  focus_apartment_number TEXT,
  focus_floor_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apartment_ar_layouts_building_id_idx
  ON public.apartment_ar_layouts(building_id);

CREATE INDEX IF NOT EXISTS apartment_ar_layouts_owner_id_idx
  ON public.apartment_ar_layouts(owner_id);

COMMIT;
