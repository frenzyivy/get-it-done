-- Seed default categories + projects. Idempotent: the ON CONFLICT clauses rely
-- on the (user_id, name) unique indexes from migration 0019 so running the
-- backfill block twice produces no duplicates.
--
-- Also rewrites handle_new_user() so future signups get the same seeds.

-- 1. Backfill for every existing profile.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT id FROM public.profiles LOOP
    INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
      (p.id, 'development', '#2563eb', 0),
      (p.id, 'content',     '#db2777', 1),
      (p.id, 'outreach',    '#ea580c', 2),
      (p.id, 'admin',       '#64748b', 3),
      (p.id, 'learning',    '#0891b2', 4),
      (p.id, 'personal',    '#16a34a', 5)
    ON CONFLICT (user_id, name) DO NOTHING;

    INSERT INTO public.projects (user_id, name, color, status, sort_order) VALUES
      (p.id, 'allianza-biz',      '#7c3aed', 'active', 0),
      (p.id, 'get-it-done',       '#0d9488', 'active', 1),
      (p.id, 'komalfi',           '#be123c', 'active', 2),
      (p.id, 'theaigirlhere',     '#9333ea', 'active', 3),
      (p.id, 'zakir',             '#2563eb', 'active', 4),
      (p.id, 'gre-prep',          '#ca8a04', 'active', 5),
      (p.id, 'perfume-brand',     '#e11d48', 'active', 6),
      (p.id, 'bags-line',         '#f97316', 'active', 7),
      (p.id, 'candles-business',  '#b45309', 'active', 8)
    ON CONFLICT (user_id, name) DO NOTHING;
  END LOOP;
END $$;

-- 2. Update the new-user trigger so future signups get the same seeds plus
--    the existing tag defaults. Keeps the original EXCEPTION handler so auth
--    signup never blocks on seeding failure.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.tags (user_id, name, color, sort_order) VALUES
    (NEW.id, 'AI Agency', '#8b5cf6', 0),
    (NEW.id, 'Content',   '#f59e0b', 1),
    (NEW.id, 'GRE',       '#10b981', 2),
    (NEW.id, 'KomalFi',   '#3b82f6', 3),
    (NEW.id, 'YouTube',   '#ef4444', 4),
    (NEW.id, 'Outreach',  '#06b6d4', 5)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (user_id, name, color, sort_order) VALUES
    (NEW.id, 'development', '#2563eb', 0),
    (NEW.id, 'content',     '#db2777', 1),
    (NEW.id, 'outreach',    '#ea580c', 2),
    (NEW.id, 'admin',       '#64748b', 3),
    (NEW.id, 'learning',    '#0891b2', 4),
    (NEW.id, 'personal',    '#16a34a', 5)
  ON CONFLICT (user_id, name) DO NOTHING;

  INSERT INTO public.projects (user_id, name, color, status, sort_order) VALUES
    (NEW.id, 'allianza-biz',      '#7c3aed', 'active', 0),
    (NEW.id, 'get-it-done',       '#0d9488', 'active', 1),
    (NEW.id, 'komalfi',           '#be123c', 'active', 2),
    (NEW.id, 'theaigirlhere',     '#9333ea', 'active', 3),
    (NEW.id, 'zakir',             '#2563eb', 'active', 4),
    (NEW.id, 'gre-prep',          '#ca8a04', 'active', 5),
    (NEW.id, 'perfume-brand',     '#e11d48', 'active', 6),
    (NEW.id, 'bags-line',         '#f97316', 'active', 7),
    (NEW.id, 'candles-business',  '#b45309', 'active', 8)
  ON CONFLICT (user_id, name) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
