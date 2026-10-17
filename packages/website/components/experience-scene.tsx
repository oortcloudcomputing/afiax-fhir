// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import type { ExperienceScene } from '../lib/experience-content';

interface ScenePalette {
  readonly primary: string;
  readonly secondary: string;
  readonly glow: string;
}

const palettes: Record<ExperienceScene, ScenePalette> = {
  'clinical-command': { primary: '#3cbfbb', secondary: '#d4a56f', glow: '#94dedd' },
  'bedside-chart': { primary: '#2fb5c4', secondary: '#9fd7dc', glow: '#8dd8df' },
  'mobile-rounding': { primary: '#d4a56f', secondary: '#efc38a', glow: '#f1d9a8' },
  'automation-mesh': { primary: '#3cbfbb', secondary: '#8ed6d2', glow: '#9be8e1' },
  'intake-orbit': { primary: '#d4a56f', secondary: '#f2d0a2', glow: '#fde4b7' },
  'executive-ops': { primary: '#9e5a44', secondary: '#d4a56f', glow: '#e4bca7' },
  'terminology-fabric': { primary: '#3cbfbb', secondary: '#b7efe7', glow: '#94ebe2' },
  'imaging-flow': { primary: '#d4a56f', secondary: '#3cbfbb', glow: '#f0d2a0' },
};

export function ExperienceSceneCanvas(props: {
  readonly scene: ExperienceScene;
  readonly title: string;
}): JSX.Element {
  const { scene, title } = props;
  const palette = palettes[scene];

  return (
    <svg viewBox="0 0 1200 800" className="experience-scene-svg" aria-label={title} role="img">
      <rect x="0" y="0" width="1200" height="800" rx="44" fill="#09131d" />
      <circle cx="220" cy="170" r="180" fill={palette.glow} opacity="0.14" className="scene-pulse" />
      <circle cx="980" cy="610" r="220" fill={palette.glow} opacity="0.1" className="scene-pulse scene-delay" />
      {scene === 'clinical-command' ? <ClinicalCommand palette={palette} /> : null}
      {scene === 'bedside-chart' ? <BedsideChart palette={palette} /> : null}
      {scene === 'mobile-rounding' ? <MobileRounding palette={palette} /> : null}
      {scene === 'automation-mesh' ? <AutomationMesh palette={palette} /> : null}
      {scene === 'intake-orbit' ? <IntakeOrbit palette={palette} /> : null}
      {scene === 'executive-ops' ? <ExecutiveOps palette={palette} /> : null}
      {scene === 'terminology-fabric' ? <TerminologyFabric palette={palette} /> : null}
      {scene === 'imaging-flow' ? <ImagingFlow palette={palette} /> : null}
    </svg>
  );
}

function ClinicalCommand(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <rect x="64" y="74" width="250" height="652" rx="28" fill="rgba(255,255,255,0.05)" />
      <rect x="354" y="74" width="520" height="652" rx="28" fill="rgba(255,255,255,0.05)" />
      <rect x="904" y="74" width="232" height="652" rx="28" fill="rgba(255,255,255,0.05)" />
      <rect x="92" y="118" width="190" height="34" rx="17" fill={props.palette.secondary} opacity="0.88" />
      {Array.from({ length: 5 }).map((_, index) => (
        <g key={index} transform={`translate(92 ${188 + index * 104})`} className="scene-float" style={{ animationDelay: `${index * 0.35}s` }}>
          <rect width="194" height="74" rx="24" fill="rgba(255,255,255,0.06)" />
          <circle cx="34" cy="37" r="18" fill={palette.primary} />
          <rect x="66" y="20" width="92" height="14" rx="7" fill="rgba(255,255,255,0.16)" />
          <rect x="66" y="42" width="64" height="12" rx="6" fill="rgba(255,255,255,0.08)" />
        </g>
      ))}
      <rect x="392" y="116" width="444" height="152" rx="30" fill={`rgba(60,191,187,0.12)`} />
      <path d="M430 234C492 184 542 222 604 170C662 122 718 178 798 126" stroke={palette.primary} strokeWidth="18" strokeLinecap="round" fill="none" className="scene-path" />
      <rect x="392" y="306" width="212" height="176" rx="28" fill="rgba(255,255,255,0.06)" />
      <rect x="624" y="306" width="212" height="176" rx="28" fill="rgba(255,255,255,0.06)" />
      <rect x="392" y="506" width="444" height="178" rx="28" fill="rgba(255,255,255,0.06)" />
      <rect x="938" y="126" width="164" height="122" rx="24" fill={`rgba(212,165,111,0.16)`} />
      <rect x="938" y="278" width="164" height="122" rx="24" fill="rgba(255,255,255,0.06)" />
      <rect x="938" y="430" width="164" height="122" rx="24" fill={`rgba(60,191,187,0.16)`} />
    </>
  );
}

