import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import {
  Code,
  Download,
  FormInput,
  RotateCcw,
  Search,
  Upload,
  X,
  Settings2,
  FileText,
  Settings,
  Bot,
  Monitor,
  Palette,
  Users,
  Brain,
  Package,
  Lock,
  Globe,
  Mic,
  Volume2,
  Ear,
  ClipboardList,
  MessageCircle,
  Wrench,
  FileQuestion,
  Filter,
  Cloud,
  Sparkles,
  LayoutDashboard,
  BookOpen,
  Route,
  History,
  Shield,
  FileOutput,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { getNestedValue, setNestedValue } from "@/lib/nested";
import { useToast } from "@/hooks/useToast";
import { Toast } from "@/components/Toast";
import { AutoField } from "@/components/AutoField";
import { Button } from "@nous-research/ui/ui/components/button";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";

const CATEGORY_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  general: Settings,
  agent: Bot,
  terminal: Monitor,
  display: Palette,
  delegation: Users,
  memory: Brain,
  compression: Package,
  security: Lock,
  browser: Globe,
  voice: Mic,
  tts: Volume2,
  stt: Ear,
  logging: ClipboardList,
  discord: MessageCircle,
  auxiliary: Wrench,
  bedrock: Cloud,
  curator: Sparkles,
  kanban: LayoutDashboard,
  model_catalog: BookOpen,
  openrouter: Route,
  sessions: History,
  tool_loop_guardrails: Shield,
  tool_output: FileOutput,
  updates: RefreshCw,
};

