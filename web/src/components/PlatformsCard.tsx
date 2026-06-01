import { AlertTriangle, Radio, Wifi, WifiOff } from "lucide-react";
import type { PlatformStatus } from "@/lib/api";
import { isoTimeAgo } from "@/lib/utils";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { useI18n } from "@/i18n";

export function PlatformsCard({ platforms }: PlatformsCardProps) {
  const { t } = useI18n();
  const platformStateBadge: Record<
    string,
    { tone: "success" | "warning" | "destructive"; label: string }
  > = {
    connected: { tone: "success", label: t.status.connected },
    disconnected: { tone: "warning", label: t.status.disconnected },
    fatal: { tone: "destructive", label: t.status.error },
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-current/10 bg-card p-5 backdrop-blur-md shadow-2xl">
      <div className="flex items-center justify-between border-b border-current/10 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Radio className="h-4.5 w-4.5 animate-pulse" />
          </div>
          <h3 className="font-semibold text-[0.95rem] tracking-wide text-midground">
            {t.status.connectedPlatforms}
          </h3>
        </div>
        <span className="text-[0.7rem] uppercase tracking-wider text-text-tertiary font-mono">
          Swarm Status: Active
        </span>
      </div>

      <div className="grid gap-3">
        {platforms.map(([name, info]) => {
          const display = platformStateBadge[info.state] ?? {
            tone: "outline" as const,
            label: info.state,
          };
          const IconComponent =
            info.state === "connected"
              ? Wifi
              : info.state === "fatal"
                ? AlertTriangle
                : WifiOff;

          return (
            <div
              key={name}
              className="group/item relative flex items-center justify-between gap-4 rounded-lg border border-current/5 bg-background-base/20 p-3.5 transition-all hover:bg-background-base/40 hover:border-current/15"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${
                  info.state === "connected"
                    ? "bg-success/10 text-success"
                    : info.state === "fatal"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning"
                }`}>
                  <IconComponent className="h-4.5 w-4.5 shrink-0" />
                </div>

                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-sm font-semibold capitalize text-midground">
                    {name}
                  </span>

                  {info.error_message ? (
                    <span className="text-xs text-destructive truncate">
                      {info.error_message}
                    </span>
                  ) : info.updated_at ? (
                    <span className="text-[0.72rem] text-text-tertiary">
                      {t.status.lastUpdate}: {isoTimeAgo(info.updated_at)}
                    </span>
                  ) : null}
                </div>
              </div>

              <Badge
                tone={display.tone}
                className="shrink-0 font-medium tracking-wide py-0.5 px-2 rounded text-[0.72rem]"
              >
                {display.tone === "success" && (
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                )}
                {display.label}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PlatformsCardProps {
  platforms: [string, PlatformStatus][];
}
