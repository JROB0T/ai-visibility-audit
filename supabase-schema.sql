-- ============================================================
-- AI Visibility Audit - Database Schema
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- Sites table
CREATE TABLE sites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sites_user_id ON sites(user_id);
CREATE INDEX idx_sites_domain ON sites(domain);

-- Audits table
CREATE TABLE audits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  overall_score INTEGER,
  crawlability_score INTEGER,
  machine_readability_score INTEGER,
  commercial_clarity_score INTEGER,
  trust_clarity_score INTEGER,
  pages_scanned INTEGER DEFAULT 0,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_audits_user_id ON audits(user_id);
CREATE INDEX idx_audits_site_id ON audits(site_id);

-- Audit pages
CREATE TABLE audit_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  page_type TEXT DEFAULT 'other',
  title TEXT,
  meta_description TEXT,
  canonical_url TEXT,
  has_schema BOOLEAN DEFAULT FALSE,
  schema_types TEXT[] DEFAULT '{}',
  h1_text TEXT,
  word_count INTEGER,
  load_time_ms INTEGER,
  status_code INTEGER,
  issues TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_pages_audit_id ON audit_pages(audit_id);

-- Audit findings
CREATE TABLE audit_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity')),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_findings_audit_id ON audit_findings(audit_id);

-- Audit recommendations
CREATE TABLE audit_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  audit_id UUID REFERENCES audits(id) ON DELETE CASCADE NOT NULL,
  finding_id UUID REFERENCES audit_findings(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('crawlability', 'machine_readability', 'commercial_clarity', 'trust_clarity')),
  severity TEXT NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  effort TEXT NOT NULL CHECK (effort IN ('easy', 'medium', 'harder')),
  title TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  recommended_fix TEXT NOT NULL,
  priority_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_recommendations_audit_id ON audit_recommendations(audit_id);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_recommendations ENABLE ROW LEVEL SECURITY;

-- Sites: users can see their own sites, anonymous audits are visible to anyone who has the audit ID
CREATE POLICY "Users can view own sites" ON sites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Anyone can create sites" ON sites FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own sites" ON sites FOR UPDATE USING (auth.uid() = user_id);

-- Audits: users see their own; anonymous audits readable by ID via API
CREATE POLICY "Users can view own audits" ON audits FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Anyone can create audits" ON audits FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update audits" ON audits FOR UPDATE USING (true);

-- Audit pages, findings, recommendations: viewable if you can see the audit
CREATE POLICY "View audit pages" ON audit_pages FOR SELECT USING (
  EXISTS (SELECT 1 FROM audits WHERE audits.id = audit_pages.audit_id AND (audits.user_id = auth.uid() OR audits.user_id IS NULL))
);
CREATE POLICY "Insert audit pages" ON audit_pages FOR INSERT WITH CHECK (true);

CREATE POLICY "View audit findings" ON audit_findings FOR SELECT USING (
  EXISTS (SELECT 1 FROM audits WHERE audits.id = audit_findings.audit_id AND (audits.user_id = auth.uid() OR audits.user_id IS NULL))
);
CREATE POLICY "Insert audit findings" ON audit_findings FOR INSERT WITH CHECK (true);

CREATE POLICY "View audit recommendations" ON audit_recommendations FOR SELECT USING (
  EXISTS (SELECT 1 FROM audits WHERE audits.id = audit_recommendations.audit_id AND (audits.user_id = auth.uid() OR audits.user_id IS NULL))
);
CREATE POLICY "Insert audit recommendations" ON audit_recommendations FOR INSERT WITH CHECK (true);
