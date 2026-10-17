// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';

import { BillingViewToggle } from './site-controls';
import { DescriptionList, DescriptionListEntry, Panel } from './medplum-ui';
import { PriceTag } from './price-tag';
import { defaultDomainCatalog, domainStatusLabels, normalizeDomainQuery } from '../lib/domain-lookup';
import type { DomainMode, DomainSearchResult } from '../lib/domain-lookup';
import { getPricingPlan, getProductHref, getProductsBySlugs, paasDeploymentLabels } from '../lib/product-catalog';
import type { OfferingTrack, PaaSDeploymentModel, PlanTier, PricingPlanOffer } from '../lib/product-catalog';

interface LegacySource {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly summary: string;
  readonly migrationChecklist: string;
  readonly erpnextServiceItem: string;
  readonly recommendedTrack: OfferingTrack;
  readonly recommendedTier: PlanTier;
  readonly recommendedDeployment: PaaSDeploymentModel;
  readonly productSlugs: readonly string[];
}

interface LookupResponse {
  readonly status: 'ok' | 'error';
  readonly integrationMode?: 'demo' | 'resellerclub';
  readonly message?: string;
  readonly results?: DomainSearchResult[];
}

interface TransferResponse {
  readonly status: 'submitted' | 'not_configured' | 'error';
  readonly message?: string;
}

const legacySources: readonly LegacySource[] = [
  {
    id: 'openmrs',
    title: 'OpenMRS',
    subtitle: 'Open-source clinical platform migrations',
    summary: 'Move from OpenMRS into a governed FHIR core with managed country and integration services.',
    migrationChecklist: 'Database extraction, concept dictionary alignment, patient identity reconciliation, encounter and document mapping.',
    erpnextServiceItem: 'AFX-MIG-OPENMRS',
    recommendedTrack: 'paas',
    recommendedTier: 'pro',
    recommendedDeployment: 'hybrid',
    productSlugs: ['afiax-fhir-cloud', 'country-pack-runtime', 'api-and-integration-hub', 'managed-digital-health-services'],
  },
  {
    id: 'kenyaemr',
    title: 'KenyaEMR / KenyaMRS',
    subtitle: 'Kenya-specific OpenMRS-derived stacks',
    summary: 'Move into a country-aware operating model with managed claims, registry, and reimbursement boundaries.',
    migrationChecklist: 'KenyaEMR form extraction, national identifier reconciliation, facility mappings, and claims workflow review.',
    erpnextServiceItem: 'AFX-MIG-KENYAEMR',
    recommendedTrack: 'paas',
    recommendedTier: 'pro',
    recommendedDeployment: 'private',
    productSlugs: ['afiax-fhir-cloud', 'country-pack-runtime', 'healthcare-financial-services', 'managed-digital-health-services'],
  },
  {
    id: 'tiberbu',
    title: 'Tiberbu',
    subtitle: 'Operational and revenue modernization',
    summary: 'Move from Tiberbu-style operational systems into a connected Afiax application suite with ERP-ready billing flow.',
    migrationChecklist: 'Patient master extraction, appointment and billing migration, attachment handling, and target workflow redesign.',
    erpnextServiceItem: 'AFX-MIG-TIBERBU',
    recommendedTrack: 'saas',
    recommendedTier: 'pro',
    recommendedDeployment: 'public',
    productSlugs: ['afiax-ehr', 'patient-portals', 'healthcare-financial-services', 'afiax-tele-healthcare'],
  },
  {
    id: 'bahmni',
    title: 'Bahmni',
    subtitle: 'Open-source hospital stack migrations',
    summary: 'Use a phased hybrid modernization path for Bahmni and similar hospital stacks with mixed local integrations.',
    migrationChecklist: 'Admission, discharge, lab, pharmacy, and billing extracts plus terminology clean-up and staged cutover planning.',
    erpnextServiceItem: 'AFX-MIG-BAHMNI',
    recommendedTrack: 'paas',
    recommendedTier: 'pro',
    recommendedDeployment: 'hybrid',
    productSlugs: ['afiax-fhir-cloud', 'country-pack-runtime', 'data-and-ai-workspace', 'managed-digital-health-services'],
  },
  {
    id: 'csv',
    title: 'CSV / Excel / Access',
    subtitle: 'Low-maturity legacy data estates',
    summary: 'Start with structured SaaS onboarding where migration begins from exports, spreadsheets, and manual reconciliation.',
    migrationChecklist: 'Master data normalization, duplicate detection, provider mapping, and first-pass patient-history import.',
    erpnextServiceItem: 'AFX-MIG-FLATFILE',
    recommendedTrack: 'saas',
    recommendedTier: 'basic',
    recommendedDeployment: 'public',
    productSlugs: ['afiax-ehr', 'patient-portals', 'clinical-decision-support'],
  },
  {
    id: 'customsql',
    title: 'Custom SQL / Legacy HIS',
    subtitle: 'In-house databases and bespoke healthcare systems',
    summary: 'Use an interoperability-led migration path when the legacy estate is custom, fragmented, or heavily integrated.',
    migrationChecklist: 'Schema mapping, interface inventory, patient identity strategy, message translation, and phased retirement plan.',
    erpnextServiceItem: 'AFX-MIG-CUSTOM',
    recommendedTrack: 'paas',
    recommendedTier: 'basic',
    recommendedDeployment: 'hybrid',
    productSlugs: ['afiax-fhir-cloud', 'api-and-integration-hub', 'managed-digital-health-services'],
  },
] as const;

