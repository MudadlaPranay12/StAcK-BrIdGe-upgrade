// Dependency-free SVG charts. Small, responsive and interactive enough for the
// console without pulling in a charting library (none is installed).

import { useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { formatNumber } from '../../lib/utils';

export interface ChartDatum {
  label: string;
  value: number;
}

const LINE_W = 620;
const LINE_H = 230;
const PAD = { top: 16, right: 16, bottom: 28, left: 46 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

interface LineAreaChartProps {
  data: ChartDatum[];
  height?: number;
  valueFormat?: (value: number) => string;
  ariaLabel?: string;
}

/** Interactive area+line chart with hover tooltip and value axis. */
export function LineAreaChart({ data, valueFormat = formatNumber, ariaLabel }: LineAreaChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...data.map((point) => point.value)));
  const plotW = LINE_W - PAD.left - PAD.right;
  const plotH = LINE_H - PAD.top - PAD.bottom;
  const step = data.length > 1 ? plotW / (data.length - 1) : 0;

  const coords = data.map((point, index) => ({
    x: PAD.left + index * step,
    y: PAD.top + plotH * (1 - point.value / max),
  }));

  const linePath = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const areaPath = coords.length
    ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${PAD.top + plotH} L ${coords[0]!.x.toFixed(1)} ${PAD.top + plotH} Z`
    : '';

  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  function handleMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * LINE_W;
    const index = Math.round((relativeX - PAD.left) / (step || 1));
    setHover(Math.max(0, Math.min(data.length - 1, index)));
  }

  const containerWidth = wrapRef.current?.clientWidth ?? LINE_W;
  const active = hover !== null ? data[hover] : null;
  const activeCoord = hover !== null ? coords[hover] : null;

  return (
    <div className="chart-shell" ref={wrapRef}>
      <svg className="chart chart-svg" viewBox={`0 0 ${LINE_W} ${LINE_H}`} role="img" aria-label={ariaLabel ?? 'Trend chart'} onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = PAD.top + (plotH * tick) / 4;
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={PAD.left} x2={LINE_W - PAD.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={PAD.left - 8} y={y + 3} textAnchor="end">
                {valueFormat(Math.round((max * (4 - tick)) / 4))}
              </text>
            </g>
          );
        })}
        {areaPath ? <path className="chart-area" d={areaPath} /> : null}
        {linePath ? <path className="chart-line" d={linePath} /> : null}
        {data.map((point, index) =>
          index % labelEvery === 0 ? (
            <text key={point.label} className="chart-axis-label" x={coords[index]!.x} y={LINE_H - 8} textAnchor="middle">
              {point.label}
            </text>
          ) : null
        )}
        {activeCoord ? <circle className="chart-dot" cx={activeCoord.x} cy={activeCoord.y} r={4} /> : null}
      </svg>
      {active && activeCoord ? (
        <div className="chart-tooltip" style={{ left: (activeCoord.x / LINE_W) * containerWidth, top: (activeCoord.y / LINE_H) * (containerWidth * (LINE_H / LINE_W)) }}>
          <strong>{active.label}</strong>
          <div>{valueFormat(active.value)}</div>
        </div>
      ) : null}
    </div>
  );
}

const BAR_W = 620;
const BAR_H = 220;
const BAR_PAD = { top: 14, right: 12, bottom: 30, left: 46 };

export function BarChart({ data, valueFormat = formatNumber }: { data: ChartDatum[]; valueFormat?: (value: number) => string }) {
  const max = niceMax(Math.max(1, ...data.map((point) => point.value)));
  const plotW = BAR_W - BAR_PAD.left - BAR_PAD.right;
  const plotH = BAR_H - BAR_PAD.top - BAR_PAD.bottom;
  const slot = plotW / Math.max(1, data.length);
  const barWidth = Math.min(34, slot * 0.6);

  return (
    <svg className="chart chart-svg" viewBox={`0 0 ${BAR_W} ${BAR_H}`} role="img" aria-label="Bar chart">
      {[0, 1, 2, 3, 4].map((tick) => {
        const y = BAR_PAD.top + (plotH * tick) / 4;
        return (
          <g key={tick}>
            <line className="chart-grid-line" x1={BAR_PAD.left} x2={BAR_W - BAR_PAD.right} y1={y} y2={y} />
            <text className="chart-axis-label" x={BAR_PAD.left - 8} y={y + 3} textAnchor="end">
              {valueFormat(Math.round((max * (4 - tick)) / 4))}
            </text>
          </g>
        );
      })}
      {data.map((point, index) => {
        const height = (point.value / max) * plotH;
        const x = BAR_PAD.left + index * slot + (slot - barWidth) / 2;
        const y = BAR_PAD.top + plotH - height;
        return (
          <g key={point.label}>
            <rect className="chart-bar" x={x} y={y} width={barWidth} height={Math.max(1, height)} rx={4} />
            <text className="chart-axis-label" x={x + barWidth / 2} y={BAR_H - 10} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/** Donut with a legend rendered by the caller-friendly legend list. */
export function Donut({ slices, centerLabel, centerValue, valueFormat = formatNumber }: { slices: DonutSlice[]; centerLabel: string; centerValue: string; valueFormat?: (value: number) => string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg className="donut chart-svg" width={150} height={150} viewBox="0 0 140 140" role="img" aria-label={centerLabel}>
        <g transform="rotate(-90 70 70)">
          {slices.map((slice) => {
            const length = (slice.value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const element = (
              <circle
                key={slice.label}
                cx={70}
                cy={70}
                r={radius}
                fill="none"
                stroke={slice.color}
                strokeWidth={16}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += length;
            return element;
          })}
        </g>
        <text className="donut-center-value" x={70} y={67} textAnchor="middle">
          {centerValue}
        </text>
        <text className="donut-center-label" x={70} y={83} textAnchor="middle">
          {centerLabel}
        </text>
      </svg>
      <div className="legend-list">
        {slices.map((slice) => (
          <div className="legend-row" key={slice.label}>
            <span className="legend-swatch" style={{ background: slice.color }} />
            <span className="legend-name">{slice.label}</span>
            <span className="legend-value">{valueFormat(slice.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Sparkline({ data, width = 108, height = 30, color = 'var(--brand)' }: { data: number[]; width?: number; height?: number; color?: string }): ReactNode {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const path = data.map((value, index) => `${index === 0 ? 'M' : 'L'} ${(index * step).toFixed(1)} ${(height - ((value - min) / range) * height).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
