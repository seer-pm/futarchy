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

const panelClass = 'border border-futarchyGray6 dark:border-futarchyGray7 bg-white dark:bg-futarchyGray2 rounded-lg';
const inputClass = 'w-full px-3 py-2 bg-futarchyGray2 dark:bg-futarchyGray3 border border-futarchyGray6 dark:border-futarchyGray7 rounded-md text-sm text-futarchyGray12 dark:text-white focus:outline-none focus:ring-2 focus:ring-futarchyBlue9';
const labelClass = 'text-xs font-semibold uppercase tracking-wide text-futarchyGray10 dark:text-futarchyGray11';

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
    <ol className="divide-y divide-futarchyGray5 dark:divide-futarchyGray7">
      {stages.map((stage) => (
        <li key={stage.id} className="grid gap-2 md:grid-cols-[48px_220px_1fr] px-4 py-3">
          <div className="text-sm font-semibold text-futarchyBlue9">{String(stage.order).padStart(2, '0')}</div>
          <div>
            <div className="text-sm font-semibold text-futarchyGray12 dark:text-white">{stage.title}</div>
            {stage.dependsOn?.length ? (
              <div className="mt-1 text-xs text-futarchyGray10">After: {stage.dependsOn.join(', ')}</div>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-futarchyGray11 dark:text-futarchyGray11">{stage.summary}</p>
            {stage.requiredEvidence?.length ? (
              <p className="mt-1 text-xs text-futarchyGray9">
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
    <ol className="divide-y divide-futarchyGray5 dark:divide-futarchyGray7">
      {actions.map((action) => (
        <li key={action.id} className="grid gap-2 px-4 py-3 md:grid-cols-[48px_270px_1fr]">
          <div className="text-sm font-semibold text-futarchyBlue9">{String(action.order).padStart(2, '0')}</div>
          <div>
            <div className="break-words font-mono text-xs font-semibold text-futarchyGray12 dark:text-white">
              {action.contract}.{action.method}
            </div>
            <div className="mt-1 text-xs uppercase text-futarchyGray9">Stage: {action.stageId}</div>
            {action.dependsOn?.length ? (
              <div className="mt-1 break-words text-xs text-futarchyGray10">After: {action.dependsOn.join(', ')}</div>
            ) : null}
          </div>
          <div>
            <p className="text-sm text-futarchyGray11 dark:text-futarchyGray11">{action.summary}</p>
            {action.produces?.length ? (
              <p className="mt-1 text-xs text-futarchyGray9">Produces: {action.produces.join(', ')}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function MetadataPreview({ metadata }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-md bg-futarchyGray2 dark:bg-futarchyDarkGray3 border border-futarchyGray6 dark:border-futarchyGray7 p-4 text-xs text-futarchyGray12 dark:text-futarchyGray11">
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
    <RootLayout headerConfig="app" footerConfig="main">
      <PageLayout contentClassName="max-w-7xl">
        <div className="py-8">
          <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-futarchyGray12 dark:text-white">Create Market</h1>
              <p className="mt-2 max-w-3xl text-sm text-futarchyGray11 dark:text-futarchyGray11">
                A single operational flow for organization setup, proposal metadata, market creation,
                liquidity manager setup, Snapshot linking, candle readiness, arbitrage setup, and publishing.
              </p>
            </div>
            <Link
              href="/companies"
              className="inline-flex h-10 items-center justify-center rounded-md border border-futarchyGray6 px-4 text-sm font-medium text-futarchyGray12 dark:border-futarchyGray7 dark:text-white"
            >
              Companies
            </Link>
          </div>

          {permissionlessPlan && (
            <section className={`${panelClass} mb-6`}>
              <div className="border-b border-futarchyGray6 px-4 py-3 dark:border-futarchyGray7">
                <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">Permissionless Chiado Stack</h2>
                <p className="mt-1 text-sm text-futarchyGray11">
                  This is the target testnet lifecycle: any wallet creates an organization, it is listed
                  automatically, and the organization receives a default liquidity manager for proposal liquidity.
                </p>
              </div>
              <StageList stages={permissionlessPlan.stages} />
              <div className="border-t border-futarchyGray6 px-4 py-3 dark:border-futarchyGray7">
                <h3 className="text-sm font-semibold text-futarchyGray12 dark:text-white">Contract Actions</h3>
              </div>
              <ActionList actions={permissionlessPlan.contractActions} />
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <section className={`${panelClass} p-4`}>
              <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">Market Defaults</h2>

              <div className="mt-5 space-y-4">
                <div>
                  <label className={labelClass} htmlFor="organization">Organization</label>
                  <select
                    id="organization"
                    className={`${inputClass} mt-1`}
                    value={organizationId}
                    onChange={(event) => updateOrganization(event.target.value)}
                  >
                    {Object.values(KNOWN_ORGANIZATIONS).map((org) => (
                      <option key={org.id} value={org.id}>{org.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass} htmlFor="proposalCode">Proposal Code</label>
                  <input
                    id="proposalCode"
                    className={`${inputClass} mt-1`}
                    placeholder={`${selectedOrganization.proposalPrefix}-123`}
                    value={form.proposalCode}
                    onChange={(event) => updateField('proposalCode', event.target.value)}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="displayTitle0">Display Title</label>
                  <input
                    id="displayTitle0"
                    className={`${inputClass} mt-1`}
                    placeholder={`What will the impact on ${selectedOrganization.companyToken.symbol} price be`}
                    value={form.displayTitle0}
                    onChange={(event) => updateField('displayTitle0', event.target.value)}
                  />
                  <input
                    aria-label="Display title event"
                    className={`${inputClass} mt-2`}
                    placeholder="if the proposal is passed?"
                    value={form.displayTitle1}
                    onChange={(event) => updateField('displayTitle1', event.target.value)}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="question">Resolution Question</label>
                  <textarea
                    id="question"
                    className={`${inputClass} mt-1 min-h-[88px]`}
                    placeholder={`Will the proposal be passed by ${selectedOrganization.name}?`}
                    value={form.question}
                    onChange={(event) => updateField('question', event.target.value)}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="snapshotId">Snapshot Proposal Hash</label>
                  <input
                    id="snapshotId"
                    className={`${inputClass} mt-1 font-mono`}
                    placeholder="0x..."
                    value={form.snapshotId}
                    onChange={(event) => updateField('snapshotId', event.target.value)}
                  />
                </div>

                <div>
                  <label className={labelClass} htmlFor="closeDate">Vote Close Time</label>
                  <input
                    id="closeDate"
                    type="datetime-local"
                    className={`${inputClass} mt-1`}
                    value={form.closeDateTimeLocal}
                    onChange={(event) => updateCloseDate(event.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className={labelClass}>Company Token</div>
                    <div className="mt-1 rounded-md border border-futarchyGray6 p-3 text-sm dark:border-futarchyGray7">
                      <div className="font-semibold text-futarchyGray12 dark:text-white">{selectedOrganization.companyToken.symbol}</div>
                      <div className="mt-1 break-all font-mono text-xs text-futarchyGray10">{selectedOrganization.companyToken.address}</div>
                    </div>
                  </div>
                  <div>
                    <div className={labelClass}>Currency Token</div>
                    <div className="mt-1 rounded-md border border-futarchyGray6 p-3 text-sm dark:border-futarchyGray7">
                      <div className="font-semibold text-futarchyGray12 dark:text-white">{selectedOrganization.currencyToken.symbol}</div>
                      <div className="mt-1 break-all font-mono text-xs text-futarchyGray10">{selectedOrganization.currencyToken.address}</div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${panelClass}`}>
              <div className="border-b border-futarchyGray6 px-4 py-3 dark:border-futarchyGray7">
                <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">One-Step Execution Plan</h2>
                <div className="mt-2 grid gap-2 text-xs text-futarchyGray10 md:grid-cols-3">
                  <span>Org: {marketPlan.values.organizationName}</span>
                  <span>Close: {formatDate(marketPlan.values.closeTimestamp)}</span>
                  <span>Liquidity: {formatLiquidityMode(marketPlan.values.initialLiquidityMode)}</span>
                </div>
              </div>
              <StageList stages={marketPlan.stages} />
              <div className="border-t border-futarchyGray6 px-4 py-3 dark:border-futarchyGray7">
                <h3 className="text-sm font-semibold text-futarchyGray12 dark:text-white">Contract Actions</h3>
              </div>
              <ActionList actions={marketPlan.contractActions} />
            </section>
          </div>

          <section className={`${panelClass} mt-6 p-4`}>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-futarchyGray12 dark:text-white">Generated Metadata Draft</h2>
                <p className="mt-1 text-sm text-futarchyGray11">
                  This is the registry metadata shape the one-step flow will pass into the market
                  creation and proposal metadata writes.
                </p>
              </div>
              <Link
                href={`/milestones?company_id=${selectedOrganization.organizationAddress}`}
                className="inline-flex h-9 items-center justify-center rounded-md border border-futarchyGray6 px-3 text-sm text-futarchyGray12 dark:border-futarchyGray7 dark:text-white"
              >
                Open organization
              </Link>
            </div>
            <MetadataPreview metadata={marketPlan.metadataDraft} />
          </section>
        </div>
      </PageLayout>
    </RootLayout>
  );
}
