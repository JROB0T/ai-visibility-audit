'use client';

import { useState } from 'react';
import { Copy, Check, Download, ChevronRight, Zap, FileText, Code2, Globe, Tag, MessageSquare, CalendarDays, ExternalLink } from 'lucide-react';

interface FixPackageData {
  id: string;
  content_rewrites: Array<{ page: string; targetUrl?: string; problem: string; rewrite: string; impact: string }>;
  schema_markup: Array<{ type: string; targetUrl?: string; purpose: string; code: string }>;
  robots_txt: { currentIssue: string; fixedContent: string };
  meta_tags: Array<{ page: string; targetUrl?: string; currentTitle?: string; newTitle: string; currentDescription?: string; newDescription: string }>;
  citation_plan: Array<{ platform: string; action: string; priority: string; timeframe: string; expectedImpact?: string }>;
  auto_fix_scripts: { gtmSchemaSnippet: string; wpFunctionsSnippet: string; metaTagHtml: string };
  action_plan: Array<{ week: string; tasks: Array<{ task: string; effort: string; impact: string; details?: string }> }>;
}

interface FixPackageViewProps {
  fixPackage: FixPackageData;
  domain: string;
  overallScore: number;
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
        copied
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'
      }`}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

function SeverityDot({ level }: { level: string }) {
  const colors: Record<string, string> = { high: 'bg-red-500', medium: 'bg-amber-500', low: 'bg-blue-500' };
  return <span className={`w-2 h-2 rounded-full ${colors[level] || 'bg-gray-400'}`} />;
}

function EffortTag({ effort }: { effort: string }) {
  const styles: Record<string, string> = {
    low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-700 border-amber-200',
    high: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${styles[effort] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {effort} effort
    </span>
  );
}

function ImpactTag({ impact }: { impact: string }) {
  const styles: Record<string, string> = {
    high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-blue-50 text-blue-700 border-blue-200',
    low: 'bg-gray-50 text-gray-600 border-gray-200',
  };
  return (
    <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${styles[impact] || 'bg-gray-50 text-gray-700 border-gray-200'}`}>
      {impact} impact
    </span>
  );
}

const TABS = [
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'schema', label: 'Schema', icon: Code2 },
  { id: 'robots', label: 'Robots.txt', icon: Globe },
  { id: 'meta', label: 'Meta Tags', icon: Tag },
  { id: 'citations', label: 'Citations', icon: MessageSquare },
  { id: 'autodeploy', label: 'Auto-Deploy', icon: Zap },
  { id: 'plan', label: 'Action Plan', icon: CalendarDays },
] as const;