const wizardSteps = ['Domain', 'Migration', 'Commercial', 'Handoff'] as const;

const domainModeLabels: Record<DomainMode, string> = {
  register: 'Register',
  transfer: 'Transfer',
};

function getTransferNameservers(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildSignupUrl(props: {
  readonly organizationName: string;
  readonly contactName: string;
  readonly workEmail: string;
  readonly country: string;
  readonly selectedDomain: DomainSearchResult;
  readonly domainMode: DomainMode;
  readonly selectedSource: LegacySource;
  readonly deployment: PaaSDeploymentModel;
  readonly recommendedPlan: PricingPlanOffer;
  readonly transferStatus: string;
  readonly transferMessage: string;
  readonly lookupProvider: 'demo' | 'resellerclub';
}): string {
  const params = new URLSearchParams();
  params.set('organization', props.organizationName || 'Pending organization');
  params.set('contact', props.contactName || 'Pending contact');
  params.set('email', props.workEmail || 'Pending email');
  params.set('country', props.country);
  params.set('domain', props.selectedDomain.domain);
  params.set('domainMode', props.domainMode);
  params.set('source', props.selectedSource.title);
  params.set('serviceItem', props.selectedSource.erpnextServiceItem);
  params.set('plan', props.recommendedPlan.title);
  params.set('planBadge', props.recommendedPlan.badge);
  params.set('planMonthlyPrice', props.recommendedPlan.monthlyPrice.toString());
  params.set('track', props.selectedSource.recommendedTrack);
  params.set(
    'deployment',
    props.selectedSource.recommendedTrack === 'paas' ? paasDeploymentLabels[props.deployment] : 'Afiax SaaS'
  );
  params.set('transferStatus', props.transferStatus);
  params.set('transferMessage', props.transferMessage);
  params.set('lookupProvider', props.lookupProvider);
  return `/erpnext-signup?${params.toString()}`;
}

function canContinueFromStep(
  step: number,
  selectedDomain: DomainSearchResult | undefined,
  recommendedPlan: PricingPlanOffer | undefined,
  organizationName: string,
  contactName: string,
  workEmail: string
): boolean {
  switch (step) {
    case 0:
      return Boolean(selectedDomain);
    case 1:
      return true;
    case 2:
      return Boolean(recommendedPlan);
    default:
      return Boolean(selectedDomain && organizationName.trim() && contactName.trim() && workEmail.trim());
  }
}

function getSelectedDomainPlaceholder(mode: DomainMode): string {
  if (mode === 'transfer') {
    return 'Choose the domain you want to transfer into Afiax and OortCloud management.';
  }

  return 'Choose the domain you want OortCloud to register before implementation starts.';
}

function isSelectableDomainResult(result: DomainSearchResult): boolean {
  return result.status !== 'taken' && result.status !== 'unknown';
}

function getLookupButtonLabel(lookupState: 'idle' | 'loading' | 'ready' | 'error', domainMode: DomainMode): string {
  if (lookupState === 'loading') {
    return 'Checking...';
  }

  if (domainMode === 'register') {
    return 'Check domain';
  }

  return 'Check transfer';
}

export function GetStartedLeadFlow(): JSX.Element {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [domainMode, setDomainMode] = useState<DomainMode>('register');
  const [domainInput, setDomainInput] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [transferNameservers, setTransferNameservers] = useState('ns1.afiax.africa ns2.afiax.africa');
  const [lookupState, setLookupState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [lookupMessage, setLookupMessage] = useState('');
  const [lookupIntegrationMode, setLookupIntegrationMode] = useState<'demo' | 'resellerclub'>('demo');
  const [lookupResults, setLookupResults] = useState<DomainSearchResult[]>([]);
  const [selectedDomainName, setSelectedDomainName] = useState<string | undefined>(undefined);
  const [selectedSourceId, setSelectedSourceId] = useState(legacySources[0].id);
  const [deployment, setDeployment] = useState<PaaSDeploymentModel>(legacySources[0].recommendedDeployment);
  const [organizationName, setOrganizationName] = useState('');
  const [contactName, setContactName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [country, setCountry] = useState('Kenya');
  const [transitionState, setTransitionState] = useState<'idle' | 'loading'>('idle');
  const [transitionMessage, setTransitionMessage] = useState('');

  const selectedSource = legacySources.find((source) => source.id === selectedSourceId) ?? legacySources[0];
  const selectedDomain = lookupResults.find((result) => result.domain === selectedDomainName);
  const recommendedPlan = useMemo(() => {
    if (selectedSource.recommendedTrack === 'paas') {
      return getPricingPlan('paas', selectedSource.recommendedTier, deployment);
    }

    return getPricingPlan('saas', selectedSource.recommendedTier);
  }, [deployment, selectedSource]);
  const recommendedProducts = getProductsBySlugs(selectedSource.productSlugs);
  const recommendedDeploymentLabel =
    selectedSource.recommendedTrack === 'paas' ? paasDeploymentLabels[deployment] : 'Afiax SaaS';
  const canAdvance = canContinueFromStep(
    step,
    selectedDomain,
    recommendedPlan,
    organizationName,
    contactName,
    workEmail
  );

  function isStepUnlocked(index: number): boolean {
    if (index <= step) {
      return true;
    }

    if (index === 1 || index === 2) {
      return Boolean(selectedDomain);
    }

    if (index === 3) {
      return Boolean(selectedDomain && recommendedPlan);
    }

    return false;
  }

  function handleLookupClick(): void {
    handleLookup().catch(() => undefined);
  }

  function handleTransitionClick(): void {
    handleTransitionToErpnext().catch(() => undefined);
  }

  async function handleLookup(): Promise<void> {
    const normalized = normalizeDomainQuery(domainInput);
    if (normalized.length < 3) {
      setLookupState('error');
      setLookupMessage('Enter at least 3 characters before checking the domain.');
      setLookupResults([]);
      setSelectedDomainName(undefined);
      return;
    }

    setLookupState('loading');
    setLookupMessage('');

    try {
      const response = await fetch(`/api/domains/lookup?domain=${encodeURIComponent(normalized)}&mode=${domainMode}`);
      const data = (await response.json()) as LookupResponse;

      if (!response.ok || data.status !== 'ok' || !data.results?.length) {
        setLookupState('error');
        setLookupMessage(data.message ?? 'Domain lookup failed.');
        setLookupResults([]);
        setSelectedDomainName(undefined);
        return;
      }

      setLookupState('ready');
      setLookupIntegrationMode(data.integrationMode ?? 'demo');
      setLookupMessage(data.message ?? '');
      setLookupResults(data.results);
      const nextSelected =
        data.results.find((result) => result.status === 'available' || result.status === 'transfer-ready') ?? data.results[0];
      setSelectedDomainName(nextSelected?.domain);
    } catch (error) {
      setLookupState('error');
      setLookupMessage(error instanceof Error ? error.message : 'Domain lookup failed.');
      setLookupResults([]);
      setSelectedDomainName(undefined);
    }
  }

  function handleSourceSelect(source: LegacySource): void {
    setSelectedSourceId(source.id);
    if (source.recommendedTrack === 'paas') {
      setDeployment(source.recommendedDeployment);
    }
  }

  async function handleTransitionToErpnext(): Promise<void> {
    if (!selectedDomain || !recommendedPlan) {
      return;
    }

    setTransitionState('loading');
    setTransitionMessage('Preparing the ERPNext customer onboarding packet.');

    let transferStatus = 'not-requested';
    let transferMessage = '';

    if (domainMode === 'transfer') {
      setTransitionMessage('Submitting the transfer request to ResellerClub before ERPNext signup.');
      try {
        const response = await fetch('/api/domains/transfer', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            domainName: selectedDomain.domain,
            authCode: authCode.trim() || undefined,
            nameservers: getTransferNameservers(transferNameservers),
          }),
        });

        const data = (await response.json()) as TransferResponse;
        transferStatus = data.status ?? 'error';
        transferMessage = data.message ?? '';
      } catch (error) {
        transferStatus = 'error';
        transferMessage = error instanceof Error ? error.message : 'Transfer submission failed.';
      }
    }

    router.push(
      buildSignupUrl({
        organizationName,
        contactName,
        workEmail,
        country,
        selectedDomain,
        domainMode,
        selectedSource,
        deployment,
        recommendedPlan,
        transferStatus,
        transferMessage,
        lookupProvider: lookupIntegrationMode,
      })
    );
  }

  return (
    <div id="lead-flow" className="wizard-shell">
      <Panel className="corporate-panel wizard-panel" m={0} p="xl" radius="xl">
        <div className="lead-panel-header">
          <div>
            <p className="eyebrow">Hosted onboarding wizard</p>
            <h3>Reseller-style domain flow first, then Afiax commercial packaging, then ERPNext signup.</h3>
          </div>
          <span className="info-pill">OortCloud + ResellerClub + ERPNext</span>
        </div>

        <div className="wizard-step-row" role="tablist" aria-label="Onboarding wizard steps">
          {wizardSteps.map((label, index) => (
            <button
              key={label}
              type="button"
              className={index === step ? 'wizard-step is-active' : 'wizard-step'}
              onClick={() => setStep(index)}
              disabled={!isStepUnlocked(index)}
            >
              <span className="lead-step-number">0{index + 1}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {step === 0 ? (
          <div className="wizard-stage">
            <div className="wizard-stage-grid">
              <div className="wizard-stage-main">
                <div className="wizard-stage-copy">
                  <p className="eyebrow">Step 1</p>
                  <h3>Check availability or initiate the transfer path.</h3>
                  <p>
                    This stage behaves like a domain reseller order screen. Register mode checks availability across the
                    OortCloud catalog, while transfer mode prepares the ResellerClub transfer request before ERPNext
                    customer signup.
                  </p>
                </div>

                <div className="domain-mode-row" role="tablist" aria-label="Domain mode">
                  {(['register', 'transfer'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={value === domainMode ? 'toggle-chip is-active' : 'toggle-chip'}
                      onClick={() => setDomainMode(value)}
                    >
                      {domainModeLabels[value]}
                    </button>
                  ))}
                </div>

                <div className="wizard-domain-row">
                  <label className="field-group search-field">
                    <span className="field-label">ResellerClub domain lookup</span>
                    <input
                      className="text-input text-input-large"
                      type="text"
                      value={domainInput}
                      onChange={(event) => setDomainInput(event.target.value)}
                      placeholder={domainMode === 'register' ? 'sunrisecare' : 'sunrisecare.co.ke'}
                    />
                  </label>
                  <button type="button" className="primary-link lead-submit" onClick={handleLookupClick}>
                    {getLookupButtonLabel(lookupState, domainMode)}
                  </button>
                </div>

                {domainMode === 'transfer' ? (
                  <div className="lead-form-grid">
                    <label className="field-group">
                      <span className="field-label">Auth code</span>
                      <input
                        className="text-input"
                        type="text"
                        value={authCode}
                        onChange={(event) => setAuthCode(event.target.value)}
                        placeholder="Optional for some TLDs, required for others"
                      />
                    </label>
                    <label className="field-group field-group-span">
                      <span className="field-label">Name servers</span>
                      <input
                        className="text-input"
                        type="text"
                        value={transferNameservers}
                        onChange={(event) => setTransferNameservers(event.target.value)}
                        placeholder="ns1.afiax.africa ns2.afiax.africa"
                      />
                    </label>
                  </div>
                ) : null}

                {lookupMessage ? (
                  <p className="wizard-result-note">
                    {lookupIntegrationMode === 'resellerclub' ? 'ResellerClub:' : 'Demo mode:'} {lookupMessage}
                  </p>
                ) : null}

                {lookupState === 'ready' ? (
                  <div className="domain-result-grid">
                    {lookupResults.map((result) => (
                      <article
                        key={result.domain}
                        className={result.domain === selectedDomain?.domain ? 'domain-result-card is-selected' : 'domain-result-card'}
                      >
                        <div className="domain-result-header">
                          <h3>{result.domain}</h3>
                          <span className={`domain-status status-${result.status}`}>{domainStatusLabels[result.status]}</span>
                        </div>
                        <p>{result.note}</p>
                        <div className="domain-result-footer">
                          <div className="price-lockup">
                            <span className="price-prefix">Starting at</span>
                            <span className="price-amount">${result.yearlyPrice}</span>
                            <span className="price-unit">per year</span>
                          </div>
                          <button
                            type="button"
                            className={
                              isSelectableDomainResult(result)
                                ? 'toggle-chip domain-result-action'
                                : 'toggle-chip domain-result-action is-disabled'
                            }
                            onClick={() => setSelectedDomainName(result.domain)}
                            disabled={!isSelectableDomainResult(result)}
                          >
                            {domainMode === 'register' ? 'Select domain' : 'Select transfer'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="wizard-sidebar">
                <Panel className="wizard-sidebar-card corporate-panel" m={0} p="lg" radius="xl">
                  <p className="eyebrow">Selected domain order</p>
                  <h3>{selectedDomain ? selectedDomain.domain : 'Choose a domain to continue'}</h3>
                  <p>{selectedDomain ? selectedDomain.note : getSelectedDomainPlaceholder(domainMode)}</p>
                  {selectedDomain ? (
                    <>
                      <div className="price-lockup">
                        <span className="price-prefix">Estimated yearly price</span>
                        <span className="price-amount">${selectedDomain.yearlyPrice}</span>
                        <span className="price-unit">per year</span>
                      </div>
                      <dl className="wizard-selection-list">
                        <div>
                          <dt>Mode</dt>
                          <dd>{domainModeLabels[domainMode]}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{domainStatusLabels[selectedDomain.status]}</dd>
                        </div>
                        <div>
                          <dt>Lookup source</dt>
                          <dd>{lookupIntegrationMode === 'resellerclub' ? 'ResellerClub live API' : 'Demo catalog'}</dd>
                        </div>
                      </dl>
                    </>
                  ) : null}
                </Panel>

                <Panel className="wizard-sidebar-card corporate-panel" m={0} p="lg" radius="xl">
                  <p className="eyebrow">OortCloud domain catalog</p>
                  <div className="supported-tld-grid">
                    {defaultDomainCatalog.map((entry) => (
                      <article key={entry.tld} className="supported-tld-card">
                        <div className="domain-result-header">
                          <h3>{entry.tld}</h3>
                          <span className="field-label">OortCloud</span>
                        </div>
                        <p>{entry.note}</p>
                        <p className="muted-copy">
                          Register from ${entry.registerPrice} per year, transfer from ${entry.transferPrice} per year.
                        </p>
                      </article>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-stage">
            <div className="wizard-stage-copy">
              <p className="eyebrow">Step 2</p>
              <h3>Select the migration source.</h3>
              <p>Choose the legacy estate so the wizard can recommend the right Afiax commercial path and ERPNext service item.</p>
            </div>

            <div className="legacy-option-grid">
              {legacySources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className={source.id === selectedSource.id ? 'legacy-option-card is-selected' : 'legacy-option-card'}
                  onClick={() => handleSourceSelect(source)}
                >
                  <p className="eyebrow">{source.subtitle}</p>
                  <h3>{source.title}</h3>
                  <p>{source.summary}</p>
                </button>
              ))}
            </div>

            <Panel className="note-card corporate-panel" m={0} p="lg" radius="xl">
              <p className="eyebrow">Migration checklist</p>
              <p>{selectedSource.migrationChecklist}</p>
              <p className="muted-copy">ERPNext service item: {selectedSource.erpnextServiceItem}</p>
            </Panel>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-stage">
            <div className="lead-panel-header">
              <div className="wizard-stage-copy">
                <p className="eyebrow">Step 3</p>
                <h3>Review the commercial recommendation.</h3>
                <p>
                  The wizard keeps pricing interactive here instead of in the global header, and adjusts the recommendation
                  for the selected migration source.
                </p>
              </div>
              <BillingViewToggle label="Price view" />
            </div>

            {selectedSource.recommendedTrack === 'paas' ? (
              <div className="lead-deployment-block">
                <p className="field-label">Managed deployment model</p>
                <div className="toggle-row" role="tablist" aria-label="Managed deployment model">
                  {(['public', 'hybrid', 'private'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={value === deployment ? 'toggle-chip is-active' : 'toggle-chip'}
                      onClick={() => setDeployment(value)}
                    >
                      {paasDeploymentLabels[value]}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {recommendedPlan ? (
              <div className="recommended-plan-card">
                <div className="pricing-card-header">
                  <div>
                    <p className="eyebrow">{recommendedPlan.badge}</p>
                    <h3>{recommendedPlan.title}</h3>
                    {recommendedPlan.deployment ? <p className="muted-copy">{paasDeploymentLabels[recommendedPlan.deployment]}</p> : null}
                  </div>
                  <PriceTag
                    price={`$${recommendedPlan.monthlyPrice.toLocaleString()}`}
                    unit="per month"
                    prefix={recommendedPlan.pricePrefix}
                  />
                </div>
                <p>{recommendedPlan.summary}</p>
                <p className="muted-copy">{recommendedPlan.commitment}</p>
                {recommendedPlan.activationKit?.length ? (
                  <ul className="dense-list pricing-feature-list">
                    {recommendedPlan.activationKit.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="highlight-grid">
              {recommendedProducts.map((product) => (
                <Panel key={product.slug} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                  <div className="pricing-card-header">
                    <p className="eyebrow">{product.category}</p>
                    <PriceTag price={product.price} unit={product.unit} />
                  </div>
                  <h3>{product.title}</h3>
                  <p>{product.summary}</p>
                  <Link href={getProductHref(product.title)} className="card-link">
                    View product page
                  </Link>
                </Panel>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-stage">
            <div className="wizard-stage-copy">
              <p className="eyebrow">Step 4</p>
              <h3>Transition into ERPNext signup.</h3>
              <p>Capture the lead owner, customer context, domain order, and migration service line before pushing the handoff into ERPNext.</p>
            </div>

            <div className="lead-form-grid">
              <label className="field-group">
                <span className="field-label">Organization name</span>
                <input
                  className="text-input"
                  type="text"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Sunrise Care Group"
                />
              </label>
              <label className="field-group">
                <span className="field-label">Primary contact</span>
                <input
                  className="text-input"
                  type="text"
                  value={contactName}
                  onChange={(event) => setContactName(event.target.value)}
                  placeholder="Transformation lead"
                />
              </label>
              <label className="field-group">
                <span className="field-label">Work email</span>
                <input
                  className="text-input"
                  type="email"
                  value={workEmail}
                  onChange={(event) => setWorkEmail(event.target.value)}
                  placeholder="team@organization.africa"
                />
              </label>
              <label className="field-group">
                <span className="field-label">Country context</span>
                <select className="text-input" value={country} onChange={(event) => setCountry(event.target.value)}>
                  <option>Kenya</option>
                  <option>Uganda</option>
                  <option>Tanzania</option>
                  <option>Rwanda</option>
                  <option>Nigeria</option>
                  <option>Ghana</option>
                  <option>South Africa</option>
                  <option>Pan-African program</option>
                </select>
              </label>
            </div>

            <Panel className="corporate-panel" m={0} p="xl" radius="xl">
              <DescriptionList>
                <DescriptionListEntry term="Selected domain">
                  {selectedDomain ? `${selectedDomain.domain} (${domainModeLabels[domainMode]})` : 'Pending'}
                </DescriptionListEntry>
                <DescriptionListEntry term="Migration source">{selectedSource.title}</DescriptionListEntry>
                <DescriptionListEntry term="ERPNext service item">{selectedSource.erpnextServiceItem}</DescriptionListEntry>
                <DescriptionListEntry term="Recommended commercial path">
                  {recommendedPlan?.title ?? 'Pending review'}
                  {selectedSource.recommendedTrack === 'paas' ? ` on ${paasDeploymentLabels[deployment]}` : ' on Afiax SaaS'}
                </DescriptionListEntry>
                <DescriptionListEntry term="Deployment model">{recommendedDeploymentLabel}</DescriptionListEntry>
                <DescriptionListEntry term="Lookup provider">
                  {lookupIntegrationMode === 'resellerclub' ? 'ResellerClub live API' : 'Demo catalog'}
                </DescriptionListEntry>
                <DescriptionListEntry term="Transfer submission">
                  {domainMode === 'transfer'
                    ? 'Transfer will be submitted to ResellerClub before redirecting to ERPNext signup.'
                    : 'Domain selection will transition directly into ERPNext signup.'}
                </DescriptionListEntry>
              </DescriptionList>
            </Panel>

            {transitionMessage ? <p className="wizard-result-note">{transitionMessage}</p> : null}
          </div>
        ) : null}

        <div className="wizard-footer">
          <button
            type="button"
            className="secondary-link wizard-button"
            onClick={() => setStep((currentStep) => Math.max(0, currentStep - 1))}
            disabled={step === 0 || transitionState === 'loading'}
          >
            Back
          </button>

          {step < wizardSteps.length - 1 ? (
            <button
              type="button"
              className="primary-link wizard-button"
              onClick={() => setStep((currentStep) => Math.min(wizardSteps.length - 1, currentStep + 1))}
              disabled={!canAdvance || transitionState === 'loading'}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="primary-link wizard-button"
              onClick={handleTransitionClick}
              disabled={!canAdvance || transitionState === 'loading'}
            >
              {transitionState === 'loading' ? 'Preparing ERPNext signup...' : 'Continue to ERPNext signup'}
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}
