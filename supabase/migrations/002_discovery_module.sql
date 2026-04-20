-- ============================================================
-- AI Discovery Prompt Testing module
-- 7 tables + indexes + RLS policies
-- ============================================================

-- 1. discovery_profiles — one row per site
CREATE TABLE IF NOT EXISTS discovery_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL UNIQUE REFERENCES sites(id) ON DELETE CASCADE,
  business_name text,
  domain text,
  primary_category text,
  service_area text,
  description text,
  core_services jsonb DEFAULT '[]'::jsonb,
  secondary_services jsonb DEFAULT '[]'::jsonb,
  target_customers jsonb DEFAULT '[]'::jsonb,
  business_model text CHECK (business_model IN ('local_service','ecommerce','professional_services','hybrid','other')),
  priority_service_lines jsonb DEFAULT '[]'::jsonb,
  high_margin_services jsonb DEFAULT '[]'::jsonb,
  branded_terms jsonb DEFAULT '[]'::jsonb,
  cluster_weights jsonb DEFAULT '{"core":0.30,"problem":0.20,"comparison":0.20,"long_tail":0.15,"brand":0.10,"adjacent":0.05}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. discovery_prompts
CREATE TABLE IF NOT EXISTS discovery_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  prompt_text text NOT NULL,
  cluster text NOT NULL CHECK (cluster IN ('core','problem','comparison','long_tail','brand','adjacent')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high','medium','low')),
  service_line_tag text,
  importance_tag text,
  active boolean NOT NULL DEFAULT true,
  last_tested_at timestamptz,
  notes text,
  source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated','custom','edited')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3. discovery_competitors
CREATE TABLE IF NOT EXISTS discovery_competitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text,
  location text,
  category text,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','inferred','growth_strategy')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. discovery_results — one row per prompt per test run
CREATE TABLE IF NOT EXISTS discovery_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  prompt_id uuid REFERENCES discovery_prompts(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  prompt_text text NOT NULL,
  prompt_cluster text,
  test_date timestamptz NOT NULL DEFAULT now(),
  test_surface text NOT NULL DEFAULT 'claude_haiku_web',
  business_mentioned boolean NOT NULL DEFAULT false,
  business_cited boolean NOT NULL DEFAULT false,
  business_domain_detected boolean NOT NULL DEFAULT false,
  business_page_detected text,
  business_position_type text CHECK (business_position_type IN ('directly_recommended','listed_among_options','cited_as_source','mentioned_without_preference','implied_only','not_present')),
  competitor_mentioned boolean NOT NULL DEFAULT false,
  competitor_names_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  competitor_domains_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  directories_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  marketplaces_detected jsonb NOT NULL DEFAULT '[]'::jsonb,
  result_type_summary text,
  visibility_status text CHECK (visibility_status IN ('strong_presence','partial_presence','indirect_presence','absent','competitor_dominant','directory_dominant','unclear')),
  prompt_score int CHECK (prompt_score BETWEEN 0 AND 100),
  confidence_score numeric(3,2),
  normalized_response_summary text,
  raw_response_excerpt text,
  recommendation_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed boolean NOT NULL DEFAULT false,
  suppressed boolean NOT NULL DEFAULT false,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. discovery_insights
CREATE TABLE IF NOT EXISTS discovery_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id uuid,
  category text NOT NULL CHECK (category IN ('wins','gaps','competitor_advantages','content_issues','opportunities')),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('high','medium','low')),
  linked_cluster text,
  linked_competitor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. discovery_recommendations
CREATE TABLE IF NOT EXISTS discovery_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id uuid,
  title text NOT NULL,
  description text,
  why_it_matters text,
  category text,
  priority text CHECK (priority IN ('high','medium','low')),
  owner_type text CHECK (owner_type IN ('developer','marketer','business_owner')),
  impact_estimate text CHECK (impact_estimate IN ('high','medium','low')),
  difficulty_estimate text CHECK (difficulty_estimate IN ('high','medium','low')),
  suggested_timeline text,
  linked_prompt_clusters jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_competitor_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  edited_by_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. discovery_score_snapshots — for trend tracking
CREATE TABLE IF NOT EXISTS discovery_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  run_id uuid NOT NULL,
  overall_score int,
  cluster_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_count int NOT NULL DEFAULT 0,
  strong_count int NOT NULL DEFAULT 0,
  partial_count int NOT NULL DEFAULT 0,
  absent_count int NOT NULL DEFAULT 0,
  competitor_dominant_count int NOT NULL DEFAULT 0,
  snapshot_date timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_discovery_profiles_site_id ON discovery_profiles(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_prompts_site_id ON discovery_prompts(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_competitors_site_id ON discovery_competitors(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_results_site_id ON discovery_results(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_results_run_id ON discovery_results(run_id);
CREATE INDEX IF NOT EXISTS idx_discovery_insights_site_id ON discovery_insights(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_recommendations_site_id ON discovery_recommendations(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_score_snapshots_site_id ON discovery_score_snapshots(site_id);
CREATE INDEX IF NOT EXISTS idx_discovery_score_snapshots_site_date ON discovery_score_snapshots(site_id, snapshot_date DESC);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_score_snapshots ENABLE ROW LEVEL SECURITY;

-- discovery_profiles policies
CREATE POLICY "Select discovery_profiles" ON discovery_profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_profiles.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_profiles" ON discovery_profiles FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_profiles.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_profiles" ON discovery_profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_profiles.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_profiles" ON discovery_profiles FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_profiles.site_id AND sites.user_id = auth.uid())
);

-- discovery_prompts policies
CREATE POLICY "Select discovery_prompts" ON discovery_prompts FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_prompts.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_prompts" ON discovery_prompts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_prompts.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_prompts" ON discovery_prompts FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_prompts.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_prompts" ON discovery_prompts FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_prompts.site_id AND sites.user_id = auth.uid())
);

-- discovery_competitors policies
CREATE POLICY "Select discovery_competitors" ON discovery_competitors FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_competitors.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_competitors" ON discovery_competitors FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_competitors.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_competitors" ON discovery_competitors FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_competitors.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_competitors" ON discovery_competitors FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_competitors.site_id AND sites.user_id = auth.uid())
);

-- discovery_results policies
CREATE POLICY "Select discovery_results" ON discovery_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_results.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_results" ON discovery_results FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_results.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_results" ON discovery_results FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_results.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_results" ON discovery_results FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_results.site_id AND sites.user_id = auth.uid())
);

-- discovery_insights policies
CREATE POLICY "Select discovery_insights" ON discovery_insights FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_insights.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_insights" ON discovery_insights FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_insights.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_insights" ON discovery_insights FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_insights.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_insights" ON discovery_insights FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_insights.site_id AND sites.user_id = auth.uid())
);

-- discovery_recommendations policies
CREATE POLICY "Select discovery_recommendations" ON discovery_recommendations FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_recommendations.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_recommendations" ON discovery_recommendations FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_recommendations.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_recommendations" ON discovery_recommendations FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_recommendations.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_recommendations" ON discovery_recommendations FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_recommendations.site_id AND sites.user_id = auth.uid())
);

-- discovery_score_snapshots policies
CREATE POLICY "Select discovery_score_snapshots" ON discovery_score_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_score_snapshots.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Insert discovery_score_snapshots" ON discovery_score_snapshots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_score_snapshots.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Update discovery_score_snapshots" ON discovery_score_snapshots FOR UPDATE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_score_snapshots.site_id AND sites.user_id = auth.uid())
);
CREATE POLICY "Delete discovery_score_snapshots" ON discovery_score_snapshots FOR DELETE USING (
  EXISTS (SELECT 1 FROM sites WHERE sites.id = discovery_score_snapshots.site_id AND sites.user_id = auth.uid())
);
