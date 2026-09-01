import type { ReactNode } from 'react';
import { getDb } from '@/lib/data';
import { PageHeader } from '@/components/PageHeader';
import { WorkflowMap } from '@/components/WorkflowMap';
import { BrandLogo } from '@/lib/brand-logos';
import { toolBrand } from '@/lib/workflow-tool-brands';
import { workflowsForBusiness } from '@/lib/workflow-stats';
import { isBusinessFilter, resolveBusinessFilter, type BusinessFilter } from '@/lib/business-filter';
import { readBusinessFilterCookie } from '@/lib/business-filter-server';

export const dynamic = 'force-dynamic';

export default async function WorkflowsPage(props: { searchParams?: Promise<{ business?: string }> }) {
  const searchParams = await props.searchParams;
  // The business lens (same mechanism as /org and /funnel): a `?business=`
  // link overrides the global cookie for direct linking; otherwise the
  // Topbar's current selection applies. A workflow tagged 'shared' always
  // shows, regardless of which business is selected — 'all' (combined)
  // shows every workflow, same as before this fix (workflowsForBusiness,
  // lib/workflow-stats.ts).
  const businessParam = searchParams?.business;
  const filter: BusinessFilter = isBusinessFilter(businessParam)
    ? businessParam
    : resolveBusinessFilter(await readBusinessFilterCookie());
  const allWorkflows = getDb().workflows.all();
  const workflows = workflowsForBusiness(allWorkflows, filter);
  // Render the company logos here, server-side: BrandLogo pulls simple-icons,
  // which must never enter the client bundle. The map receives ready-made nodes.
  const toolIds = new Set(workflows.flatMap((w) => w.steps.flatMap((s) => s.tools)));
  const toolLogos: Record<string, ReactNode> = {};
  for (const id of toolIds) {
    const b = toolBrand(id);
    toolLogos[id] = <BrandLogo slug={b.slug} name={b.name} size={14} />;
  }
  return (
    <div>
      <PageHeader eyebrow="process map" title="Workflows" />
      <WorkflowMap
        workflows={workflows}
        toolLogos={toolLogos}
        hiddenByBusinessFilter={allWorkflows.length - workflows.length}
      />
    </div>
  );
}
