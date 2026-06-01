import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  MessageSquare,
  Search,
  Trash2,
  Clock,
  Terminal,
  Globe,
  MessageCircle,
  Hash,
  X,
  Play,
  Radio,
  Brain,
} from "lucide-react";
import { api } from "@/lib/api";
import type {
  SessionInfo,
  SessionMessage,
  SessionSearchResult,
  StatusResponse,
} from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";
import { PlatformsCard } from "@/components/PlatformsCard";
import { Toast } from "@/components/Toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { ListItem } from "@nous-research/ui/ui/components/list-item";
import { Segmented } from "@nous-research/ui/ui/components/segmented";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { Input } from "@/components/ui/input";
import { useSystemActions } from "@/contexts/useSystemActions";
import { useToast } from "@/hooks/useToast";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";
import { isDashboardEmbeddedChatEnabled } from "@/lib/dashboard-flags";

const SOURCE_CONFIG: Record<string, { icon: typeof Terminal; color: string }> =
  {
    cli: { icon: Terminal, color: "text-purple-400" },
    telegram: { icon: MessageCircle, color: "text-sky-400" },
    discord: { icon: Hash, color: "text-indigo-400" },
    slack: { icon: MessageSquare, color: "text-pink-400" },
    whatsapp: { icon: Globe, color: "text-emerald-400" },
    cron: { icon: Clock, color: "text-amber-400" },
  };

function SnippetHighlight({ snippet }: { snippet: string }) {
  const parts: React.ReactNode[] = [];
  const regex = />>>(.*?)<<</g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = regex.exec(snippet)) !== null) {
    if (match.index > last) {
      parts.push(snippet.slice(last, match.index));
    }
    parts.push(
      <mark key={i++} className="bg-amber-500/20 text-amber-300 px-1 rounded-sm border border-amber-500/20">
        {match[1]}
      </mark>,
    );
    last = regex.lastIndex;
  }
  if (last < snippet.length) {
    parts.push(snippet.slice(last));
  }
  return (
    <p className="normal-case mt-1.5 min-w-0 max-w-full truncate text-xs text-purple-200/60 leading-relaxed font-mono">
      {parts}
    </p>
  );
}

