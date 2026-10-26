import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  buildOneStepMarketPlan,
  buildPermissionlessStackPlan,
  createMarketWizardDefaults,
  KNOWN_ORGANIZATIONS,
} from '../../../features/marketCreation/marketCreationWorkflow';
import RootLayout from '../../layout/RootLayout';
import PageLayout from '../../layout/PageLayout';
import Button from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Surface, SurfaceHeader } from '../../ui/Surface';

// The permissionless Chiado stack is not deployed yet; only show its plan
// when debugging.
const SHOW_PERMISSIONLESS_STACK = process.env.NEXT_PUBLIC_DEBUG_MODE?.toLowerCase() === 'true';

// Start with the proposal fields blank instead of the workflow's sample
// proposal (e.g. KIP-90), which may already be resolved.
function emptyProposalForm(organizationId) {
  return {
    ...createMarketWizardDefaults({ organizationId }),
    proposalNumber: '',
    proposalCode: '',
    displayTitle0: '',
    displayTitle1: '',
    question: '',
    description: '',
  };
}

function formatDate(timestamp) {
  if (!timestamp) return 'Not set';
  return new Date(Number(timestamp) * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatLiquidityMode(mode) {
  return mode === 'flm' ? 'Liquidity manager' : String(mode || '').toUpperCase();
}

function StageList({ stages }) {
  return (
    <ol className="divide-y divide-seer-border">
      {stages.map((stage) => (
        <li key={stage.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3 md:grid-cols-[48px_220px_minmax(0,1fr)]">
          <div className="text-sm font-semibold tabular-nums text-seer-accent-text">{String(stage.order).padStart(2, '0')}</div>
          <div>
            <div className="text-sm font-semibold text-seer-text">{stage.title}</div>
            {stage.dependsOn?.length ? (
              <div className="mt-1 text-xs text-seer-muted">After: {stage.dependsOn.join(', ')}</div>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-seer-muted">{stage.summary}</p>
            {stage.requiredEvidence?.length ? (
              <p className="mt-1 text-xs text-seer-muted">
                Evidence: {stage.requiredEvidence.join(', ')}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function ActionList({ actions }) {
  return (
    <ol className="divide-y divide-seer-border">
      {actions.map((action) => (
        <li key={action.id} className="grid grid-cols-[minmax(0,1fr)] gap-2 px-4 py-3 md:grid-cols-[48px_270px_minmax(0,1fr)]">
          <div className="text-sm font-semibold tabular-nums text-seer-accent-text">{String(action.order).padStart(2, '0')}</div>
          <div>
            <div className="font-mono text-xs font-semibold text-seer-text [overflow-wrap:anywhere]">
              {action.contract}.{action.method}
            </div>
            <div className="mt-1 text-xs text-seer-muted">Stage: {action.stageId}</div>
            {action.dependsOn?.length ? (
              <div className="mt-1 break-words text-xs text-seer-muted">After: {action.dependsOn.join(', ')}</div>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-seer-muted">{action.summary}</p>
            {action.produces?.length ? (
              <p className="mt-1 text-xs text-seer-muted">Produces: {action.produces.join(', ')}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MetadataPreview({ metadata }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-surface bg-seer-surface-raised border border-seer-border p-4 text-xs text-seer-text">
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

export default function CreateMarketFlow() {
  const [organizationId, setOrganizationId] = useState('kleros');
  const [form, setForm] = useState(() => emptyProposalForm(organizationId));

  const selectedOrganization = KNOWN_ORGANIZATIONS[organizationId];
  const marketPlan = useMemo(() => buildOneStepMarketPlan({ ...form, organizationId }), [form, organizationId]);
  const permissionlessPlan = useMemo(
    () => (SHOW_PERMISSIONLESS_STACK ? buildPermissionlessStackPlan() : null),
    []
  );

  const updateOrganization = (nextOrganizationId) => {
    setOrganizationId(nextOrganizationId);
    setForm(emptyProposalForm(nextOrganizationId));
  };

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const updateCloseDate = (value) => {
    const nextTimestamp = Math.floor(new Date(value).getTime() / 1000);
    setForm((previous) => ({
      ...previous,
      closeDateTimeLocal: value,
      closeTimestamp: nextTimestamp,
      twapStartTimestamp: nextTimestamp - (48 * 60 * 60),
      startCandleUnix: nextTimestamp - (49 * 60 * 60),
    }));
  };

  return (
    <RootLayout>
      <PageLayout contentClassName="max-w-7xl">
        <div className="py-8">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-seer-text">Create Market</h1>
              <p className="mt-2 max-w-3xl text-sm text-seer-muted">
                A single operational flow for organization setup, proposal metadata, market creation,
                liquidity manager setup, Snapshot linking, candle readiness, arbitrage setup, and publishing.
              </p>
            </div>
            <Button as={Link} href="/companies" variant="outline">
              Companies
            </Button>
          </div>

          {permissionlessPlan && (
            <Surface className="mb-6">
              <div className="border-b border-seer-border px-4 py-3">
                <h2 className="text-base font-semibold text-seer-text">Permissionless Chiado Stack</h2>
                <p className="mt-1 text-sm text-seer-muted">
                  This is the target testnet lifecycle: any wallet creates an organization, it is listed
                  automatically, and the organization receives a default liquidity manager for proposal liquidity.
                </p>
              </div>
              <StageList stages={permissionlessPlan.stages} />
              <SurfaceHeader as="h3" title="Contract Actions" className="border-t" />
              <ActionList actions={permissionlessPlan.contractActions} />
            </Surface>
          )}

          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
            <Surface className="min-w-0">
              <SurfaceHeader title="Market Defaults" />

              <div className="space-y-4 p-4">
                <Field label="Organization">
                  <select
                    id="organization"
                    className="seer-input"
                    value={organizationId}
                    onChange={(event) => updateOrganization(event.target.value)}
                  >
                    {Object.values(KNOWN_ORGANIZATIONS).map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Proposal code">
                  <Input
                    id="proposalCode"
                    placeholder={`${selectedOrganization.proposalPrefix}-123`}
                    value={form.proposalCode}
                    onChange={(event) => updateField('proposalCode', event.target.value)}
                  />
                </Field>

                <Field label="Display title">
                  <Input
                    id="displayTitle0"
                    placeholder={`What will the impact on ${selectedOrganization.companyToken.symbol} price be`}
                    value={form.displayTitle0}
                    onChange={(event) => updateField('displayTitle0', event.target.value)}
                  />
                  <Input
                    aria-label="Display title event"
                    placeholder="if the proposal is passed?"
                    value={form.displayTitle1}
                    onChange={(event) => updateField('displayTitle1', event.target.value)}
                  />
                </Field>

                <Field label="Resolution question">
                  <textarea
                    id="question"
                    className="seer-input min-h-[88px]"
                    placeholder={`Will the proposal be passed by ${selectedOrganization.name}?`}
                    value={form.question}
                    onChange={(event) => updateField('question', event.target.value)}
                  />
                </Field>

                <Field label="Snapshot proposal hash">
                  <Input
                    id="snapshotId"
                    className="font-mono"
                    placeholder="0x..."
                    value={form.snapshotId}
                    onChange={(event) => updateField('snapshotId', event.target.value)}
                  />
                </Field>

                <Field label="Vote close time">
                  <Input
                    id="closeDate"
                    type="datetime-local"
                    value={form.closeDateTimeLocal}
                    onChange={(event) => updateCloseDate(event.target.value)}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <div className="seer-label">Company token</div>
                    <div className="mt-1.5 rounded-surface border border-seer-border bg-seer-surface-raised p-3 text-sm">
                      <div className="font-semibold text-seer-text">{selectedOrganization.companyToken.symbol}</div>
                      <div className="mt-1 break-all font-mono text-xs text-seer-muted">{selectedOrganization.companyToken.address}</div>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="seer-label">Currency token</div>
                    <div className="mt-1.5 rounded-surface border border-seer-border bg-seer-surface-raised p-3 text-sm">
                      <div className="font-semibold text-seer-text">{selectedOrganization.currencyToken.symbol}</div>
                      <div className="mt-1 break-all font-mono text-xs text-seer-muted">{selectedOrganization.currencyToken.address}</div>
                    </div>
                  </div>
                </div>
              </div>
            </Surface>

            <Surface className="min-w-0">
              <div className="border-b border-seer-border px-4 py-3">
                <h2 className="text-base font-semibold text-seer-text">One-Step Execution Plan</h2>
                <div className="mt-2 grid gap-2 text-xs text-seer-muted md:grid-cols-3">
                  <span>Org: {marketPlan.values.organizationName}</span>
                  <span className="tabular-nums">Close: {formatDate(marketPlan.values.closeTimestamp)}</span>
                  <span>Liquidity: {formatLiquidityMode(marketPlan.values.initialLiquidityMode)}</span>
                </div>
              </div>
              <StageList stages={marketPlan.stages} />
              <SurfaceHeader as="h3" title="Contract Actions" className="border-t" />
              <ActionList actions={marketPlan.contractActions} />
            </Surface>
          </div>

          <Surface className="mt-6 p-4">
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-seer-text">Generated Metadata Draft</h2>
                <p className="mt-1 text-sm text-seer-muted">
                  This is the registry metadata shape the one-step flow will pass into the market
                  creation and proposal metadata writes.
                </p>
              </div>
              <Button
                as={Link}
                href={`/milestones?company_id=${selectedOrganization.organizationAddress}`}
                variant="outline"
                size="sm"
              >
                Open organization
              </Button>
            </div>
            <MetadataPreview metadata={marketPlan.metadataDraft} />
          </Surface>
        </div>
      </PageLayout>
    </RootLayout>
  );
}
