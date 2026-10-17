// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import type { JSX } from 'react';
import { useState } from 'react';

import {
  getPricingPlan,
  getProductsBySlugs,
  paasDeploymentLabels,
} from '../lib/product-catalog';
import type { BillingView, OfferingTrack, PaaSDeploymentModel, PlanTier } from '../lib/product-catalog';
import { Panel } from './medplum-ui';
import { BillingViewToggle } from './site-controls';
import { useSitePreferences } from './use-site-preferences';

const billingLabels: Record<BillingView, string> = {
  hour: 'Per hr',
  month: 'Per month',
};

const trackLabels: Record<OfferingTrack, string> = {
  saas: 'SaaS',
  paas: 'PaaS',
};

const tierLabels: Record<PlanTier, string> = {
  basic: 'Basic',
  pro: 'Pro',
  platinum: 'Platinum',
};

const deploymentLabels: Record<PaaSDeploymentModel, string> = {
  public: paasDeploymentLabels.public,
  hybrid: paasDeploymentLabels.hybrid,
  private: paasDeploymentLabels.private,
};

function formatDisplayedPrice(monthlyPrice: number, billingView: BillingView): string {
  if (billingView === 'month') {
    return `$${monthlyPrice.toLocaleString()}`;
  }

  return `$${(monthlyPrice / 720).toFixed(2)}`;
}

function getBillingFootnote(billingView: BillingView): string {
  if (billingView === 'month') {
    return 'Commercial agreements are contracted monthly or annually.';
  }

  return 'Hourly view is a normalized budgeting equivalent from the monthly commercial position.';
}

export function PricingExplorer(): JSX.Element {
  const [track, setTrack] = useState<OfferingTrack>('saas');
  const [tier, setTier] = useState<PlanTier>('pro');
  const [deployment, setDeployment] = useState<PaaSDeploymentModel>('public');
  const { billingView } = useSitePreferences();

  const plan = getPricingPlan(track, tier, deployment);

  if (!plan) {
    return (
      <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
        <p>Pricing plan configuration is unavailable.</p>
      </Panel>
    );
  }

  const featuredProducts = getProductsBySlugs(plan.featuredProductSlugs);
  const displayedPrice = formatDisplayedPrice(plan.monthlyPrice, billingView);
  const displayedUnit = billingLabels[billingView].replace('Per ', '').toLowerCase();

  return (
    <div className="pricing-explorer">
      <div className="pricing-toggle-grid">
        <div className="pricing-toggle-group">
          <p className="eyebrow">Offering model</p>
          <div className="toggle-row" role="tablist" aria-label="Offering model">
            {(['saas', 'paas'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={value === track ? 'toggle-chip is-active' : 'toggle-chip'}
                onClick={() => setTrack(value)}
              >
                {trackLabels[value]}
              </button>
            ))}
          </div>
        </div>
        <div className="pricing-toggle-group">
          <p className="eyebrow">Plan tier</p>
          <div className="toggle-row" role="tablist" aria-label="Plan tier">
            {(['basic', 'pro', 'platinum'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={value === tier ? 'toggle-chip is-active' : 'toggle-chip'}
                onClick={() => setTier(value)}
              >
                {tierLabels[value]}
              </button>
            ))}
          </div>
        </div>
        {track === 'paas' ? (
          <div className="pricing-toggle-group">
            <p className="eyebrow">Deployment</p>
            <div className="toggle-row" role="tablist" aria-label="PaaS deployment">
              {(['public', 'hybrid', 'private'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === deployment ? 'toggle-chip is-active' : 'toggle-chip'}
                  onClick={() => setDeployment(value)}
                >
                  {deploymentLabels[value]}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <BillingViewToggle label="Commercial view" />
      </div>

      <div className="pricing-explorer-grid">
        <Panel className="corporate-panel pricing-hero-card" m={0} p="xl" radius="xl">
          <div className="pricing-card-header">
            <div>
              <p className="eyebrow">{plan.badge}</p>
              <h3>{plan.title}</h3>
              {plan.deployment ? <p className="muted-copy">{deploymentLabels[plan.deployment]}</p> : null}
            </div>
            <div className="price-lockup">
              <span className="price-prefix">{plan.pricePrefix ?? ''}</span>
              <span className="price-amount">{displayedPrice}</span>
              <span className="price-unit">per {displayedUnit}</span>
            </div>
          </div>
          <p>{plan.summary}</p>
          <p className="muted-copy">{plan.audience}</p>
          {plan.managedModel ? <p className="muted-copy">{plan.managedModel}</p> : null}
          <p className="muted-copy">{plan.commitment}</p>
          <ul className="dense-list pricing-feature-list">
            {plan.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {plan.activationKit?.length ? (
            <>
              <p className="eyebrow">Included activation kit</p>
              <ul className="dense-list pricing-feature-list">
                {plan.activationKit.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="pricing-footnote">{getBillingFootnote(billingView)}</p>
        </Panel>

        <Panel className="corporate-panel pricing-sidebar-card" m={0} p="xl" radius="xl">
          <p className="eyebrow">ERPNext billing map</p>
          <div className="pricing-sidebar-item pricing-map-item">
            <div>
              <h3>{plan.erpnext.itemCode}</h3>
              <p>{plan.erpnext.itemGroup}</p>
            </div>
            <span className="info-pill">{plan.erpnext.subscriptionPlan}</span>
          </div>
          <div className="pricing-map-meta">
            {plan.deployment ? (
              <p>
                <strong>Deployment:</strong> {deploymentLabels[plan.deployment]}
              </p>
            ) : null}
            <p>
              <strong>Invoice cadence:</strong> {plan.erpnext.invoiceCadence}
            </p>
            <p>
              <strong>Usage SKUs:</strong> {plan.erpnext.usageItems.join(', ')}
            </p>
          </div>
          <p className="eyebrow">Included products</p>
          <div className="pricing-sidebar-stack">
            {featuredProducts.map((product) => (
              <div key={product.slug} className="pricing-sidebar-item">
                <div>
                  <h3>{product.title}</h3>
                  <p>{product.summary}</p>
                </div>
                <Link href={`/solutions/${product.slug}`} className="card-link">
                  View product page
                </Link>
              </div>
            ))}
          </div>
          <Link href="/pricing" className="card-link">
            Review full pricing matrix
          </Link>
        </Panel>
      </div>
    </div>
  );
}