function BedsideChart(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <rect x="82" y="90" width="1036" height="620" rx="38" fill="rgba(255,255,255,0.05)" />
      <rect x="122" y="134" width="286" height="208" rx="30" fill={`rgba(60,191,187,0.12)`} />
      <rect x="446" y="134" width="632" height="208" rx="30" fill="rgba(255,255,255,0.05)" />
      <rect x="122" y="378" width="308" height="286" rx="30" fill="rgba(255,255,255,0.05)" />
      <rect x="466" y="378" width="612" height="286" rx="30" fill="rgba(255,255,255,0.05)" />
      <circle cx="220" cy="234" r="64" fill={palette.secondary} opacity="0.88" />
      <rect x="186" y="212" width="68" height="12" rx="6" fill="#0a1620" />
      <rect x="186" y="238" width="48" height="10" rx="5" fill="#0a1620" />
      <path d="M498 272C560 238 610 282 666 228C716 180 760 186 830 148C886 120 952 188 1032 146" stroke={palette.primary} strokeWidth="16" strokeLinecap="round" fill="none" className="scene-path" />
      {Array.from({ length: 5 }).map((_, index) => (
        <rect
          key={index}
          x={152 + index * 48}
          y={430 + (index % 2) * 18}
          width="28"
          height={88 + index * 12}
          rx="14"
          fill={index % 2 === 0 ? palette.primary : palette.secondary}
          opacity="0.88"
          className="scene-float"
          style={{ animationDelay: `${index * 0.25}s` }}
        />
      ))}
      <rect x="514" y="420" width="232" height="88" rx="22" fill={`rgba(212,165,111,0.16)`} />
      <rect x="772" y="420" width="264" height="88" rx="22" fill={`rgba(60,191,187,0.16)`} />
      <rect x="514" y="534" width="522" height="92" rx="24" fill="rgba(255,255,255,0.06)" />
    </>
  );
}

function MobileRounding(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <rect x="168" y="76" width="864" height="648" rx="52" fill="rgba(255,255,255,0.05)" />
      <rect x="238" y="126" width="724" height="140" rx="34" fill={`rgba(212,165,111,0.16)`} />
      <circle cx="332" cy="196" r="54" fill={palette.primary} />
      <rect x="410" y="168" width="236" height="18" rx="9" fill="rgba(255,255,255,0.18)" />
      <rect x="410" y="202" width="154" height="14" rx="7" fill="rgba(255,255,255,0.1)" />
      {Array.from({ length: 4 }).map((_, index) => (
        <g key={index} transform={`translate(238 ${304 + index * 90})`}>
          <rect width="724" height="68" rx="24" fill="rgba(255,255,255,0.05)" />
          <circle cx="42" cy="34" r="16" fill={index % 2 === 0 ? palette.secondary : palette.primary} className="scene-pulse" style={{ animationDelay: `${index * 0.4}s` }} />
          <rect x="82" y="22" width="210" height="12" rx="6" fill="rgba(255,255,255,0.16)" />
          <rect x="82" y="42" width="132" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
          <rect x="612" y="18" width="82" height="28" rx="14" fill={index % 2 === 0 ? palette.primary : palette.secondary} />
        </g>
      ))}
      <rect x="320" y="666" width="560" height="18" rx="9" fill="rgba(255,255,255,0.08)" />
    </>
  );
}

function AutomationMesh(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  const nodes = [
    [240, 174],
    [548, 146],
    [876, 192],
    [332, 468],
    [640, 388],
    [922, 488],
  ] as const;

  return (
    <>
      {nodes.map(([x, y], index) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="28" fill={index % 2 === 0 ? palette.primary : palette.secondary} className="scene-pulse" style={{ animationDelay: `${index * 0.25}s` }} />
      ))}
      <path d="M240 174L548 146L876 192M332 468L640 388L922 488M240 174L332 468M548 146L640 388M876 192L922 488M548 146L332 468M876 192L640 388" stroke="rgba(255,255,255,0.18)" strokeWidth="10" fill="none" strokeLinecap="round" className="scene-path" />
      <rect x="110" y="574" width="980" height="136" rx="34" fill="rgba(255,255,255,0.05)" />
      {Array.from({ length: 5 }).map((_, index) => (
        <rect
          key={index}
          x={164 + index * 180}
          y="614"
          width="128"
          height="56"
          rx="20"
          fill={index % 2 === 0 ? 'rgba(60,191,187,0.18)' : 'rgba(212,165,111,0.18)'}
          className="scene-float"
          style={{ animationDelay: `${index * 0.28}s` }}
        />
      ))}
    </>
  );
}

function IntakeOrbit(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <circle cx="600" cy="400" r="220" fill="rgba(255,255,255,0.04)" />
      <circle cx="600" cy="400" r="162" fill="rgba(255,255,255,0.05)" className="scene-rotate" />
      <circle cx="600" cy="400" r="112" fill={`rgba(212,165,111,0.16)`} />
      <circle cx="600" cy="400" r="64" fill={palette.primary} />
      <rect x="544" y="382" width="112" height="18" rx="9" fill="#0a1620" />
      <rect x="560" y="414" width="76" height="14" rx="7" fill="#0a1620" />
      {[
        [600, 126],
        [870, 400],
        [600, 674],
        [330, 400],
      ].map(([x, y], index) => (
        <g key={`${x}-${y}`} transform={`translate(${x - 90} ${y - 40})`} className="scene-float" style={{ animationDelay: `${index * 0.35}s` }}>
          <rect width="180" height="80" rx="26" fill={index % 2 === 0 ? 'rgba(60,191,187,0.16)' : 'rgba(212,165,111,0.16)'} />
          <rect x="30" y="24" width="120" height="14" rx="7" fill="rgba(255,255,255,0.16)" />
          <rect x="30" y="46" width="72" height="10" rx="5" fill="rgba(255,255,255,0.08)" />
        </g>
      ))}
    </>
  );
}

