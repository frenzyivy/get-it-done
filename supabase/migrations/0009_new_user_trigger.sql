-- PLAN.md § 3 — On first sign-up, create profile row + seed default tags.
-- Implemented as a trigger on auth.users so it runs atomically regardless of
-- signup path (email/password or Google OAuth). Seed list is PLAN.md § 2.2.

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
    (NEW.id, 'Outreach',  '#06b6d4', 5);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth signup on seeding failure. Error goes to Postgres logs.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
