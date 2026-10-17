// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { ExperienceSceneCanvas } from './experience-scene';
import type { ExperienceAsset } from '../lib/experience-content';

export interface DeviceMockProps {
  readonly asset: ExperienceAsset;
  readonly compact?: boolean;
  readonly priority?: boolean;
  readonly ctaHref?: string;
  readonly ctaLabel?: string;
}

function DeviceFrame(props: {
  readonly asset: ExperienceAsset;
  readonly framedClassName?: string;
  readonly compact?: boolean;
}): JSX.Element {
  const { asset, framedClassName, compact = false } = props;
  const highlightCount = compact ? 2 : 3;

  return (
    <div className={framedClassName ? `device-frame-shell ${framedClassName}` : 'device-frame-shell'}>
      <div className="device-frame">
        <div className="device-frame-header">
          <span className="device-led" />
          <span className="device-speaker" />
        </div>
        <div className="device-media">
          <ExperienceSceneCanvas scene={asset.scene} title={asset.alt} />
          <div className="device-signal-pill">
            <span className="device-signal-kicker">{asset.eyebrow}</span>
            <strong>{asset.signal}</strong>
          </div>
          <div className="device-highlight-row">
            {asset.highlights.slice(0, highlightCount).map((item) => (
              <span key={item} className="device-highlight-pill">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DeviceMock(props: DeviceMockProps): JSX.Element {
  const { asset, compact = false, ctaHref, ctaLabel } = props;
  const deviceClassName = `device-card device-card-${asset.formFactor} accent-${asset.accent}${compact ? ' is-compact' : ''}`;

  return (
    <article className={deviceClassName}>
      <DeviceFrame asset={asset} compact={compact} />
      <div className="device-copy">
        <p className="eyebrow">{asset.eyebrow}</p>
        <h3>{asset.title}</h3>
        <p>{asset.summary}</p>
        <div className="device-copy-tags">
          {asset.highlights.map((item) => (
            <span key={item} className="device-copy-tag">
              {item}
            </span>
          ))}
        </div>
        {ctaHref && ctaLabel ? (
          <Link href={ctaHref} className="card-link">
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export function DeviceSurfacePreview(props: { readonly asset: ExperienceAsset; readonly compact?: boolean }): JSX.Element {
  const { asset, compact = true } = props;

  return (
    <div className={`device-surface-preview accent-${asset.accent}`}>
      <DeviceFrame asset={asset} compact={compact} />
    </div>
  );
}

export function ExperienceStage(props: { readonly assets: readonly ExperienceAsset[]; readonly showLegend?: boolean }): JSX.Element {
  const { assets, showLegend = false } = props;
  const [primary, secondary, tertiary] = assets;

  return (
    <div className="experience-stage">
      {primary ? (
        <div className={`experience-stage-panel stage-primary accent-${primary.accent}`}>
          <DeviceFrame asset={primary} framedClassName="device-frame-shell-elevated" />
          <div className="experience-stage-caption">
            <p className="eyebrow">{primary.eyebrow}</p>
            <h3>{primary.title}</h3>
          </div>
        </div>
      ) : null}
      {secondary ? (
        <div className={`experience-stage-panel stage-secondary accent-${secondary.accent}`}>
          <DeviceFrame asset={secondary} compact framedClassName="device-frame-shell-angled-left" />
        </div>
      ) : null}
      {tertiary ? (
        <div className={`experience-stage-panel stage-tertiary accent-${tertiary.accent}`}>
          <DeviceFrame asset={tertiary} compact framedClassName="device-frame-shell-angled-right" />
        </div>
      ) : null}
      {showLegend ? (
        <div className="experience-stage-legend">
          {assets.map((asset) => (
            <div key={asset.title} className={`experience-legend-chip accent-${asset.accent}`}>
              <span className="experience-legend-dot" />
              <div className="experience-legend-copy">
                <span className="experience-legend-title">{asset.title}</span>
                <span className="experience-legend-signal">{asset.signal}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DeviceCluster(props: { readonly assets: readonly ExperienceAsset[]; readonly showLegend?: boolean }): JSX.Element {
  return <ExperienceStage assets={props.assets} showLegend={props.showLegend} />;
}