function ExecutiveOps(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <rect x="82" y="92" width="1036" height="172" rx="34" fill="rgba(255,255,255,0.05)" />
      {Array.from({ length: 4 }).map((_, index) => (
        <g key={index} transform={`translate(${118 + index * 250} 132)`}>
          <rect width="208" height="96" rx="24" fill={index % 2 === 0 ? 'rgba(212,165,111,0.16)' : 'rgba(60,191,187,0.16)'} />
          <rect x="24" y="24" width="108" height="14" rx="7" fill="rgba(255,255,255,0.16)" />
          <rect x="24" y="54" width="62" height="22" rx="11" fill={index % 2 === 0 ? palette.secondary : palette.primary} />
        </g>
      ))}
      <rect x="82" y="306" width="632" height="402" rx="34" fill="rgba(255,255,255,0.05)" />
      <rect x="752" y="306" width="366" height="402" rx="34" fill="rgba(255,255,255,0.05)" />
      {Array.from({ length: 8 }).map((_, index) => (
        <rect
          key={index}
          x={134 + index * 62}
          y={570 - (index % 4) * 56 - index * 9}
          width="34"
          height={106 + (index % 4) * 44}
          rx="16"
          fill={index % 2 === 0 ? palette.primary : palette.secondary}
          opacity="0.88"
          className="scene-float"
          style={{ animationDelay: `${index * 0.16}s` }}
        />
      ))}
      <path d="M802 616C854 566 876 620 934 542C980 480 1020 512 1066 448" stroke={palette.primary} strokeWidth="16" strokeLinecap="round" fill="none" className="scene-path" />
    </>
  );
}

function TerminologyFabric(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  const pills = [
    [150, 132, 212, 64],
    [432, 148, 212, 64],
    [748, 114, 244, 72],
    [200, 386, 240, 72],
    [522, 346, 252, 72],
    [836, 412, 236, 72],
    [360, 610, 208, 64],
    [690, 610, 240, 64],
  ] as const;

  return (
    <>
      {pills.map(([x, y, width, height], index) => (
        <g key={`${x}-${y}`} className="scene-float" style={{ animationDelay: `${index * 0.2}s` }}>
          <rect x={x} y={y} width={width} height={height} rx={height / 2} fill={index % 3 === 0 ? 'rgba(60,191,187,0.18)' : 'rgba(212,165,111,0.16)'} />
          <rect x={x + 28} y={y + 24} width={width * 0.44} height="14" rx="7" fill="rgba(255,255,255,0.18)" />
        </g>
      ))}
      <path d="M362 164L432 180L748 150L648 382L320 418L524 646L812 646" stroke="rgba(255,255,255,0.18)" strokeWidth="10" fill="none" strokeLinecap="round" className="scene-path" />
      <circle cx="648" cy="382" r="26" fill={palette.primary} className="scene-pulse" />
    </>
  );
}

function ImagingFlow(props: { readonly palette: ScenePalette }): JSX.Element {
  const { palette } = props;
  return (
    <>
      <rect x="82" y="92" width="740" height="616" rx="36" fill="rgba(255,255,255,0.05)" />
      <rect x="860" y="92" width="258" height="616" rx="36" fill="rgba(255,255,255,0.05)" />
      <circle cx="452" cy="402" r="220" fill="rgba(255,255,255,0.03)" />
      <circle cx="452" cy="402" r="182" fill="rgba(255,255,255,0.03)" />
      <circle cx="452" cy="402" r="140" fill="rgba(212,165,111,0.16)" className="scene-pulse" />
      <path d="M252 402C320 334 392 318 452 262C520 322 590 336 652 402C588 468 514 482 452 542C386 482 312 464 252 402Z" fill="none" stroke={palette.primary} strokeWidth="12" />
      <rect x="914" y="142" width="150" height="106" rx="24" fill={`rgba(60,191,187,0.16)`} />
      <rect x="914" y="280" width="150" height="106" rx="24" fill={`rgba(212,165,111,0.16)`} />
      <rect x="914" y="418" width="150" height="106" rx="24" fill="rgba(255,255,255,0.06)" />
      <rect x="914" y="556" width="150" height="92" rx="22" fill="rgba(255,255,255,0.06)" />
      <rect x="154" y="128" width="260" height="18" rx="9" fill="rgba(255,255,255,0.14)" />
      <rect x="154" y="654" width="516" height="16" rx="8" fill="rgba(255,255,255,0.08)" className="scene-scan" />
    </>
  );
}
