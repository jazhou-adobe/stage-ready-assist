"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MetricsSample, PauseEvent } from "@/lib/types";

const chartTokens = {
  bg: "rgba(15, 18, 28, 0.55)",
  border: "rgba(255, 255, 255, 0.08)",
  grid: "rgba(255, 255, 255, 0.06)",
  axisText: "rgba(229, 231, 235, 0.55)",
  tooltipBg: "rgba(10, 12, 20, 0.92)",
  tooltipBorder: "rgba(255, 255, 255, 0.12)",
  wpm: "#7dd3fc",
  wpmGlow: "drop-shadow(0 0 6px rgba(125, 211, 252, 0.55))",
  vol: "#a78bfa",
  volGlow: "drop-shadow(0 0 6px rgba(167, 139, 250, 0.55))",
  pauseFill: "rgba(248, 113, 113, 0.18)",
  pauseStroke: "rgba(248, 113, 113, 0.5)",
  miniHeight: 160,
  fullHeight: 240,
  legendText: "rgba(229, 231, 235, 0.7)",
} as const;

const FRAME_MS = 100;

export type MetricsChartHandle = {
  onSnapshot: () => HTMLDivElement | null;
};

export type MetricsChartProps = {
  samples: MetricsSample[];
  pauses: PauseEvent[];
  maxWindowSec?: number;
  variant?: "mini" | "full";
  showLegend?: boolean;
  className?: string;
  style?: CSSProperties;
};

export const MetricsChart = forwardRef<MetricsChartHandle, MetricsChartProps>(
  function MetricsChart(
    {
      samples,
      pauses,
      maxWindowSec = 30,
      variant = "full",
      showLegend,
      className,
      style,
    },
    ref,
  ) {
    const outerRef = useRef<HTMLDivElement | null>(null);
    useImperativeHandle(
      ref,
      () => ({
        onSnapshot: () => outerRef.current,
      }),
      [],
    );

    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      setMounted(true);
    }, []);

    const isMini = variant === "mini";
    const lastT = samples.length > 0 ? samples[samples.length - 1].t : 0;
    const lastTBucket = Math.floor((lastT * 1000) / FRAME_MS);

    const windowed = useMemo(() => {
      const right = lastT > 0 ? lastT : maxWindowSec;
      const left = Math.max(0, right - maxWindowSec);
      const visibleSamples = samples.filter((s) => s.t >= left && s.t <= right);
      const visiblePauses = pauses.filter(
        (p) => p.end >= left && p.start <= right,
      );
      return { left, right, samples: visibleSamples, pauses: visiblePauses };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastTBucket, maxWindowSec]);

    const height = isMini ? chartTokens.miniHeight : chartTokens.fullHeight;
    const lineWidth = isMini ? 1.5 : 2;
    const showLegendResolved = showLegend ?? isMini;

    return (
      <div
        ref={outerRef}
        className={className}
        style={{
          background: chartTokens.bg,
          border: `1px solid ${chartTokens.border}`,
          borderRadius: 12,
          padding: isMini ? 8 : 12,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          ...style,
        }}
      >
        {showLegendResolved && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: chartTokens.legendText,
              paddingLeft: 2,
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 2,
                  background: chartTokens.wpm,
                  borderRadius: 2,
                  boxShadow: `0 0 6px ${chartTokens.wpm}`,
                }}
              />
              WPM
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 10,
                  height: 2,
                  background: chartTokens.vol,
                  borderRadius: 2,
                  boxShadow: `0 0 6px ${chartTokens.vol}`,
                }}
              />
              VOL
            </span>
          </div>
        )}

        <div style={{ width: "100%", height }}>
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
              data={windowed.samples}
              margin={
                isMini
                  ? { top: 6, right: 6, bottom: 6, left: 6 }
                  : { top: 12, right: 16, bottom: 20, left: 8 }
              }
            >
              {!isMini && (
                <CartesianGrid
                  stroke={chartTokens.grid}
                  strokeDasharray="3 3"
                  vertical={false}
                />
              )}
              <XAxis
                type="number"
                dataKey="t"
                domain={[windowed.left, windowed.right]}
                hide={isMini}
                stroke={chartTokens.axisText}
                tick={{ fill: chartTokens.axisText, fontSize: 11 }}
                tickFormatter={(v: number) => `${Math.round(v)}s`}
                allowDataOverflow
              />
              <YAxis
                yAxisId="vol"
                orientation="left"
                domain={[0, 1]}
                hide={isMini}
                stroke={chartTokens.axisText}
                tick={{ fill: chartTokens.axisText, fontSize: 11 }}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                width={36}
              />
              <YAxis
                yAxisId="wpm"
                orientation="right"
                domain={[0, 250]}
                hide={isMini}
                stroke={chartTokens.axisText}
                tick={{ fill: chartTokens.axisText, fontSize: 11 }}
                width={32}
              />
              {!isMini && (
                <Tooltip
                  cursor={{ stroke: chartTokens.axisText, strokeOpacity: 0.3 }}
                  contentStyle={{
                    background: chartTokens.tooltipBg,
                    border: `1px solid ${chartTokens.tooltipBorder}`,
                    borderRadius: 8,
                    fontSize: 12,
                    color: "rgba(229, 231, 235, 0.95)",
                  }}
                  labelFormatter={(v) =>
                    typeof v === "number" ? `${v.toFixed(1)}s` : ""
                  }
                  formatter={(value, name) => {
                    const numeric = typeof value === "number" ? value : 0;
                    return name === "volume"
                      ? [`${Math.round(numeric * 100)}%`, "Volume"]
                      : [`${Math.round(numeric)}`, "WPM"];
                  }}
                />
              )}
              {windowed.pauses.map((p, i) => (
                <ReferenceArea
                  key={`pause-${i}-${p.start}-${p.end}`}
                  yAxisId="vol"
                  x1={Math.max(p.start, windowed.left)}
                  x2={Math.min(p.end, windowed.right)}
                  y1={0}
                  y2={1}
                  fill={chartTokens.pauseFill}
                  stroke={chartTokens.pauseStroke}
                  strokeOpacity={0.6}
                  ifOverflow="hidden"
                />
              ))}
              <Line
                yAxisId="vol"
                type="monotone"
                dataKey="volume"
                stroke={chartTokens.vol}
                strokeWidth={lineWidth}
                dot={isMini ? { r: 1.5, fill: chartTokens.vol, stroke: "none" } : false}
                activeDot={{ r: 3, fill: chartTokens.vol, stroke: "none" }}
                isAnimationActive={false}
                style={{ filter: chartTokens.volGlow }}
              />
              <Line
                yAxisId="wpm"
                type="monotone"
                dataKey="wpm"
                stroke={chartTokens.wpm}
                strokeWidth={lineWidth}
                dot={isMini ? { r: 1.5, fill: chartTokens.wpm, stroke: "none" } : false}
                activeDot={{ r: 3, fill: chartTokens.wpm, stroke: "none" }}
                isAnimationActive={false}
                style={{ filter: chartTokens.wpmGlow }}
              />
              </LineChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    );
  },
);

export { chartTokens };
