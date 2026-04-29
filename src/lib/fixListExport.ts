// ============================================================
// Markdown export for the operational fix list.
//
// Pure function — takes the list, returns a string. Suitable for
// emailing to a developer, pasting into Slack, etc.
// ============================================================

import type { UnifiedFixItem } from '@/app/api/audit/[id]/fix-list/route';

interface ExportOptions {
  includeStatus?: boolean;
  includeSkipped?: boolean;
  includeDone?: boolean;
  business?: { name?: string; domain?: string };
  generatedAt?: string;
}

export function exportFixListAsMarkdown(
  items: UnifiedFixItem[],
  opts: ExportOptions = {},
): string {
  const lines: string[] = [];

  lines.push('# Fix List');
  if (opts.business?.name || opts.business?.domain) {
    lines.push(`**${opts.business.name || opts.business.domain}**`);
  }
  if (opts.generatedAt) {
    lines.push(`*Generated ${new Date(opts.generatedAt).toLocaleDateString()}*`);
  }
  lines.push('');

  const visible = items.filter((i) => {
    if (i.status === 'open') return true;
    if (i.status === 'done') return opts.includeDone === true;
    if (i.status === 'skipped') return opts.includeSkipped === true;
    return false;
  });

  if (visible.length === 0) {
    lines.push('_No open items. Nothing to do!_');
    return lines.join('\n');
  }

  // Group by owner_type for cleaner handoffs
  const byOwner = new Map<string, UnifiedFixItem[]>();
  for (const item of visible) {
    const key = ownerLabel(item.owner_type);
    const arr = byOwner.get(key) || [];
    arr.push(item);
    byOwner.set(key, arr);
  }

  Array.from(byOwner.entries()).forEach(([owner, ownerItems]) => {
    lines.push(`## For the ${owner}`);
    lines.push('');
    ownerItems.forEach((item, i) => {
      const statusBadge = opts.includeStatus ? ` _(${item.status})_` : '';
      lines.push(`### ${i + 1}. ${item.title}${statusBadge}`);
      lines.push('');
      const meta = [
        `**Priority:** ${cap(item.priority)}`,
        item.effort ? `**Effort:** ${cap(item.effort)}` : null,
        item.impact ? `**Impact:** ${cap(item.impact)}` : null,
      ].filter(Boolean).join('  ·  ');
      lines.push(meta);
      lines.push('');
      if (item.why_it_matters) {
        lines.push(`**Why it matters:** ${item.why_it_matters}`);
        lines.push('');
      }
      if (item.description) {
        lines.push(`**What to do:**`);
        lines.push('');
        lines.push(item.description);
        lines.push('');
      }
      if (item.affected_urls.length > 0) {
        lines.push(`**Affected pages:**`);
        for (const url of item.affected_urls.slice(0, 10)) {
          lines.push(`- ${url}`);
        }
        if (item.affected_urls.length > 10) {
          lines.push(`- …and ${item.affected_urls.length - 10} more`);
        }
        lines.push('');
      }
      if (item.code_snippet) {
        lines.push('**Code:**');
        lines.push('');
        lines.push('```');
        lines.push(item.code_snippet);
        lines.push('```');
        lines.push('');
      }
      if (item.notes) {
        lines.push(`*Notes: ${item.notes}*`);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    });
  });

  return lines.join('\n');
}

function ownerLabel(o: string): string {
  if (o === 'developer') return 'Developer';
  if (o === 'marketer') return 'Marketer';
  return 'Business Owner';
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