function ToolCallBlock({
  toolCall,
}: {
  toolCall: { id: string; function: { name: string; arguments: string } };
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  let args = toolCall.function.arguments;
  try {
    args = JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    // keep as-is
  }

  return (
    <div className="mt-2 border border-purple-500/20 bg-purple-950/20 rounded-lg overflow-hidden transition-all duration-200">
      <ListItem
        onClick={() => setOpen(!open)}
        aria-label={`${open ? t.common.collapse : t.common.expand} tool call ${toolCall.function.name}`}
        aria-expanded={open}
        className="px-3.5 py-2.5 text-xs text-purple-300 hover:bg-purple-500/10 hover:text-purple-200 cursor-pointer flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-purple-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-purple-400" />
          )}
          <span className="font-mono font-semibold tracking-wide">
            {toolCall.function.name}
          </span>
        </div>
        <span className="text-purple-400/50 font-mono text-[0.7rem]">{toolCall.id}</span>
      </ListItem>
      {open && (
        <pre className="border-t border-purple-500/15 px-3.5 py-3 text-xs text-purple-200/80 overflow-x-auto whitespace-pre-wrap font-mono bg-black/40">
          {args}
        </pre>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  highlight,
}: {
  msg: SessionMessage;
  highlight?: string;
}) {
  const { t } = useI18n();

  const ROLE_STYLES: Record<
    string,
    { bg: string; text: string; label: string; border: string }
  > = {
    user: {
      bg: "bg-purple-500/5",
      text: "text-purple-300",
      border: "border-purple-500/10",
      label: t.sessions.roles.user,
    },
    assistant: {
      bg: "bg-emerald-500/5",
      text: "text-emerald-300",
      border: "border-emerald-500/10",
      label: t.sessions.roles.assistant,
    },
    system: {
      bg: "bg-purple-950/10",
      text: "text-purple-400",
      border: "border-purple-500/5",
      label: t.sessions.roles.system,
    },
    tool: {
      bg: "bg-amber-500/5",
      text: "text-amber-300",
      border: "border-amber-500/10",
      label: t.sessions.roles.tool,
    },
  };

  const style = ROLE_STYLES[msg.role] ?? ROLE_STYLES.system;
  const label = msg.tool_name
    ? `${t.sessions.roles.tool}: ${msg.tool_name}`
    : style.label;

  // Check if any search term appears as a prefix of any word in content
  const isHit = (() => {
    if (!highlight || !msg.content) return false;
    const content = msg.content.toLowerCase();
    const terms = highlight.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.some((term) => content.includes(term));
  })();

  // Split search query into terms for inline highlighting
  const highlightTerms =
    isHit && highlight ? highlight.split(/\s+/).filter(Boolean) : undefined;

  return (
    <div
      className={`p-4 rounded-xl border ${style.border} ${style.bg} transition-all duration-200 ${
        isHit ? "ring-2 ring-amber-500/40 border-amber-500/30" : ""
      }`}
      data-search-hit={isHit || undefined}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
          {label}
        </span>
        {isHit && (
          <Badge tone="warning" className="text-[0.68rem] py-0 px-2 font-mono">
            {t.common.match}
          </Badge>
        )}
        {msg.timestamp && (
          <span className="text-[0.72rem] text-text-tertiary font-mono ml-auto">
            {timeAgo(msg.timestamp)}
          </span>
        )}
      </div>
      {msg.content &&
        (msg.role === "system" ? (
          <div className="text-xs text-purple-200/80 font-mono whitespace-pre-wrap leading-relaxed">
            {msg.content}
          </div>
        ) : (
          <Markdown content={msg.content} highlightTerms={highlightTerms} />
        ))}
      {msg.tool_calls && msg.tool_calls.length > 0 && (
        <div className="mt-2.5">
          {msg.tool_calls.map((tc) => (
            <ToolCallBlock key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function MessageList({
  messages,
  highlight,
}: {
  messages: SessionMessage[];
  highlight?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlight || !containerRef.current) return;
    const timer = setTimeout(() => {
      const hit = containerRef.current?.querySelector("[data-search-hit]");
      if (hit) {
        hit.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [messages, highlight]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-3.5 max-h-[600px] overflow-y-auto pr-2 scrollbar-none"
    >
      {messages.map((msg, i) => (
        <MessageBubble key={i} msg={msg} highlight={highlight} />
      ))}
    </div>
  );
}

function SessionRow({
  session,
  snippet,
  searchQuery,
  isExpanded,
  onToggle,
  onDelete,
  resumeInChatEnabled,
}: {
  session: SessionInfo;
  snippet?: string;
  searchQuery?: string;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  resumeInChatEnabled: boolean;
}) {
  const [messages, setMessages] = useState<SessionMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useI18n();
  const navigate = useNavigate();

  useEffect(() => {
    if (isExpanded && messages === null && !loading) {
      setLoading(true);
      api
        .getSessionMessages(session.id)
        .then((resp) => setMessages(resp.messages))
        .catch((err) => setError(String(err)))
        .finally(() => setLoading(false));
    }
  }, [isExpanded, session.id, messages, loading]);

  const sourceInfo = (session.source
    ? SOURCE_CONFIG[session.source]
    : null) ?? { icon: Globe, color: "text-purple-300" };
  const SourceIcon = sourceInfo.icon;
  const hasTitle = session.title && session.title !== "Untitled";

  const actionButtons = (
    <div className="flex items-center gap-1.5">
      <Badge tone="outline" className="text-[0.72rem] tracking-wide py-0.5 px-2 bg-purple-950/20 border-purple-500/20 text-purple-300">
        {session.source ?? "local"}
      </Badge>

      {resumeInChatEnabled && (
        <Button
          ghost
          size="icon"
          className="text-purple-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          aria-label={t.sessions.resumeInChat}
          title={t.sessions.resumeInChat}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/chat?resume=${encodeURIComponent(session.id)}`);
          }}
        >
          <Play className="h-4 w-4" />
        </Button>
      )}

      <Button
        ghost
        destructive
        size="icon"
        className="text-purple-300 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
        aria-label={t.sessions.deleteSession}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div
      className={`max-w-full min-w-0 overflow-hidden rounded-xl border transition-all duration-300 hover:scale-[1.002] ${
        session.is_active
          ? "border-emerald-500/30 bg-emerald-500/[0.02] shadow-[0_0_15px_rgba(16,185,129,0.03)]"
          : "border-purple-500/10 bg-purple-950/[0.04] hover:border-purple-500/25"
      }`}
    >
      <div
        className="flex cursor-pointer items-start gap-4 p-4 transition-colors"
        onClick={onToggle}
      >
        <div className={`shrink-0 p-2 rounded-lg bg-purple-950/40 border border-purple-500/10 ${sourceInfo.color}`}>
          <SourceIcon className="h-4.5 w-4.5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`normal-case min-w-0 flex-1 truncate text-sm font-semibold tracking-wide ${
                    hasTitle ? "text-purple-100" : "text-purple-400/60 italic font-normal"
                  }`}
                >
                  {hasTitle
                    ? session.title
                    : session.preview
                      ? session.preview.slice(0, 60)
                      : t.sessions.untitledSession}
                </span>
                {session.is_active && (
                  <Badge tone="success" className="shrink-0 text-[0.72rem] font-semibold py-0.5 px-2">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    {t.common.live}
                  </Badge>
                )}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-purple-300/50 font-mono">
                <span className="max-w-[min(100%,12rem)] truncate sm:max-w-[180px] font-semibold text-purple-300/70">
                  {(session.model ?? t.common.unknown).split("/").pop()}
                </span>
                <span className="text-purple-500/30">&#183;</span>
                <span className="shrink-0">
                  {session.message_count} {t.common.msgs}
                </span>
                {session.tool_call_count > 0 && (
                  <>
                    <span className="text-purple-500/30">&#183;</span>
                    <span className="shrink-0 text-amber-400/80">
                      {session.tool_call_count} {t.common.tools}
                    </span>
                  </>
                )}
                <span className="text-purple-500/30">&#183;</span>
                <span className="shrink-0">{timeAgo(session.last_active)}</span>
              </div>
              {snippet && <SnippetHighlight snippet={snippet} />}
            </div>

            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              {actionButtons}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:hidden">
            {actionButtons}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="min-w-0 border-t border-purple-500/10 bg-black/35 p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Spinner className="text-xl text-purple-400" />
            </div>
          )}
          {error && (
            <p className="text-sm text-rose-400 py-4 text-center">{error}</p>
          )}
          {messages && messages.length === 0 && (
            <p className="text-sm text-purple-400/60 py-4 text-center">
              {t.sessions.noMessages}
            </p>
          )}
          {messages && messages.length > 0 && (
            <MessageList messages={messages} highlight={searchQuery} />
          )}
        </div>
      )}
    </div>
  );
}

type SessionsView = "list" | "overview";

const PAGE_SIZE = 20;

function SessionsPagination({
  className,
  compact = false,
  onPageChange,
  page,
  total,
}: SessionsPaginationProps) {
  const { t } = useI18n();
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <div
      className={`flex items-center ${compact ? "gap-1.5" : "justify-between pt-4"}${
        className ? ` ${className}` : ""
      }`}
    >
      {!compact && (
        <span className="text-xs text-purple-400/60 font-mono">
          {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}{" "}
          {t.common.of} {total}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <Button
          outlined
          size="icon"
          className="hover:border-purple-500/30 hover:bg-purple-500/5 transition-all text-purple-300 cursor-pointer"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label={t.sessions.previousPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs text-purple-300 font-mono">
          {t.common.page} {page + 1} {t.common.of} {pageCount}
        </span>
        <Button
          outlined
          size="icon"
          className="hover:border-purple-500/30 hover:bg-purple-500/5 transition-all text-purple-300 cursor-pointer"
          disabled={(page + 1) * PAGE_SIZE >= total}
          onClick={() => onPageChange(page + 1)}
          aria-label={t.sessions.nextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<
    SessionSearchResult[] | null
  >(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const logScrollRef = useRef<HTMLPreElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [overviewSessions, setOverviewSessions] = useState<SessionInfo[]>([]);
  const [view, setView] = useState<SessionsView>("overview");
  const { toast, showToast } = useToast();
  const { t } = useI18n();
  const { setAfterTitle } = usePageHeader();
  const { activeAction, actionStatus, dismissLog } = useSystemActions();
  const resumeInChatEnabled = isDashboardEmbeddedChatEnabled();

  const gatewayAddress = (() => {
    if (status?.gateway_health_url) {
      try {
        return new URL(status.gateway_health_url).host;
      } catch {
        // Keep fallback
      }
    }
    return window.location.host || "127.0.0.1:1409";
  })();

  useLayoutEffect(() => {
    if (loading) {
      setAfterTitle(null);
      return;
    }
    setAfterTitle(
      <Badge tone="secondary" className="text-xs font-mono tabular-nums bg-purple-500/10 text-purple-300 border border-purple-500/20">
        {total}
      </Badge>,
    );
    return () => {
      setAfterTitle(null);
    };
  }, [loading, setAfterTitle, total]);

  const loadSessions = useCallback((p: number) => {
    setLoading(true);
    api
      .getSessions(PAGE_SIZE, p * PAGE_SIZE)
      .then((resp) => {
        setSessions(resp.sessions);
        setTotal(resp.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSessions(page);
  }, [loadSessions, page]);

  useEffect(() => {
    const loadOverview = () => {
      api
        .getStatus()
        .then(setStatus)
        .catch(() => {});
      api
        .getSessions(50)
        .then((r) => setOverviewSessions(r.sessions))
        .catch(() => {});
    };
    loadOverview();
    const id = setInterval(loadOverview, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = logScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [actionStatus?.lines]);

  // Debounced FTS search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!search.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api
        .searchSessions(search.trim())
        .then((resp) => setSearchResults(resp.results))
        .catch(() => setSearchResults(null))
        .finally(() => setSearching(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const sessionDelete = useConfirmDelete({
    onDelete: useCallback(
      async (id: string) => {
        try {
          await api.deleteSession(id);
          setSessions((prev) => prev.filter((s) => s.id !== id));
          setTotal((prev) => prev - 1);
          if (expandedId === id) setExpandedId(null);
          showToast(t.sessions.sessionDeleted, "success");
        } catch {
          showToast(t.sessions.failedToDelete, "error");
          throw new Error("delete failed");
        }
      },
      [
        expandedId,
        showToast,
        t.sessions.sessionDeleted,
        t.sessions.failedToDelete,
      ],
    ),
  });

  const pendingSession = sessionDelete.pendingId
    ? sessions.find((s) => s.id === sessionDelete.pendingId)
    : null;

  // Build snippet map from search results (session_id → snippet)
  const snippetMap = new Map<string, string>();
  if (searchResults) {
    for (const r of searchResults) {
      snippetMap.set(r.session_id, r.snippet);
    }
  }

  // When searching, filter sessions to those with FTS matches;
  // when not searching, show all sessions
  const filtered = searchResults
    ? sessions.filter((s) => snippetMap.has(s.id))
    : sessions;

  const platformEntries = status
    ? Object.entries(status.gateway_platforms ?? {})
    : [];
  const recentSessions = overviewSessions
    .filter((s) => !s.is_active)
    .slice(0, 5);

  const isSearching = Boolean(search.trim());
  const showOverviewTab =
    platformEntries.length > 0 || recentSessions.length > 0;
  const showList = view === "list" || isSearching || !showOverviewTab;
  const showPagination = showList && !searchResults && total > PAGE_SIZE;

  useEffect(() => {
    if (isSearching) setView("list");
  }, [isSearching]);

  const alerts: { message: string; detail?: string }[] = [];
  if (status) {
    if (status.gateway_state === "startup_failed") {
      alerts.push({
        message: t.status.gatewayFailedToStart,
        detail: status.gateway_exit_reason ?? undefined,
      });
    }
    const failedPlatformEntries = platformEntries.filter(
      ([, info]) => info.state === "fatal" || info.state === "disconnected",
    );
    for (const [name, info] of failedPlatformEntries) {
      const stateLabel =
        info.state === "fatal"
          ? t.status.platformError
          : t.status.platformDisconnected;
      alerts.push({
        message: `${name.charAt(0).toUpperCase() + name.slice(1)} ${stateLabel}`,
        detail: info.error_message ?? undefined,
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-purple-400" />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-5">
      <PluginSlot name="sessions:top" />
      <Toast toast={toast} />

      <DeleteConfirmDialog
        open={sessionDelete.isOpen}
        onCancel={sessionDelete.cancel}
        onConfirm={sessionDelete.confirm}
        title={t.sessions.confirmDeleteTitle}
        description={
          pendingSession?.title && pendingSession.title !== "Untitled"
            ? `"${pendingSession.title}" — ${t.sessions.confirmDeleteMessage}`
            : t.sessions.confirmDeleteMessage
        }
        loading={sessionDelete.isDeleting}
      />

      {alerts.length > 0 && (
        <div className="border border-rose-500/25 bg-rose-500/[0.04] p-4.5 rounded-xl shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2.5 min-w-0">
              {alerts.map((alert, i) => (
                <div key={i}>
                  <p className="text-sm font-semibold text-rose-300">
                    {alert.message}
                  </p>
                  {alert.detail && (
                    <p className="text-xs text-rose-400/70 font-mono mt-0.5 leading-relaxed">
                      {alert.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeAction && (
        <div className="border border-purple-500/20 bg-purple-950/10 rounded-xl overflow-hidden shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b border-purple-500/10 px-4 py-3 bg-purple-950/20">
            <div className="flex items-center gap-2.5 min-w-0">
              {actionStatus?.running ? (
                <Spinner className="shrink-0 text-[0.875rem] text-amber-400" />
              ) : actionStatus?.exit_code === 0 ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : actionStatus !== null ? (
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              ) : (
                <Spinner className="shrink-0 text-[0.875rem] text-purple-400/50" />
              )}

              <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider truncate font-mono">
                {activeAction === "restart"
                  ? t.status.restartGateway
                  : t.status.updateLittle}
              </span>

              <Badge
                tone={
                  actionStatus?.running
                    ? "warning"
                    : actionStatus?.exit_code === 0
                      ? "success"
                      : actionStatus
                        ? "destructive"
                        : "outline"
                }
                className="text-[0.72rem] tracking-wide font-mono px-2 py-0.5 shrink-0"
              >
                {actionStatus?.running
                  ? t.status.running
                  : actionStatus?.exit_code === 0
                    ? t.status.actionFinished
                    : actionStatus
                      ? `${t.status.actionFailed} (${actionStatus.exit_code ?? "?"})`
                      : t.common.loading}
              </Badge>
            </div>

            <Button
              ghost
              size="icon"
              onClick={dismissLog}
              className="shrink-0 text-purple-300 hover:text-purple-100 hover:bg-purple-500/10"
              aria-label={t.common.close}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <pre
            ref={logScrollRef}
            className="max-h-72 overflow-auto px-4 py-3.5 font-mono text-[0.78rem] leading-relaxed whitespace-pre-wrap break-all text-purple-200/80 bg-black/30"
          >
            {actionStatus?.lines && actionStatus.lines.length > 0
              ? actionStatus.lines.join("\n")
              : t.status.waitingForOutput}
          </pre>
        </div>
      )}

      {/* Cockpit Swarm Topology Canvas Overlay - Active by default in overview */}
      {!isSearching && view === "overview" && (
        <div className="relative w-full h-[260px] rounded-2xl border border-purple-500/15 bg-purple-950/[0.03] overflow-hidden shadow-2xl flex items-center justify-center p-6 backdrop-blur-md">
          {/* Spatial Grid Dot Matrix Overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-40 bg-[radial-gradient(rgba(168,85,247,0.18)_1.5px,transparent_1.5px)] bg-[size:24px_24px]" />
          {/* Organic Pulsing Ambient Backdrop Nebula */}
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-tr from-purple-500/5 via-cyan-500/5 to-transparent blur-3xl animate-[pulse_6s_infinite_ease-in-out]" />
          
          <div className="relative w-full h-full flex items-center justify-between gap-6 max-w-3xl z-10">
            {/* Gateway Node */}
            <div className="flex flex-col items-center gap-2 group cursor-default">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-cyan-400 bg-black/60 shadow-[0_0_20px_rgba(6,182,212,0.25)] transition-all duration-300 group-hover:scale-105 group-hover:border-cyan-300">
                <div className="absolute inset-0 rounded-xl bg-cyan-400/5 animate-ping opacity-60" />
                <Radio className="h-6 w-6 text-cyan-400 animate-pulse" />
              </div>
              <span className="text-[0.68rem] font-bold text-cyan-400 tracking-widest font-mono uppercase">Gateway Core</span>
              <Badge tone={status?.gateway_state === "running" ? "success" : "secondary"} className="text-[0.62rem] px-1.5 py-0 font-mono">
                {status?.gateway_state === "running" ? "ACTIVE" : "SHUTDOWN"}
              </Badge>
            </div>

            {/* Glowing Laser Stream Vector Connectors */}
            <div className="flex-1 relative h-full flex flex-col items-center justify-center gap-2">
              <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="laserGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.8" />
                    <stop offset="50%" stopColor="#a855f7" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                {/* Wave stream 1 */}
                <path d="M 10,100 Q 120,30 240,100 T 470,100" fill="none" stroke="url(#laserGrad)" strokeWidth="1.5" strokeDasharray="5,6" className="animate-[subtle-nebula_20s_infinite_ease-in-out]" />
                {/* Wave stream 2 */}
                <path d="M 10,100 Q 120,170 240,100 T 470,100" fill="none" stroke="url(#laserGrad)" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3,8" />
              </svg>
              <div className="z-10 text-center bg-black/75 border border-purple-500/15 rounded-full px-4 py-1.5 backdrop-blur-md shadow-2xl text-[0.68rem] font-mono tracking-widest text-purple-300 font-semibold uppercase flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-ping" />
                Live Swarm Telemetry
              </div>
              <span className="z-10 text-[0.62rem] font-mono text-purple-300/40 tracking-wider">
                {gatewayAddress}
              </span>
            </div>

            {/* Cognitive Swarm Cluster Node */}
            <div className="flex flex-col items-center gap-2 group cursor-default">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-xl border border-purple-500 bg-black/60 shadow-[0_0_20px_rgba(168,85,247,0.25)] transition-all duration-300 group-hover:scale-105 group-hover:border-purple-400">
                <div className="absolute inset-0 rounded-xl bg-purple-500/5 animate-pulse" />
                <Brain className="h-6 w-6 text-purple-400" />
              </div>
              <span className="text-[0.68rem] font-bold text-purple-400 tracking-widest font-mono uppercase">Swarm Cluster</span>
              <Badge tone="secondary" className="text-[0.62rem] px-1.5 py-0 font-mono bg-purple-500/10 border-purple-500/20 text-purple-300">
                {sessions.filter(s => s.is_active).length} COGNITIVE ENTITIES
              </Badge>
            </div>
          </div>
        </div>
      )}

      {(showOverviewTab && !isSearching) || showList ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 bg-purple-950/[0.02] border border-purple-500/10 p-3 rounded-xl backdrop-blur-sm shadow-md">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {showOverviewTab && !isSearching && (
              <Segmented
                className="w-fit shrink-0 font-mono tracking-wider text-xs border border-purple-500/10 p-0.5 rounded-lg bg-black/40"
                size="md"
                value={view}
                onChange={setView}
                options={[
                  { value: "overview", label: t.sessions.overview.toUpperCase() },
                  { value: "list", label: t.sessions.history.toUpperCase() },
                ]}
              />
            )}

            {showList && (
              <div className="relative min-w-0 w-full sm:w-auto sm:min-w-[15rem] sm:max-w-md sm:flex-1">
                {searching ? (
                  <Spinner className="absolute left-3 top-1/2 -translate-y-1/2 text-[0.875rem] text-purple-400" />
                ) : (
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-purple-400/50" />
                )}
                <Input
                  placeholder={t.sessions.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 py-0 pr-8 pl-9 text-xs leading-none bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 placeholder:text-purple-400/30 font-mono focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20"
                />
                {search && (
                  <Button
                    ghost
                    size="xs"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-purple-400/60 hover:text-purple-100 p-1 hover:bg-purple-500/10 rounded-md cursor-pointer"
                    onClick={() => setSearch("")}
                    aria-label={t.common.clear}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {showPagination && (
            <SessionsPagination
              compact
              className="shrink-0 sm:ml-auto"
              page={page}
              total={total}
              onPageChange={setPage}
            />
          )}
        </div>
      ) : null}

      {showList ? (
        filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-purple-400/40 bg-purple-950/[0.02] border border-purple-500/10 rounded-2xl shadow-inner">
            <Clock className="h-10 w-10 mb-4 opacity-30 text-purple-400" />
            <p className="text-sm font-semibold tracking-wide uppercase font-mono">
              {search ? t.sessions.noMatch : t.sessions.noSessions}
            </p>
            {!search && (
              <p className="text-xs mt-1.5 text-purple-400/50 font-mono">
                {t.sessions.startConversation}
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-2.5">
            <div className="flex min-w-0 flex-col gap-2.5">
              {filtered.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  snippet={snippetMap.get(s.id)}
                  searchQuery={search || undefined}
                  isExpanded={expandedId === s.id}
                  onToggle={() =>
                    setExpandedId((prev) => (prev === s.id ? null : s.id))
                  }
                  onDelete={() => sessionDelete.requestDelete(s.id)}
                  resumeInChatEnabled={resumeInChatEnabled}
                />
              ))}
            </div>

            {showPagination && (
              <SessionsPagination
                page={page}
                total={total}
                onPageChange={setPage}
              />
            )}
          </div>
        )
      ) : (
        <div className="flex min-w-0 flex-col gap-5">
          {platformEntries.length > 0 && status && (
            <PlatformsCard platforms={platformEntries} />
          )}

          {recentSessions.length > 0 && (
            <Card className="min-w-0 max-w-full overflow-hidden border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="min-w-0 px-0 pt-0 pb-4 mb-4 border-b border-purple-500/10">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Clock className="h-4.5 w-4.5" />
                  </div>
                  <CardTitle className="min-w-0 truncate text-sm font-semibold tracking-wide text-midground">
                    {t.status.recentSessions.toUpperCase()}
                  </CardTitle>
                </div>
              </CardHeader>

              <CardContent className="grid min-w-0 gap-3 px-0 pb-0">
                {recentSessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex min-w-0 max-w-full flex-col gap-3 rounded-xl border border-purple-500/5 bg-background-base/20 p-4 transition-all hover:bg-background-base/40 hover:border-purple-500/15 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="normal-case min-w-0 truncate text-sm font-semibold tracking-wide text-purple-100">
                        {s.title ?? t.common.untitled}
                      </span>

                      <span className="min-w-0 break-words text-xs text-purple-400/50 font-mono">
                        <span className="font-semibold text-purple-300/70">
                          {(s.model ?? t.common.unknown).split("/").pop()}
                        </span>{" "}
                        · {s.message_count} {t.common.msgs} ·{" "}
                        {timeAgo(s.last_active)}
                      </span>

                      {s.preview && (
                        <p className="normal-case mt-1 min-w-0 max-w-full text-xs leading-relaxed text-purple-400/60 [overflow-wrap:anywhere] font-mono border-l border-purple-500/10 pl-2">
                          {s.preview}
                        </p>
                      )}
                    </div>

                    <Badge
                      tone="outline"
                      className="shrink-0 self-start text-[0.72rem] tracking-wide font-mono py-0.5 px-2 bg-purple-950/20 border-purple-500/10 text-purple-300 sm:self-center"
                    >
                      <Database className="mr-1.5 h-3 w-3" />
                      {s.source ?? "local"}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <PluginSlot name="sessions:bottom" />
    </div>
  );
}

interface SessionsPaginationProps {
  className?: string;
  compact?: boolean;
  onPageChange: (page: number) => void;
  page: number;
  total: number;
}
