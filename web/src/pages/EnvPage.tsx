import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  MessageSquare,
  Pencil,
  Save,
  Settings,
  Trash2,
  X,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { EnvVarInfo } from "@/lib/api";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { Toast } from "@/components/Toast";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useToast } from "@/hooks/useToast";
import { OAuthProvidersCard } from "@/components/OAuthProvidersCard";
import { Button } from "@nous-research/ui/ui/components/button";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";

const PROVIDER_GROUPS: { prefix: string; name: string; priority: number }[] = [
  { prefix: "NOUS_", name: "Little Portal", priority: 0 },
  { prefix: "ANTHROPIC_", name: "Anthropic", priority: 1 },
  { prefix: "DASHSCOPE_", name: "DashScope (Qwen)", priority: 2 },
  { prefix: "LITTLE_QWEN_", name: "DashScope (Qwen)", priority: 2 },
  { prefix: "DEEPSEEK_", name: "DeepSeek", priority: 3 },
  { prefix: "GOOGLE_", name: "Gemini", priority: 4 },
  { prefix: "GEMINI_", name: "Gemini", priority: 4 },
  { prefix: "GLM_", name: "GLM / Z.AI", priority: 5 },
  { prefix: "ZAI_", name: "GLM / Z.AI", priority: 5 },
  { prefix: "Z_AI_", name: "GLM / Z.AI", priority: 5 },
  { prefix: "HF_", name: "Hugging Face", priority: 6 },
  { prefix: "KIMI_", name: "Kimi / Moonshot", priority: 7 },
  { prefix: "MINIMAX_CN_", name: "MiniMax (China)", priority: 9 },
  { prefix: "MINIMAX_", name: "MiniMax", priority: 8 },
  { prefix: "OPENCODE_GO_", name: "OpenCode Go", priority: 10 },
  { prefix: "OPENCODE_ZEN_", name: "OpenCode Zen", priority: 11 },
  { prefix: "OPENROUTER_", name: "OpenRouter", priority: 12 },
  { prefix: "XIAOMI_", name: "Xiaomi MiMo", priority: 13 },
];

function getProviderGroup(key: string): string {
  for (const g of PROVIDER_GROUPS) {
    if (key.startsWith(g.prefix)) return g.name;
  }
  return "Other";
}

function getProviderPriority(groupName: string): number {
  const entry = PROVIDER_GROUPS.find((g) => g.name === groupName);
  return entry?.priority ?? 99;
}

interface ProviderGroup {
  name: string;
  priority: number;
  entries: [string, EnvVarInfo][];
  hasAnySet: boolean;
}

const CATEGORY_META_ICONS: Record<string, typeof KeyRound> = {
  provider: Zap,
  tool: KeyRound,
  messaging: MessageSquare,
  setting: Settings,
};