export default function FixPackageView({ fixPackage, domain, overallScore }: FixPackageViewProps) {
  const [activeTab, setActiveTab] = useState<string>('content');

  return (
    <div className="mt-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5" />
              <h2 className="text-lg font-bold">GEO Fix Package</h2>
            </div>
            <p className="text-blue-100 text-sm">
              Ready-to-implement fixes for {domain} · Current score: {overallScore}/100
            </p>
          </div>
          <button
            onClick={() => {
              const data = JSON.stringify(fixPackage, null, 2);
              downloadFile(data, `GEO-Fix-Package-${domain}.json`);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Download All
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-50 rounded-xl p-1 border border-gray-200 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* === CONTENT TAB === */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-2">
            Copy these AI-optimized content blocks and replace the corresponding sections on your website.
          </p>
          {fixPackage.content_rewrites.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">{item.page}</span>
                  {item.targetUrl && (
                    <a href={item.targetUrl} target="_blank" rel="noopener" className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                <CopyButton text={item.rewrite} label="Copy Content" />
              </div>
              <div className="p-5">
                <div className="mb-3">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Problem</p>
                  <p className="text-sm text-gray-600">{item.problem}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">Optimized Content</p>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {item.rewrite}
                  </div>
                </div>
                <p className="mt-3 text-xs text-indigo-600 italic">💡 {item.impact}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === SCHEMA TAB === */}
      {activeTab === 'schema' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-2">
            Paste these JSON-LD blocks into your website&apos;s &lt;head&gt; section, or use the Auto-Deploy tab to inject them automatically.
          </p>
          {fixPackage.schema_markup.map((s, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">{s.type}</span>
                <CopyButton text={s.code} label="Copy Code" />
              </div>
              <div className="p-5">
                <p className="text-sm text-gray-600 mb-3">{s.purpose}</p>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">{s.code}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === ROBOTS.TXT TAB === */}
      {activeTab === 'robots' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Fixed robots.txt</h3>
              <p className="text-xs text-gray-500 mt-0.5">{fixPackage.robots_txt.currentIssue}</p>
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={fixPackage.robots_txt.fixedContent} />
              <button
                onClick={() => downloadFile(fixPackage.robots_txt.fixedContent, 'robots.txt')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
          <div className="p-5">
            <div className="bg-gray-900 rounded-lg p-4">
              <pre className="text-sm text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">{fixPackage.robots_txt.fixedContent}</pre>
            </div>
            <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-xs font-semibold text-emerald-800 mb-1">HOW TO IMPLEMENT</p>
              <p className="text-sm text-emerald-700">
                Upload this file to your website&apos;s root directory. For WordPress: Yoast SEO → Tools → File Editor.
                For Vercel/Next.js: place in your <code className="bg-emerald-100 px-1 rounded">/public</code> folder.
                For Webflow: Settings → SEO → Robots.txt.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* === META TAGS TAB === */}
      {activeTab === 'meta' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-2">
            Replace your current title tags and meta descriptions with these AI-optimized versions.
          </p>
          {fixPackage.meta_tags.map((m, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">{m.page}</span>
                <CopyButton
                  text={`<title>${m.newTitle}</title>\n<meta name="description" content="${m.newDescription}">`}
                  label="Copy HTML"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Title Tag</p>
                  {m.currentTitle && m.currentTitle !== 'MISSING' && (
                    <p className="text-xs text-gray-400 line-through mb-1">{m.currentTitle}</p>
                  )}
                  <p className="text-sm font-semibold text-blue-700">{m.newTitle}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{m.newTitle.length} characters</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Meta Description</p>
                  {m.currentDescription && m.currentDescription !== 'MISSING' && (
                    <p className="text-xs text-gray-400 line-through mb-1">{m.currentDescription}</p>
                  )}
                  <p className="text-sm text-gray-700 leading-relaxed">{m.newDescription}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{m.newDescription.length} characters</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === CITATIONS TAB === */}
      {activeTab === 'citations' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 mb-2">
            AI systems cite brands that appear across authoritative third-party sources. Here&apos;s your platform-by-platform plan.
          </p>
          {fixPackage.citation_plan.map((c, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <SeverityDot level={c.priority} />
                  <span className="text-sm font-semibold text-gray-900">{c.platform}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${
                    c.priority === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                    c.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-gray-50 text-gray-600 border-gray-200'
                  }`}>{c.priority}</span>
                </div>
                <span className="text-xs text-gray-400">{c.timeframe}</span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{c.action}</p>
              {c.expectedImpact && (
                <p className="mt-2 text-xs text-indigo-600">Impact: {c.expectedImpact}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* === AUTO-DEPLOY TAB === */}
      {activeTab === 'autodeploy' && (
        <div className="space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-emerald-600" />
              <p className="text-sm font-semibold text-emerald-800">Automated Implementation</p>
            </div>
            <p className="text-sm text-emerald-700">
              These scripts inject your fixes automatically — no manual HTML editing needed. Choose the method that matches your tech stack.
            </p>
          </div>

          {[
            {
              label: 'Google Tag Manager',
              sublabel: 'Easiest — paste into GTM and publish',
              tag: 'Easiest',
              tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              code: fixPackage.auto_fix_scripts.gtmSchemaSnippet,
              filename: 'gtm-schema-tag.html',
              instructions: 'Create a new Custom HTML tag in GTM → paste this code → set trigger to "All Pages" → Publish.',
            },
            {
              label: 'WordPress',
              sublabel: 'Add to functions.php or use WPCode plugin',
              tag: 'Moderate',
              tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
              code: fixPackage.auto_fix_scripts.wpFunctionsSnippet,
              filename: 'wp-schema-snippet.php',
              instructions: 'Add to Appearance → Theme File Editor → functions.php, or install WPCode plugin and paste as a new snippet.',
            },
            {
              label: 'Raw HTML',
              sublabel: 'Works with any platform',
              tag: 'Universal',
              tagColor: 'bg-gray-50 text-gray-600 border-gray-200',
              code: fixPackage.auto_fix_scripts.metaTagHtml,
              filename: 'meta-tags.html',
              instructions: 'Paste into the <head> section of your HTML. Works with Squarespace, Wix, Webflow, static sites, etc.',
            },
          ].map((script) => (
            <div key={script.label} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{script.label}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${script.tagColor}`}>{script.tag}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CopyButton text={script.code} />
                  <button
                    onClick={() => downloadFile(script.code, script.filename)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-5">
                <p className="text-xs text-gray-500 mb-3">{script.instructions}</p>
                <div className="bg-gray-900 rounded-lg p-4 max-h-52 overflow-y-auto">
                  <pre className="text-xs text-gray-300 font-mono leading-relaxed whitespace-pre-wrap">{script.code}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* === ACTION PLAN TAB === */}
      {activeTab === 'plan' && (
        <div className="space-y-5">
          <p className="text-sm text-gray-500 mb-2">
            Follow this prioritized roadmap — start with Week 1 for the highest-impact, lowest-effort wins.
          </p>
          {fixPackage.action_plan.map((phase, pi) => {
            const dotColors = ['bg-red-500', 'bg-amber-500', 'bg-blue-500', 'bg-indigo-500'];
            return (
              <div key={pi} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <span className={`w-2.5 h-2.5 rounded-full ${dotColors[pi] || 'bg-gray-400'}`} />
                  <span className="text-sm font-semibold text-gray-900">{phase.week}</span>
                </div>
                <div className="p-4 space-y-2">
                  {phase.tasks.map((t, ti) => (
                    <div key={ti} className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <ChevronRight className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{t.task}</p>
                          {t.details && <p className="text-xs text-gray-500 mt-1">{t.details}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <ImpactTag impact={t.impact} />
                        <EffortTag effort={t.effort} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