function CategoryIcon({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const Icon = CATEGORY_ICONS[category] ?? FileQuestion;
  return <Icon className={className ?? "h-4 w-4"} />;
}

export default function ConfigPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<Record<
    string,
    Record<string, unknown>
  > | null>(null);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<Record<string, unknown> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [yamlMode, setYamlMode] = useState(false);
  const [yamlText, setYamlText] = useState("");
  const [yamlLoading, setYamlLoading] = useState(false);
  const [yamlSaving, setYamlSaving] = useState(false);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [confirmReset, setConfirmReset] = useState(false);
  const { toast, showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();
  const { setEnd } = usePageHeader();

  useLayoutEffect(() => {
    if (!config || !schema) {
      setEnd(null);
      return;
    }
    setEnd(
      <div className="relative w-full min-w-0 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400/40" />
        <Input
          className="h-8.5 pl-9 pr-8 text-xs font-mono bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 placeholder:text-purple-400/30 focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
          placeholder={t.common.search}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <Button
            ghost
            size="xs"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-purple-400/60 hover:text-purple-100 hover:bg-purple-500/10 p-1 rounded cursor-pointer"
            onClick={() => setSearchQuery("")}
            aria-label={t.common.clear}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>,
    );
    return () => setEnd(null);
  }, [config, schema, searchQuery, setEnd, t.common.clear, t.common.search]);

  function prettyCategoryName(cat: string): string {
    const key = cat as keyof typeof t.config.categories;
    if (t.config.categories[key]) return t.config.categories[key];
    return cat.charAt(0).toUpperCase() + cat.slice(1);
  }

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(() => {});
    api
      .getSchema()
      .then((resp) => {
        setSchema(resp.fields as Record<string, Record<string, unknown>>);
        setCategoryOrder(resp.category_order ?? []);
      })
      .catch(() => {});
    api
      .getDefaults()
      .then(setDefaults)
      .catch(() => {});
    api
      .getStatus()
      .then((resp) => setConfigPath(resp.config_path))
      .catch(() => {});
  }, []);

  // Set active category when categories load
  useEffect(() => {
    if (categoryOrder.length > 0 && !activeCategory) {
      setActiveCategory(categoryOrder[0]);
    }
  }, [categoryOrder, activeCategory]);

  // Load YAML when switching to YAML mode
  useEffect(() => {
    if (yamlMode) {
      setYamlLoading(true);
      api
        .getConfigRaw()
        .then((resp) => setYamlText(resp.yaml))
        .catch(() => showToast(t.config.failedToLoadRaw, "error"))
        .finally(() => setYamlLoading(false));
    }
  }, [yamlMode]);

  /* ---- Categories ---- */
  const categories = useMemo(() => {
    if (!schema) return [];
    const allCats = [
      ...new Set(
        Object.values(schema).map((s) => String(s.category ?? "general")),
      ),
    ];
    const ordered = categoryOrder.filter((c) => allCats.includes(c));
    const extra = allCats.filter((c) => !categoryOrder.includes(c)).sort();
    return [...ordered, ...extra];
  }, [schema, categoryOrder]);

  /* ---- Category field counts ---- */
  const categoryCounts = useMemo(() => {
    if (!schema) return {};
    const counts: Record<string, number> = {};
    for (const s of Object.values(schema)) {
      const cat = String(s.category ?? "general");
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [schema]);

  /* ---- Search ---- */
  const isSearching = searchQuery.trim().length > 0;
  const lowerSearch = searchQuery.toLowerCase();

  const searchMatchedFields = useMemo(() => {
    if (!isSearching || !schema) return [];
    return Object.entries(schema).filter(([key, s]) => {
      const label = key.split(".").pop() ?? key;
      const humanLabel = label.replace(/_/g, " ");
      return (
        key.toLowerCase().includes(lowerSearch) ||
        humanLabel.toLowerCase().includes(lowerSearch) ||
        String(s.category ?? "")
          .toLowerCase()
          .includes(lowerSearch) ||
        String(s.description ?? "")
          .toLowerCase()
          .includes(lowerSearch)
      );
    });
  }, [isSearching, lowerSearch, schema]);

  /* ---- Active tab fields ---- */
  const activeFields = useMemo(() => {
    if (!schema || isSearching) return [];
    return Object.entries(schema).filter(
      ([, s]) => String(s.category ?? "general") === activeCategory,
    );
  }, [schema, activeCategory, isSearching]);

  /* ---- Handlers ---- */
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await api.saveConfig(config);
      showToast(t.config.configSaved, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleYamlSave = async () => {
    setYamlSaving(true);
    try {
      await api.saveConfigRaw(yamlText);
      showToast(t.config.yamlConfigSaved, "success");
      api
        .getConfig()
        .then(setConfig)
        .catch(() => {});
    } catch (e) {
      showToast(`${t.config.failedToSaveYaml}: ${e}`, "error");
    } finally {
      setYamlSaving(false);
    }
  };

  const handleReset = () => {
    if (!defaults || !config) return;
    const scopedFields = isSearching ? searchMatchedFields : activeFields;
    if (scopedFields.length === 0) return;
    setConfirmReset(true);
  };

  const executeReset = () => {
    if (!defaults || !config) return;
    setConfirmReset(false);
    const scopedFields = isSearching ? searchMatchedFields : activeFields;
    if (scopedFields.length === 0) return;
    const scopeLabel = isSearching
      ? t.config.searchResults
      : prettyCategoryName(activeCategory);
    let next: Record<string, unknown> = config;
    for (const [key] of scopedFields) {
      next = setNestedValue(next, key, getNestedValue(defaults, key));
    }
    setConfig(next);
    showToast(
      t.config.resetScopeToast.replace("{scope}", scopeLabel),
      "success",
    );
  };

  const handleExport = () => {
    if (!config) return;
    const blob = new Blob([JSON.stringify(config, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "little-config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string);
        setConfig(imported);
        showToast(t.config.configImported, "success");
      } catch {
        showToast(t.config.invalidJson, "error");
      }
    };
    reader.readAsText(file);
  };

  if (!config || !schema) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-purple-400" />
      </div>
    );
  }

  const renderFields = (
    fields: [string, Record<string, unknown>][],
    showCategory = false,
  ) => {
    let lastSection = "";
    let lastCat = "";
    return fields.map(([key, s]) => {
      const parts = key.split(".");
      const section = parts.length > 1 ? parts[0] : "";
      const cat = String(s.category ?? "general");
      const showCatBadge = showCategory && cat !== lastCat;
      const showSection =
        !showCategory &&
        section &&
        section !== lastSection &&
        section !== activeCategory;
      lastSection = section;
      lastCat = cat;

      return (
        <div key={key} className="relative group/field border border-purple-500/5 bg-purple-950/[0.01] rounded-xl p-4.5 transition-all hover:bg-purple-950/[0.03] hover:border-purple-500/10 shadow-sm flex flex-col gap-3">
          {showCatBadge && (
            <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-purple-500/10">
              <CategoryIcon
                category={cat}
                className="h-4 w-4 text-purple-400"
              />
              <span className="text-[0.7rem] uppercase font-bold tracking-wider text-purple-300 font-mono">
                {prettyCategoryName(cat).toUpperCase()}
              </span>
            </div>
          )}
          {showSection && (
            <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-purple-500/10">
              <span className="text-[0.7rem] uppercase font-bold tracking-wider text-purple-300 font-mono">
                {section.replace(/_/g, " ").toUpperCase()}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <AutoField
              schemaKey={key}
              schema={s}
              value={getNestedValue(config, key)}
              onChange={(v) => setConfig(setNestedValue(config, key, v))}
            />
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <PluginSlot name="config:top" />
      <Toast toast={toast} />

      {/* Floating titanium header control panel */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 bg-purple-950/[0.02] border border-purple-500/10 p-3 rounded-xl shadow-md backdrop-blur-sm">
        <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <Settings2 className="h-4.5 w-4.5" />
          </div>
          <code className="min-w-0 flex-1 break-words text-[0.72rem] text-purple-300 font-mono bg-black/40 border border-purple-500/10 px-2.5 py-1 rounded">
            {configPath ?? t.config.configPath}
          </code>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          <Button
            ghost
            size="icon"
            className="text-purple-300 hover:text-purple-100 hover:bg-purple-500/10 rounded-md cursor-pointer"
            onClick={handleExport}
            title={t.config.exportConfig}
            aria-label={t.config.exportConfig}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            ghost
            size="icon"
            className="text-purple-300 hover:text-purple-100 hover:bg-purple-500/10 rounded-md cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            title={t.config.importConfig}
            aria-label={t.config.importConfig}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          {!yamlMode &&
            (() => {
              const resetScopeLabel = isSearching
                ? t.config.searchResults
                : prettyCategoryName(activeCategory);
              const resetTitle = t.config.resetScopeTooltip.replace(
                "{scope}",
                resetScopeLabel,
              );
              return (
                <Button
                  ghost
                  size="icon"
                  className="text-purple-300 hover:text-rose-400 hover:bg-rose-500/10 rounded-md cursor-pointer"
                  onClick={handleReset}
                  title={resetTitle}
                  aria-label={resetTitle}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              );
            })()}

          <div className="w-px h-5 bg-purple-500/20 mx-1" />

          <Button
            size="sm"
            outlined={!yamlMode}
            className="font-mono text-xs cursor-pointer hover:bg-purple-500/10 transition-colors"
            onClick={() => setYamlMode(!yamlMode)}
            prefix={yamlMode ? <FormInput className="h-3.5 w-3.5" /> : <Code className="h-3.5 w-3.5" />}
          >
            {yamlMode ? t.common.form : "YAML"}
          </Button>

          {yamlMode ? (
            <Button
              size="sm"
              className="uppercase font-mono text-xs cursor-pointer bg-primary text-white"
              onClick={handleYamlSave}
              disabled={yamlSaving}
            >
              {yamlSaving ? t.common.saving : t.common.save}
            </Button>
          ) : (
            <Button
              size="sm"
              className="uppercase font-mono text-xs cursor-pointer bg-primary text-white"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? t.common.saving : t.common.save}
            </Button>
          )}
        </div>
      </div>

      {yamlMode ? (
        <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
          <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
            <CardTitle className="text-sm font-semibold tracking-wide text-midground flex items-center gap-2">
              <FileText className="h-4.5 w-4.5 text-purple-400" />
              {t.config.rawYaml.toUpperCase()}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {yamlLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner className="text-xl text-purple-400" />
              </div>
            ) : (
              <textarea
                className="flex min-h-[600px] w-full bg-black/30 border border-purple-500/10 rounded-xl px-4 py-3.5 text-xs font-mono leading-relaxed text-purple-200 placeholder:text-purple-400/25 focus-visible:outline-none focus:border-purple-500/35 focus:ring-1 focus:ring-purple-500/15"
                value={yamlText}
                onChange={(e) => setYamlText(e.target.value)}
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col sm:flex-row gap-5">
          {/* Glassmorphic Category Left filter lists */}
          <aside aria-label={t.config.filters} className="sm:w-56 sm:shrink-0 bg-purple-950/[0.02] border border-purple-500/10 p-3 rounded-2xl backdrop-blur-sm h-fit">
            <div className="sm:sticky sm:top-4">
              <div className="flex flex-col gap-1">
                <div className="hidden sm:flex items-center gap-2 px-2 pb-2.5 mb-2 border-b border-purple-500/10 text-purple-400">
                  <Filter className="h-4 w-4 text-purple-400" />
                  <span className="text-[0.72rem] tracking-wider uppercase font-bold font-mono">
                    {t.config.filters}
                  </span>
                </div>

                <div className="flex sm:flex-col gap-1 sm:gap-px overflow-x-auto sm:overflow-x-visible scrollbar-none sm:max-h-[calc(100vh-280px)] sm:overflow-y-auto font-mono text-xs">
                  {categories.map((cat) => {
                    const isActive = !isSearching && activeCategory === cat;

                    return (
                      <ListItem
                        key={cat}
                        active={isActive}
                        onClick={() => {
                          setSearchQuery("");
                          setActiveCategory(cat);
                        }}
                        className={`rounded-lg whitespace-nowrap px-3 py-2 cursor-pointer transition-all border flex items-center justify-between gap-2.5 ${
                          isActive
                            ? "bg-purple-500/15 border-purple-500/25 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.1)]"
                            : "border-transparent text-purple-400 hover:text-purple-300 hover:bg-purple-500/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CategoryIcon
                            category={cat}
                            className={`h-4 w-4 shrink-0 ${isActive ? "text-purple-300" : "text-purple-400/60"}`}
                          />
                          <span className="truncate font-semibold uppercase tracking-wide text-[0.7rem]">
                            {prettyCategoryName(cat)}
                          </span>
                        </div>
                        <span
                          className={`text-[0.72rem] tabular-nums font-semibold ${
                            isActive
                              ? "text-purple-200"
                              : "text-purple-400/40"
                          }`}
                        >
                          {categoryCounts[cat] || 0}
                        </span>
                      </ListItem>
                    );
                  })}
                </div>
              </div>
            </div>
          </aside>

          {/* Configuration Forms View */}
          <div className="flex-1 min-w-0">
            {isSearching ? (
              <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
                <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold tracking-wide text-midground flex items-center gap-2">
                      <Search className="h-4.5 w-4.5 text-purple-400" />
                      {t.config.searchResults.toUpperCase()}
                    </CardTitle>
                    <Badge tone="secondary" className="text-xs font-mono bg-purple-500/10 border-purple-500/20 text-purple-300 px-2 py-0.5">
                      {searchMatchedFields.length}{" "}
                      {t.config.fields.replace(
                        "{s}",
                        searchMatchedFields.length !== 1 ? "s" : "",
                      ).toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3.5 px-0 pb-0">
                  {searchMatchedFields.length === 0 ? (
                    <p className="text-sm text-purple-400/50 font-mono text-center py-12">
                      {t.config.noFieldsMatch.replace("{query}", searchQuery)}
                    </p>
                  ) : (
                    renderFields(searchMatchedFields, true)
                  )}
                </CardContent>
              </Card>
            ) : (
              /* Active category fields view */
              <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
                <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold tracking-wide text-midground flex items-center gap-2">
                      <CategoryIcon
                        category={activeCategory}
                        className="h-4.5 w-4.5 text-purple-400"
                      />
                      {prettyCategoryName(activeCategory).toUpperCase()}
                    </CardTitle>
                    <Badge tone="secondary" className="text-xs font-mono bg-purple-500/10 border-purple-500/20 text-purple-300 px-2 py-0.5">
                      {activeFields.length}{" "}
                      {t.config.fields.replace(
                        "{s}",
                        activeFields.length !== 1 ? "s" : "",
                      ).toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3.5 px-0 pb-0">
                  {renderFields(activeFields)}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      <PluginSlot name="config:bottom" />
      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={executeReset}
        title={t.config.confirmResetScope.replace(
          "{scope}",
          isSearching
            ? t.config.searchResults
            : prettyCategoryName(activeCategory),
        )}
        description={`This will reset ${
          (isSearching ? searchMatchedFields : activeFields).length
        } field(s) to their default values.`}
        destructive
        confirmLabel={t.config.resetDefaults}
      />
    </div>
  );
}
