import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Brain,
  Cpu,
  RefreshCw,
  TrendingUp,
  Activity,
  Layers,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  AnalyticsResponse,
  AnalyticsDailyEntry,
  AnalyticsModelEntry,
  AnalyticsSkillEntry,
} from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Button } from "@nous-research/ui/ui/components/button";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { PluginSlot } from "@/plugins";

const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

const CHART_HEIGHT_PX = 160;

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDate(day: string): string {
  try {
    const d = new Date(day + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return day;
  }
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function useTableSort<T>(
  data: T[],
  defaultKey: keyof T & string,
  defaultDir: "asc" | "desc" = "desc",
) {
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (aVal === bVal) return 0;
      const cmp = aVal > bVal ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const toggle = useCallback(
    (key: string) => {
      if (key === sortKey) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey],
  );

  return { sorted, sortKey, sortDir, toggle };
}

function SortHeader({
  label,
  col,
  sortKey,
  sortDir,
  toggle,
  className,
}: {
  label: string;
  col: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  toggle: (key: string) => void;
  className?: string;
}) {
  const active = col === sortKey;
  return (
    <th
      onClick={() => toggle(col)}
      className={`cursor-pointer select-none py-3 text-[0.72rem] tracking-wider uppercase font-semibold text-purple-400/50 ${className ?? ""}`}
    >
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-purple-500/10 hover:text-purple-300 transition-colors">
        {label}
        {active ? (
          sortDir === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 text-purple-300 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 text-purple-300 shrink-0" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-purple-500/30 shrink-0" />
        )}
      </span>
    </th>
  );
}

function TokenBarChart({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  if (daily.length === 0) return null;

  const maxTokens = Math.max(
    ...daily.map((d) => d.input_tokens + d.output_tokens),
    1,
  );

  return (
    <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
      <CardHeader className="px-0 pt-0 pb-4 mb-4 border-b border-purple-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <BarChart3 className="h-4.5 w-4.5" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-wide text-midground">
            {t.analytics.dailyTokenUsage.toUpperCase()}
          </CardTitle>
        </div>
        <div className="flex items-center gap-4 font-mono text-[0.72rem]">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-purple-300/70">{t.analytics.input}:</span>
            <span className="font-semibold text-purple-200">
              {formatTokens(daily.reduce((acc, curr) => acc + curr.input_tokens, 0))}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400/70">{t.analytics.output}:</span>
            <span className="font-semibold text-emerald-300">
              {formatTokens(daily.reduce((acc, curr) => acc + curr.output_tokens, 0))}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {/* Neon High-Precision Grid Columns */}
        <div
          className="relative flex items-end gap-[3px] sm:gap-[5px]"
          style={{ height: CHART_HEIGHT_PX }}
        >
          {/* horizontal background grid lines */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
            <div className="w-full border-t border-purple-500/25" />
            <div className="w-full border-t border-purple-500/15" />
            <div className="w-full border-t border-purple-500/10" />
            <div className="w-full border-b border-purple-500/25" />
          </div>

          {daily.map((d) => {
            const total = d.input_tokens + d.output_tokens;
            const inputH = Math.round(
              (d.input_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            const outputH = Math.round(
              (d.output_tokens / maxTokens) * CHART_HEIGHT_PX,
            );
            return (
              <div
                key={d.day}
                className="flex-1 min-w-[6px] group relative flex flex-col justify-end gap-[1px] z-10"
                style={{ height: CHART_HEIGHT_PX }}
              >
                {/* Floating Telemetry Info Overlay on Hover */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-50 pointer-events-none">
                  <div className="font-mono bg-black/90 border border-purple-500/30 rounded-xl px-3 py-2 text-[0.72rem] text-purple-200 shadow-[0_0_20px_rgba(168,85,247,0.3)] backdrop-blur-md min-w-[150px]">
                    <div className="font-bold border-b border-purple-500/20 pb-1 mb-1 text-purple-100 text-[0.75rem]">
                      {formatDate(d.day).toUpperCase()}
                    </div>
                    <div className="flex justify-between gap-2 mt-0.5">
                      <span className="text-purple-400">{t.analytics.input}:</span>
                      <span className="font-semibold text-purple-200">{formatTokens(d.input_tokens)}</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-0.5">
                      <span className="text-emerald-400">{t.analytics.output}:</span>
                      <span className="font-semibold text-emerald-300">{formatTokens(d.output_tokens)}</span>
                    </div>
                    <div className="flex justify-between gap-2 border-t border-purple-500/15 pt-1 mt-1 font-bold">
                      <span className="text-purple-300">{t.analytics.total}:</span>
                      <span className="text-white">{formatTokens(total)}</span>
                    </div>
                  </div>
                </div>

                {/* Input Tokens Glowing Amethyst Segment */}
                <div
                  className="w-full bg-gradient-to-t from-purple-600/80 to-purple-400/90 rounded-sm hover:brightness-125 transition-all shadow-[0_0_6px_rgba(168,85,247,0.2)]"
                  style={{ height: Math.max(inputH, total > 0 ? 1.5 : 0) }}
                />

                {/* Output Tokens Glowing Emerald Segment */}
                <div
                  className="w-full bg-gradient-to-t from-emerald-500/80 to-emerald-300/90 rounded-sm hover:brightness-125 transition-all shadow-[0_0_6px_rgba(52,211,153,0.2)]"
                  style={{
                    height: Math.max(outputH, d.output_tokens > 0 ? 1.5 : 0),
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between mt-3 font-mono text-[0.7rem] text-purple-400/40">
          <span>{daily.length > 0 ? formatDate(daily[0].day).toUpperCase() : ""}</span>
          {daily.length > 2 && (
            <span>{formatDate(daily[Math.floor(daily.length / 2)].day).toUpperCase()}</span>
          )}
          <span>
            {daily.length > 1 ? formatDate(daily[daily.length - 1].day).toUpperCase() : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DailyTable({ daily }: { daily: AnalyticsDailyEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(daily, "day", "desc");

  if (daily.length === 0) return null;

  return (
    <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
      <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <TrendingUp className="h-4.5 w-4.5" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-wide text-midground">
            {t.analytics.dailyBreakdown.toUpperCase()}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-purple-500/5 text-purple-400">
                <SortHeader label={t.analytics.date} col="day" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4" />
                <SortHeader label={t.sessions.title} col="sessions" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.input} col="input_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.output} col="output_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/5">
              {sorted.map((d) => (
                <tr
                  key={d.day}
                  className="hover:bg-purple-500/[0.03] transition-colors"
                >
                  <td className="py-3 pr-4 font-semibold text-purple-200">
                    {formatDate(d.day).toUpperCase()}
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300/60 font-semibold">
                    {d.sessions}
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300 font-semibold">
                    {formatTokens(d.input_tokens)}
                  </td>
                  <td className="text-right py-3 px-4 text-emerald-400 font-semibold">
                    {formatTokens(d.output_tokens)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ModelTable({ models }: { models: AnalyticsModelEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(models, "input_tokens", "desc");

  if (models.length === 0) return null;

  return (
    <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
      <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Cpu className="h-4.5 w-4.5" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-wide text-midground">
            {t.analytics.perModelBreakdown.toUpperCase()}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-purple-500/5 text-purple-400">
                <SortHeader label={t.analytics.model} col="model" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4" />
                <SortHeader label={t.sessions.title} col="sessions" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.tokens} col="input_tokens" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/5">
              {sorted.map((m) => (
                <tr
                  key={m.model}
                  className="hover:bg-purple-500/[0.03] transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-purple-200 break-all">{m.model}</span>
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300/60 font-semibold">
                    {m.sessions}
                  </td>
                  <td className="text-right py-3 pl-4 font-semibold">
                    <span className="text-purple-300">
                      {formatTokens(m.input_tokens)}
                    </span>
                    <span className="text-purple-500/40 mx-1">/</span>
                    <span className="text-emerald-400">
                      {formatTokens(m.output_tokens)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SkillTable({ skills }: { skills: AnalyticsSkillEntry[] }) {
  const { t } = useI18n();
  const { sorted, sortKey, sortDir, toggle } = useTableSort(skills, "total_count", "desc");

  if (skills.length === 0) return null;

  return (
    <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
      <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Brain className="h-4.5 w-4.5" />
          </div>
          <CardTitle className="text-sm font-semibold tracking-wide text-midground">
            {t.analytics.topSkills.toUpperCase()}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto scrollbar-none">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-purple-500/5 text-purple-400">
                <SortHeader label={t.analytics.skill} col="skill" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-left py-2 pr-4" />
                <SortHeader label={t.analytics.loads} col="view_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.edits} col="manage_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.total} col="total_count" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 px-4" />
                <SortHeader label={t.analytics.lastUsed} col="last_used_at" sortKey={sortKey} sortDir={sortDir} toggle={toggle} className="text-right py-2 pl-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/5">
              {sorted.map((skill) => (
                <tr
                  key={skill.skill}
                  className="hover:bg-purple-500/[0.03] transition-colors"
                >
                  <td className="py-3 pr-4">
                    <span className="font-semibold text-purple-200">{skill.skill}</span>
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300/60 font-semibold">
                    {skill.view_count}
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300/60 font-semibold">
                    {skill.manage_count}
                  </td>
                  <td className="text-right py-3 px-4 text-purple-300 font-bold">
                    {skill.total_count}
                  </td>
                  <td className="text-right py-3 pl-4 text-purple-400/50 font-semibold">
                    {skill.last_used_at ? timeAgo(skill.last_used_at) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTokenAnalytics, setShowTokenAnalytics] = useState(false);
  const { setEnd } = usePageHeader();
  const { t } = useI18n();

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => {
        const dash = (cfg?.dashboard ?? {}) as {
          show_token_analytics?: unknown;
        };
        setShowTokenAnalytics(dash.show_token_analytics === true);
      })
      .catch(() => setShowTokenAnalytics(false));
  }, []);

  useLayoutEffect(() => {
    if (!showTokenAnalytics) {
      setEnd(null);
      return;
    }
    // High-fidelity mechanical period selector switch in the header
    setEnd(
      <div className="flex items-center gap-1.5 p-0.5 rounded-lg border border-purple-500/10 bg-black/40 font-mono text-xs">
        {PERIODS.map((p) => {
          const active = p.days === days;
          return (
            <button
              key={p.days}
              onClick={() => setDays(p.days)}
              className={`px-3 py-1.5 rounded-md font-semibold tracking-wide uppercase transition-all duration-200 cursor-pointer ${
                active
                  ? "bg-purple-500/15 border border-purple-500/35 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.18)]"
                  : "text-purple-400/50 hover:text-purple-300 border border-transparent"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>,
    );
    return () => setEnd(null);
  }, [days, setEnd, showTokenAnalytics]);

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .getAnalytics(days)
      .then((resp) => {
        setData(resp);
      })
      .catch((err) => {
        setError(String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [days]);

  useEffect(() => {
    if (showTokenAnalytics) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [loadData, showTokenAnalytics]);

  if (!showTokenAnalytics) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 mb-4 border border-purple-500/20">
          <Activity className="h-6 w-6 animate-pulse" />
        </div>
        <h3 className="text-base font-semibold tracking-wide text-purple-100 mb-2">
          TOKEN ANALYTICS DISABLED
        </h3>
        <p className="text-xs text-purple-400/60 leading-relaxed font-mono">
          To view token costs, database load speeds, and real-time LLM metric charts, please set{" "}
          <code className="text-purple-300 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-500/10 font-bold">
            dashboard.show_token_analytics: true
          </code>{" "}
          inside your config.yaml and restart the system.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-purple-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-rose-500/25 bg-rose-500/[0.04] p-5 rounded-2xl max-w-lg mx-auto text-center flex flex-col items-center gap-3">
        <AlertTriangle className="h-8 w-8 text-rose-400 animate-bounce" />
        <h4 className="text-sm font-bold text-rose-300 uppercase tracking-widest">Telemetry Load Error</h4>
        <p className="text-xs text-rose-400/80 font-mono leading-relaxed">{error}</p>
        <Button
          outlined
          size="sm"
          onClick={loadData}
          prefix={<RefreshCw className="h-3.5 w-3.5" />}
          className="mt-2 hover:bg-rose-500/5 hover:border-rose-500/20 border-rose-500/10 text-rose-300 cursor-pointer"
        >
          {t.common.retry}
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const totalInput = data.daily.reduce((sum, d) => sum + d.input_tokens, 0);
  const totalOutput = data.daily.reduce((sum, d) => sum + d.output_tokens, 0);
  const totalSessions = data.daily.reduce((sum, d) => sum + d.sessions, 0);

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-5">
      <PluginSlot name="analytics:top" />

      {/* Main Aggregated Swarm stats cockpit readout */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border border-purple-500/10 bg-purple-950/[0.02] p-5 backdrop-blur-md shadow-2xl rounded-2xl flex flex-col gap-1 hover:border-purple-500/20 transition-all duration-300">
          <div className="flex justify-between items-center text-[0.68rem] tracking-wider uppercase font-semibold text-purple-400/50 font-mono mb-1">
            <span>Swarm Messages Volume</span>
            <Activity className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <span className="text-2xl font-bold text-purple-100 tracking-tight font-mono">
            {totalSessions}
          </span>
          <span className="text-[0.62rem] text-purple-400/40 font-mono mt-1">
            Active session queries processed
          </span>
        </Card>

        <Card className="border border-purple-500/10 bg-purple-950/[0.02] p-5 backdrop-blur-md shadow-2xl rounded-2xl flex flex-col gap-1 hover:border-purple-500/20 transition-all duration-300">
          <div className="flex justify-between items-center text-[0.68rem] tracking-wider uppercase font-semibold text-purple-400/50 font-mono mb-1">
            <span>Input Synthesis Load</span>
            <Layers className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <span className="text-2xl font-bold text-purple-100 tracking-tight font-mono">
            {formatTokens(totalInput)}
          </span>
          <span className="text-[0.62rem] text-purple-400/40 font-mono mt-1">
            Prompts and cognitive contexts loaded
          </span>
        </Card>

        <Card className="border border-purple-500/10 bg-purple-950/[0.02] p-5 backdrop-blur-md shadow-2xl rounded-2xl flex flex-col gap-1 hover:border-purple-500/20 transition-all duration-300">
          <div className="flex justify-between items-center text-[0.68rem] tracking-wider uppercase font-semibold text-purple-400/50 font-mono mb-1">
            <span>Cognitive Output Stream</span>
            <Brain className="h-3.5 w-3.5 text-purple-400" />
          </div>
          <span className="text-2xl font-bold text-emerald-400 tracking-tight font-mono">
            {formatTokens(totalOutput)}
          </span>
          <span className="text-[0.62rem] text-purple-400/40 font-mono mt-1">
            LLM generative tokens generated
          </span>
        </Card>
      </div>

      <TokenBarChart daily={data.daily} />

      <div className="grid gap-5 md:grid-cols-2">
        <DailyTable daily={data.daily} />
        <ModelTable models={data.by_model} />
      </div>

      <SkillTable skills={data.skills.top_skills} />

      <PluginSlot name="analytics:bottom" />
    </div>
  );
}