function EnvVarRow({
  varKey,
  info,
  edits,
  setEdits,
  revealed,
  saving,
  onSave,
  onClear,
  onReveal,
  onCancelEdit,
  clearDialogOpen = false,
  compact = false,
}: {
  varKey: string;
  info: EnvVarInfo;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  revealed: Record<string, string>;
  saving: string | null;
  onSave: (key: string) => void;
  onClear: (key: string) => void;
  onReveal: (key: string) => void;
  onCancelEdit: (key: string) => void;
  clearDialogOpen?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const isEditing = edits[varKey] !== undefined;
  const isRevealed = !!revealed[varKey];
  const displayValue = isRevealed
    ? revealed[varKey]
    : (info.redacted_value ?? "---");

  if (compact && !info.is_set && !isEditing) {
    return (
      <div className="flex items-center justify-between gap-3 py-2 border-b border-purple-500/5 first:pt-0 last:border-b-0 min-w-0 overflow-hidden text-purple-300/70 hover:text-purple-200 transition-colors">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono text-xs font-semibold tracking-wide text-purple-300">
            {varKey}
          </span>
          <span className="text-[0.7rem] text-purple-400/40 truncate hidden sm:block font-mono">
            {info.description}
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {info.url && (
            <a
              href={info.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[0.7rem] text-purple-400 hover:text-purple-200 transition-colors font-mono"
            >
              {t.env.getKey} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <Button
            size="sm"
            outlined
            className="font-mono text-[0.7rem] cursor-pointer hover:bg-purple-500/10"
            prefix={<Pencil className="h-3 w-3" />}
            onClick={() => setEdits((prev) => ({ ...prev, [varKey]: "" }))}
          >
            {t.common.set.toUpperCase()}
          </Button>
        </div>
      </div>
    );
  }

  if (!info.is_set && !isEditing) {
    return (
      <div className="flex items-center justify-between gap-3 border border-purple-500/10 bg-purple-950/[0.01] rounded-xl px-4 py-3 min-w-0 overflow-hidden text-purple-300/70 hover:text-purple-200 hover:border-purple-500/20 transition-all shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Label className="font-mono text-xs font-bold text-purple-300 cursor-default">
            {varKey}
          </Label>
          <span className="text-[0.72rem] text-purple-400/40 truncate hidden sm:block font-mono">
            {info.description}
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {info.url && (
            <a
              href={info.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[0.72rem] text-purple-400 hover:text-purple-200 transition-colors font-mono"
            >
              {t.env.getKey} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <Button
            size="sm"
            outlined
            className="font-mono text-[0.72rem] cursor-pointer hover:bg-purple-500/10"
            prefix={<Pencil className="h-3.5 w-3.5" />}
            onClick={() => setEdits((prev) => ({ ...prev, [varKey]: "" }))}
          >
            {t.common.set.toUpperCase()}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 border border-purple-500/15 bg-purple-950/[0.02] p-4.5 rounded-xl min-w-0 overflow-hidden shadow-md">
      <div className="flex items-center justify-between gap-2.5 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="font-mono text-xs font-bold text-purple-200 cursor-default">{varKey}</Label>
          <Badge tone={info.is_set ? "success" : "outline"} className="text-[0.68rem] tracking-wide font-mono px-1.5 py-0">
            {info.is_set ? t.common.set.toUpperCase() : t.env.notSet.toUpperCase()}
          </Badge>
        </div>
        {info.url && (
          <a
            href={info.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[0.72rem] text-purple-400 hover:text-purple-200 transition-colors font-mono"
          >
            {t.env.getKey} <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      <p className="text-[0.72rem] text-purple-400/60 font-mono leading-relaxed">{info.description}</p>

      {info.tools.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {info.tools.map((tool) => (
            <Badge
              key={tool}
              tone="secondary"
              className="text-[0.65rem] py-0 px-2 font-mono bg-purple-500/10 border-purple-500/20 text-purple-300"
            >
              {tool}
            </Badge>
          ))}
        </div>
      )}

      {!isEditing && (
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <div
            className={`flex-1 border border-purple-500/10 px-3 py-2 font-mono text-xs rounded-lg select-all leading-none ${
              isRevealed
                ? "bg-black/60 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.15)]"
                : "bg-purple-950/20 text-purple-400/50"
            }`}
          >
            {info.is_set ? displayValue : "---"}
          </div>

          <div className="flex items-center gap-1.5 ml-auto sm:ml-0 shrink-0">
            {info.is_set && (
              <Button
                ghost
                size="icon"
                className="text-purple-300 hover:text-purple-100 hover:bg-purple-500/10 rounded-md cursor-pointer"
                onClick={() => onReveal(varKey)}
                title={isRevealed ? t.env.hideValue : t.env.showValue}
                aria-label={isRevealed ? `Hide ${varKey}` : `Reveal ${varKey}`}
              >
                {isRevealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            )}

            <Button
              size="sm"
              outlined
              className="font-mono text-[0.72rem] cursor-pointer hover:bg-purple-500/10"
              prefix={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setEdits((prev) => ({ ...prev, [varKey]: "" }))}
            >
              {info.is_set ? t.common.replace.toUpperCase() : t.common.set.toUpperCase()}
            </Button>

            {info.is_set && (
              <Button
                size="sm"
                outlined
                destructive
                className="font-mono text-[0.72rem] cursor-pointer hover:bg-rose-500/10 border-rose-500/10 text-rose-300"
                prefix={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => onClear(varKey)}
                disabled={saving === varKey || clearDialogOpen}
              >
                {saving === varKey ? "..." : t.common.clear.toUpperCase()}
              </Button>
            )}
          </div>
        </div>
      )}

      {isEditing && (
        <div className="flex items-center gap-2 w-full">
          <Input
            autoFocus
            type="text"
            value={edits[varKey]}
            onChange={(e) =>
              setEdits((prev) => ({ ...prev, [varKey]: e.target.value }))
            }
            placeholder={
              info.is_set
                ? t.env.replaceCurrentValue.replace(
                    "{preview}",
                    info.redacted_value ?? "---",
                  )
                : t.env.enterValue
            }
            className="flex-1 font-mono text-xs h-9 bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 placeholder:text-purple-400/25 focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
          />
          <Button
            size="sm"
            className="font-mono text-[0.72rem] cursor-pointer bg-primary text-white"
            onClick={() => onSave(varKey)}
            prefix={<Save className="h-3.5 w-3.5" />}
            disabled={saving === varKey || !edits[varKey]}
          >
            {saving === varKey ? "..." : t.common.save.toUpperCase()}
          </Button>
          <Button
            size="sm"
            outlined
            className="font-mono text-[0.72rem] cursor-pointer hover:bg-purple-500/10 text-purple-300"
            prefix={<X className="h-3.5 w-3.5" />}
            onClick={() => onCancelEdit(varKey)}
          >
            {t.common.cancel.toUpperCase()}
          </Button>
        </div>
      )}
    </div>
  );
}

function ProviderGroupCard({
  group,
  edits,
  setEdits,
  revealed,
  saving,
  onSave,
  onClear,
  onReveal,
  onCancelEdit,
  clearDialogOpen = false,
}: {
  group: ProviderGroup;
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  revealed: Record<string, string>;
  saving: string | null;
  onSave: (key: string) => void;
  onClear: (key: string) => void;
  onReveal: (key: string) => void;
  onCancelEdit: (key: string) => void;
  clearDialogOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();

  const apiKeys = group.entries.filter(
    ([k]) => k.endsWith("_API_KEY") || k.endsWith("_TOKEN"),
  );
  const baseUrls = group.entries.filter(([k]) => k.endsWith("_BASE_URL"));
  const other = group.entries.filter(
    ([k]) =>
      !k.endsWith("_API_KEY") &&
      !k.endsWith("_TOKEN") &&
      !k.endsWith("_BASE_URL"),
  );
  const hasAnyConfigured = group.entries.some(([, info]) => info.is_set);
  const configuredCount = group.entries.filter(
    ([, info]) => info.is_set,
  ).length;

  const keyUrl = apiKeys.find(([, info]) => info.url)?.[1]?.url ?? null;

  return (
    <div className="border-b border-purple-500/5 last:border-b-0">
      <ListItem
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`justify-between gap-3 px-4 py-3 cursor-pointer transition-all ${
          expanded ? "bg-purple-500/[0.04]" : "hover:bg-purple-500/[0.02]"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-purple-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-purple-400 shrink-0" />
          )}
          <span className="font-semibold text-xs tracking-wider uppercase text-purple-100 font-mono">
            {group.name === "Other" ? t.common.other : group.name}
          </span>
          {hasAnyConfigured && (
            <Badge tone="success" className="text-[0.65rem] tracking-wide font-mono px-2 py-0">
              {configuredCount} {t.common.set.toUpperCase()}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3.5 shrink-0 font-mono text-[0.7rem] text-purple-400/60">
          {keyUrl && (
            <a
              href={keyUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[0.72rem] text-purple-400 hover:text-purple-200 transition-colors font-semibold"
              onClick={(e) => e.stopPropagation()}
            >
              {t.env.getKey} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
          <span className="hidden sm:block">
            {t.env.keysCount
              .replace("{count}", String(group.entries.length))
              .replace("{s}", group.entries.length !== 1 ? "s" : "")}
          </span>
        </div>
      </ListItem>

      {expanded && (
        <div className="border-t border-purple-500/5 px-4.5 py-4.5 bg-black/10 grid gap-3">
          {apiKeys.map(([key, info]) => (
            <EnvVarRow
              key={key}
              varKey={key}
              info={info}
              compact
              edits={edits}
              setEdits={setEdits}
              revealed={revealed}
              saving={saving}
              onSave={onSave}
              onClear={onClear}
              onReveal={onReveal}
              onCancelEdit={onCancelEdit}
              clearDialogOpen={clearDialogOpen}
            />
          ))}

          {baseUrls.map(([key, info]) => (
            <EnvVarRow
              key={key}
              varKey={key}
              info={info}
              compact
              edits={edits}
              setEdits={setEdits}
              revealed={revealed}
              saving={saving}
              onSave={onSave}
              onClear={onClear}
              onReveal={onReveal}
              onCancelEdit={onCancelEdit}
              clearDialogOpen={clearDialogOpen}
            />
          ))}

          {other.map(([key, info]) => (
            <EnvVarRow
              key={key}
              varKey={key}
              info={info}
              compact
              edits={edits}
              setEdits={setEdits}
              revealed={revealed}
              saving={saving}
              onSave={onSave}
              onClear={onClear}
              onReveal={onReveal}
              onCancelEdit={onCancelEdit}
              clearDialogOpen={clearDialogOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function EnvPage() {
  const [vars, setVars] = useState<Record<string, EnvVarInfo> | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(true);
  const { toast, showToast } = useToast();
  const { t } = useI18n();
  const { setAfterTitle } = usePageHeader();

  useEffect(() => {
    api
      .getEnvVars()
      .then(setVars)
      .catch(() => {});
  }, []);

  const sections = useMemo(() => {
    const items: { id: string; label: string }[] = [
      { id: "section-oauth", label: "OAUTH" },
      { id: "section-providers", label: "PROVIDERS" },
    ];
    if (vars) {
      const categories = ["tool", "messaging", "setting"];
      const CATEGORY_LABELS: Record<string, string> = {
        tool: "TOOLS",
        messaging: "MESSAGING",
        setting: "SETTINGS",
      };
      for (const cat of categories) {
        const hasEntries = Object.values(vars).some(
          (info) => info.category === cat,
        );
        if (hasEntries) {
          items.push({ id: `section-${cat}`, label: CATEGORY_LABELS[cat] ?? cat });
        }
      }
    }
    return items;
  }, [vars]);

  useLayoutEffect(() => {
    if (!vars) {
      setAfterTitle(null);
      return;
    }
    const scrollTo = (id: string) => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    setAfterTitle(
      <nav
        className="flex shrink-0 flex-nowrap items-center gap-1.5 bg-black/40 border border-purple-500/10 p-0.5 rounded-lg font-mono text-[0.7rem]"
        aria-label="Jump to section"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollTo(s.id)}
            className="shrink-0 cursor-pointer px-2.5 py-1.5 font-semibold text-purple-400/50 hover:text-purple-300 rounded border border-transparent hover:bg-purple-500/5 transition-all"
          >
            {s.label}
          </button>
        ))}
      </nav>,
    );
    return () => {
      setAfterTitle(null);
    };
  }, [vars, sections, setAfterTitle]);

  const handleSave = async (key: string) => {
    const value = edits[key];
    if (!value) return;
    setSaving(key);
    try {
      await api.setEnvVar(key, value);
      setVars((prev) =>
        prev
          ? {
              ...prev,
              [key]: {
                ...prev[key],
                is_set: true,
                redacted_value: value.slice(0, 4) + "..." + value.slice(-4),
              },
            }
          : prev,
      );
      setEdits((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      setRevealed((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      showToast(`${key} ${t.common.save.toLowerCase()}d`, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave} ${key}: ${e}`, "error");
    } finally {
      setSaving(null);
    }
  };

  const keyClear = useConfirmDelete({
    onDelete: useCallback(
      async (key: string) => {
        setSaving(key);
        try {
          await api.deleteEnvVar(key);
          setVars((prev) =>
            prev
              ? {
                  ...prev,
                  [key]: { ...prev[key], is_set: false, redacted_value: null },
                }
              : prev,
          );
          setEdits((prev) => {
            const n = { ...prev };
            delete n[key];
            return n;
          });
          setRevealed((prev) => {
            const n = { ...prev };
            delete n[key];
            return n;
          });
          showToast(`${key} ${t.common.removed}`, "success");
        } catch (e) {
          showToast(`${t.common.failedToRemove} ${key}: ${e}`, "error");
          throw e;
        } finally {
          setSaving(null);
        }
      },
      [showToast, t.common.removed, t.common.failedToRemove],
    ),
  });

  const handleReveal = async (key: string) => {
    if (revealed[key]) {
      setRevealed((prev) => {
        const n = { ...prev };
        delete n[key];
        return n;
      });
      return;
    }
    try {
      const resp = await api.revealEnvVar(key);
      setRevealed((prev) => ({ ...prev, [key]: resp.value }));
    } catch {
      showToast(`${t.common.failedToReveal} ${key}`, "error");
    }
  };

  const cancelEdit = (key: string) => {
    setEdits((prev) => {
      const n = { ...prev };
      delete n[key];
      return n;
    });
  };

  const { providerGroups, nonProviderGrouped } = useMemo(() => {
    if (!vars) return { providerGroups: [], nonProviderGrouped: [] };

    const providerEntries = Object.entries(vars).filter(
      ([, info]) =>
        info.category === "provider" && (showAdvanced || !info.advanced),
    );

    const groupMap = new Map<string, [string, EnvVarInfo][]>();
    for (const entry of providerEntries) {
      const groupName = getProviderGroup(entry[0]);
      if (!groupMap.has(groupName)) groupMap.set(groupName, []);
      groupMap.get(groupName)!.push(entry);
    }

    const groups: ProviderGroup[] = Array.from(groupMap.entries())
      .map(([name, entries]) => ({
        name,
        priority: getProviderPriority(name),
        entries,
        hasAnySet: entries.some(([, info]) => info.is_set),
      }))
      .sort((a, b) => a.priority - b.priority);

    const CATEGORY_META_LABELS: Record<string, string> = {
      tool: t.app.nav.keys,
      messaging: t.common.messaging,
      setting: t.app.nav.config,
    };
    const otherCategories = ["tool", "messaging", "setting"];
    const nonProvider = otherCategories.map((cat) => {
      const entries = Object.entries(vars).filter(
        ([, info]) => info.category === cat && (showAdvanced || !info.advanced),
      );
      const setEntries = entries.filter(([, info]) => info.is_set);
      const unsetEntries = entries.filter(([, info]) => !info.is_set);
      return {
        label: CATEGORY_META_LABELS[cat] ?? cat,
        icon: CATEGORY_META_ICONS[cat] ?? KeyRound,
        category: cat,
        setEntries,
        unsetEntries,
        totalEntries: entries.length,
      };
    });

    return { providerGroups: groups, nonProviderGrouped: nonProvider };
  }, [vars, showAdvanced, t]);

  if (!vars) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-purple-400" />
      </div>
    );
  }

  const totalProviders = providerGroups.length;
  const configuredProviders = providerGroups.filter((g) => g.hasAnySet).length;

  const pendingClearKey = keyClear.pendingId;
  const pendingKeyDescription =
    pendingClearKey && vars ? vars[pendingClearKey]?.description : undefined;

  return (
    <div className="flex flex-col gap-5">
      <PluginSlot name="env:top" />
      <Toast toast={toast} />

      <DeleteConfirmDialog
        open={keyClear.isOpen}
        onCancel={keyClear.cancel}
        onConfirm={keyClear.confirm}
        title={t.env.confirmClearTitle}
        description={
          pendingClearKey
            ? `${pendingClearKey}${pendingKeyDescription ? ` — ${pendingKeyDescription}` : ""}. ${t.env.confirmClearMessage}`
            : t.env.confirmClearMessage
        }
        loading={keyClear.isDeleting}
      />

      <div className="flex items-center justify-between bg-purple-950/[0.02] border border-purple-500/10 p-3 rounded-xl shadow-md backdrop-blur-sm">
        <div className="flex flex-col gap-0.5">
          <p className="text-[0.72rem] text-purple-300/80 font-mono">
            {t.env.description} <code className="bg-black/40 px-1 py-0.5 rounded border border-purple-500/10 text-purple-200">~/.little/.env</code>
          </p>
          <p className="text-[0.65rem] text-purple-400/40 font-mono">
            {t.env.changesNote}
          </p>
        </div>
        <Button
          size="sm"
          outlined
          className="font-mono text-xs cursor-pointer hover:bg-purple-500/10"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? t.env.hideAdvanced.toUpperCase() : t.env.showAdvanced.toUpperCase()}
        </Button>
      </div>

      <div id="section-oauth">
        <OAuthProvidersCard
          onError={(msg) => showToast(msg, "error")}
          onSuccess={(msg) => showToast(msg, "success")}
        />
      </div>

      <Card id="section-providers" className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
        <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Zap className="h-4.5 w-4.5" />
            </div>
            <CardTitle className="text-sm font-semibold tracking-wide text-midground">
              {t.env.llmProviders.toUpperCase()}
            </CardTitle>
          </div>
          <CardDescription className="text-xs text-purple-400/60 font-mono mt-1">
            {t.env.providersConfigured
              .replace("{configured}", String(configuredProviders))
              .replace("{total}", String(totalProviders))}
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-0 p-0 overflow-hidden bg-black/10 rounded-xl border border-purple-500/5">
          {providerGroups.map((group) => (
            <ProviderGroupCard
              key={group.name}
              group={group}
              edits={edits}
              setEdits={setEdits}
              revealed={revealed}
              saving={saving}
              onSave={handleSave}
              onClear={keyClear.requestDelete}
              onReveal={handleReveal}
              onCancelEdit={cancelEdit}
              clearDialogOpen={keyClear.isOpen}
            />
          ))}
        </CardContent>
      </Card>

      {nonProviderGrouped.map((section) => {
        if (section.totalEntries === 0) return null;

        return (
          <EnvCategoryCard
            key={section.category}
            section={section}
            edits={edits}
            setEdits={setEdits}
            revealed={revealed}
            saving={saving}
            onSave={handleSave}
            onClear={keyClear.requestDelete}
            onReveal={handleReveal}
            onCancelEdit={cancelEdit}
            clearDialogOpen={keyClear.isOpen}
          />
        );
      })}
      <PluginSlot name="env:bottom" />
    </div>
  );
}

function EnvCategoryCard({
  section,
  edits,
  setEdits,
  revealed,
  saving,
  onSave,
  onClear,
  onReveal,
  onCancelEdit,
  clearDialogOpen = false,
}: {
  section: {
    category: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    setEntries: [string, EnvVarInfo][];
    totalEntries: number;
    unsetEntries: [string, EnvVarInfo][];
  };
  edits: Record<string, string>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  revealed: Record<string, string>;
  saving: string | null;
  onSave: (key: string) => void;
  onClear: (key: string) => void;
  onReveal: (key: string) => void;
  onCancelEdit: (key: string) => void;
  clearDialogOpen?: boolean;
}) {
  const noneConfigured = section.setEntries.length === 0;
  const [showAll, setShowAll] = useState(noneConfigured);
  const { t } = useI18n();
  const Icon = section.icon;
  const hasContent = section.setEntries.length > 0 || showAll;
  const rowProps = {
    edits,
    setEdits,
    revealed,
    saving,
    onSave,
    onClear,
    onReveal,
    onCancelEdit,
    clearDialogOpen,
  };

  return (
    <Card id={`section-${section.category}`} className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
      <CardHeader
        className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <CardTitle className="text-sm font-semibold tracking-wide text-midground">{section.label.toUpperCase()}</CardTitle>
          </div>

          {section.unsetEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              aria-expanded={showAll}
              className="shrink-0 cursor-pointer border-0 bg-transparent p-0 font-mono text-[0.68rem] tracking-wider text-purple-400 hover:text-purple-200 transition-colors uppercase font-bold"
            >
              {showAll ? t.env.showLess.toUpperCase() : t.env.showMore.toUpperCase()}
            </button>
          )}
        </div>

        <CardDescription className="text-xs text-purple-400/60 font-mono mt-1">
          {section.setEntries.length} {t.common.of} {section.totalEntries}{" "}
          {t.common.configured}
        </CardDescription>
      </CardHeader>

      {hasContent && (
        <CardContent className="grid gap-3 overflow-hidden px-0 pb-0 pt-1">
          {section.setEntries.map(([key, info]) => (
            <EnvVarRow key={key} varKey={key} info={info} {...rowProps} />
          ))}

          {showAll &&
            section.unsetEntries.map(([key, info]) => (
              <EnvVarRow key={key} varKey={key} info={info} {...rowProps} />
            ))}
        </CardContent>
      )}
    </Card>
  );
}
