import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  Coins,
  MessageSquare,
  Award,
  Plus,
  Calendar,
  X,
  TrendingDown,
  Info,
} from "lucide-react";
import { fetchJSON } from "@/lib/api";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Button } from "@nous-research/ui/ui/components/button";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Toast } from "@/components/Toast";
import { useToast } from "@/hooks/useToast";

interface Market {
  id: string;
  title: string;
  description: string | null;
  creator_agent_id: string;
  category: string;
  status: "OPEN" | "RESOLVED" | "CANCELLED";
  outcome: "YES" | "NO" | "NULL";
  yes_shares: number;
  no_shares: number;
  liquidity_pool: number;
  created_at: number;
  expires_at: number;
  probability_yes: number;
  price_yes: number;
  price_no: number;
}

interface Trade {
  id: string;
  market_id: string;
  agent_id: string;
  trade_type: "BUY_YES" | "BUY_NO";
  shares: number;
  price: number;
  rationale: string | null;
  timestamp: number;
}

interface LeaderboardEntry {
  agent_id: string;
  credits: number;
}

export default function PredictionMarketPage() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userBalance, setUserBalance] = useState<number>(1000.0);
  const [loading, setLoading] = useState(true);
  const [activeMarket, setActiveMarket] = useState<Market | null>(null);

  // Modals / Overlays
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY_YES" | "BUY_NO">("BUY_YES");

  // Forms
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [newHours, setNewHours] = useState("24");

  const [tradeShares, setTradeShares] = useState("10");
  const [tradeRationale, setTradeRationale] = useState("");
  const [tradeCostEstimate, setTradeCostEstimate] = useState(0.0);
  const [placingTrade, setPlacingTrade] = useState(false);
  const [creatingMarket, setCreatingMarket] = useState(false);

  const { toast, showToast } = useToast();

  const loadData = useCallback(async () => {
    try {
      const marketsData = await fetchJSON<Market[]>("/api/prediction-market/markets");
      setMarkets(marketsData);
      
      const tradesData = await fetchJSON<Trade[]>("/api/prediction-market/trades");
      setTrades(tradesData);
      
      const leaderboardData = await fetchJSON<LeaderboardEntry[]>("/api/prediction-market/leaderboard");
      setLeaderboard(leaderboardData);
      
      const balanceData = await fetchJSON<{ credits: number }>("/api/prediction-market/balances/HumanOperator");
      setUserBalance(balanceData.credits);
      
      if (marketsData.length > 0 && !activeMarket) {
        // Find detailed view for first market
        const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${marketsData[0].id}`);
        setActiveMarket(detailed);
      } else if (activeMarket) {
        const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${activeMarket.id}`);
        setActiveMarket(detailed);
      }
    } catch (err) {
      console.error("Failed to fetch prediction market data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeMarket]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Compute trade cost estimate when inputs change
  useEffect(() => {
    if (!activeMarket) return;
    const shares = parseFloat(tradeShares);
    if (isNaN(shares) || shares <= 0) {
      setTradeCostEstimate(0.0);
      return;
    }
    
    // LMSR AMM formula simulation on client side
    const B_VAL = 100.0;
    const currentY = activeMarket.yes_shares;
    const currentN = activeMarket.no_shares;
    
    const stableLogSumExp = (x: number, y: number) => {
      const m = Math.max(x, y);
      return m + Math.log(Math.exp(x - m) + Math.exp(y - m));
    };
    
    const lmsrCost = (y: number, n: number) => {
      return B_VAL * stableLogSumExp(y / B_VAL, n / B_VAL);
    };
    
    const costBefore = lmsrCost(currentY, currentN);
    const costAfter = tradeType === "BUY_YES"
      ? lmsrCost(currentY + shares, currentN)
      : lmsrCost(currentY, currentN + shares);
      
    setTradeCostEstimate(costAfter - costBefore);
  }, [tradeShares, tradeType, activeMarket]);

  const selectMarket = async (m: Market) => {
    try {
      const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${m.id}`);
      setActiveMarket(detailed);
    } catch {
      setActiveMarket(m);
    }
  };

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreatingMarket(true);
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + parseInt(newHours) * 3600;
      await fetchJSON<Market>("/api/prediction-market/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc || null,
          creator_agent_id: "HumanOperator",
          expires_at: expiresAt,
          category: newCategory,
        }),
      });
      showToast("Prediction market created successfully!", "success");
      setNewTitle("");
      setNewDesc("");
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      showToast("Failed to create market.", "error");
    } finally {
      setCreatingMarket(false);
    }
  };

  const handlePlaceTrade = async () => {
    if (!activeMarket) return;
    const shares = parseFloat(tradeShares);
    if (isNaN(shares) || shares <= 0) return;
    setPlacingTrade(true);
    try {
      await fetchJSON<Market>(`/api/prediction-market/markets/${activeMarket.id}/trade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: "HumanOperator",
          trade_type: tradeType,
          shares,
          rationale: tradeRationale || null,
        }),
      });
      showToast(`Successfully bought ${shares} shares of ${tradeType === "BUY_YES" ? "YES" : "NO"}!`, "success");
      setTradeRationale("");
      setShowTradeModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to place trade. Check your credit balance.", "error");
    } finally {
      setPlacingTrade(false);
    }
  };

  const handleResolveMarket = async (outcome: "YES" | "NO") => {
    if (!activeMarket) return;
    try {
      await fetchJSON<Market>(`/api/prediction-market/markets/${activeMarket.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      showToast(`Market resolved as ${outcome}! Payouts distributed.`, "success");
      loadData();
    } catch (err) {
      showToast("Only oracle verifications can resolve markets.", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-purple-400" />
      </div>
    );
  }

  const activeProb = activeMarket ? Math.round(activeMarket.probability_yes * 100) : 50;

  return (
    <div className="flex min-w-0 w-full max-w-full flex-col gap-5">
      <Toast toast={toast} />

      {/* Titanium top header bar */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 bg-purple-950/[0.02] border border-purple-500/10 p-4 rounded-2xl shadow-md backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
            <TrendingUp className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-purple-200 uppercase font-mono">
              AI Native Prediction Market
            </h2>
            <p className="text-[0.68rem] text-purple-400/50 font-mono mt-0.5">
              Speculate, gather consensus, and build collective intelligence across agent swarms.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3.5 sm:shrink-0 font-mono text-xs">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/5 border border-purple-500/10 shadow-inner">
            <Coins className="h-4 w-4 text-amber-400" />
            <span className="text-purple-300">Operator Balance:</span>
            <span className="font-bold text-white font-mono">{userBalance.toFixed(2)} cr</span>
          </div>

          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="cursor-pointer bg-primary hover:bg-primary-hover font-mono font-bold text-xs uppercase"
            prefix={<Plus className="h-3.5 w-3.5" />}
          >
            Create Market
          </Button>
        </div>
      </div>

      {/* Main split grid */}
      <div className="grid gap-5 lg:grid-cols-12 items-start">
        {/* Left Column: Odds Gauge & Ledger */}
        <div className="lg:col-span-8 flex flex-col gap-5 min-w-0">
          {activeMarket && (
            <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="px-0 pt-0 pb-4 mb-4 border-b border-purple-500/10 flex flex-row items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Badge tone="secondary" className="text-[0.62rem] font-mono tracking-wider bg-purple-500/10 border border-purple-500/20 text-purple-300 mb-1.5">
                    {activeMarket.category.toUpperCase()}
                  </Badge>
                  <CardTitle className="text-base font-bold text-purple-100 tracking-wide truncate">
                    {activeMarket.title}
                  </CardTitle>
                  <p className="text-xs text-purple-400/60 leading-relaxed font-mono mt-1 pr-6 break-words">
                    {activeMarket.description || "No description provided."}
                  </p>
                </div>
                {activeMarket.status === "OPEN" && (
                  <Badge tone="success" className="shrink-0 text-[0.72rem] font-mono">
                    <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                    OPEN
                  </Badge>
                )}
                {activeMarket.status === "RESOLVED" && (
                  <Badge tone="outline" className="shrink-0 text-[0.72rem] font-mono bg-purple-950/20 border border-purple-500/30 text-purple-300">
                    RESOLVED: {activeMarket.outcome}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="px-0 pb-0 grid gap-6 sm:grid-cols-2 items-center">
                {/* Arc Odds Gauge */}
                <div className="relative flex flex-col items-center justify-center p-4">
                  <svg className="w-40 h-40" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="rgba(168, 85, 247, 0.08)"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="url(#arcGlowGrad)"
                      strokeWidth="8"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * activeProb) / 100}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                      className="transition-all duration-1000 ease-out"
                    />
                    <defs>
                      <linearGradient id="arcGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#8a2be2" />
                        <stop offset="100%" stopColor="#00f2fe" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <div className="absolute flex flex-col items-center justify-center text-center">
                    <span className="text-3xl font-extrabold text-white font-mono leading-none tracking-tight">
                      {activeProb}%
                    </span>
                    <span className="text-[0.62rem] text-purple-400/40 uppercase tracking-widest font-mono font-bold mt-1">
                      YES ODDS
                    </span>
                  </div>
                </div>

                {/* Specs and actions */}
                <div className="flex flex-col gap-4 font-mono text-xs">
                  <div className="grid grid-cols-2 gap-3.5 bg-black/40 border border-purple-500/5 rounded-xl p-4 shadow-inner">
                    <div className="flex flex-col">
                      <span className="text-[0.62rem] text-purple-400/40 font-bold uppercase tracking-wider">YES Shares Price</span>
                      <span className="text-sm font-bold text-purple-200 mt-0.5">{activeMarket.price_yes.toFixed(2)} cr</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.62rem] text-purple-400/40 font-bold uppercase tracking-wider">NO Shares Price</span>
                      <span className="text-sm font-bold text-purple-200 mt-0.5">{activeMarket.price_no.toFixed(2)} cr</span>
                    </div>
                    <div className="flex flex-col col-span-2 border-t border-purple-500/10 pt-2.5">
                      <span className="text-[0.62rem] text-purple-400/40 font-bold uppercase tracking-wider">Liquidity Pool Volume</span>
                      <span className="text-xs font-semibold text-emerald-400 mt-0.5">{activeMarket.liquidity_pool.toFixed(2)} cr</span>
                    </div>
                  </div>

                  {activeMarket.status === "OPEN" ? (
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 cursor-pointer bg-purple-500/15 border border-purple-500/35 text-purple-300 hover:bg-purple-500/25"
                        onClick={() => {
                          setTradeType("BUY_YES");
                          setShowTradeModal(true);
                        }}
                      >
                        BET YES
                      </Button>
                      <Button
                        className="flex-1 cursor-pointer bg-cyan-500/10 border border-cyan-500/35 text-cyan-300 hover:bg-cyan-500/20"
                        onClick={() => {
                          setTradeType("BUY_NO");
                          setShowTradeModal(true);
                        }}
                      >
                        BET NO
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-500/5 border border-purple-500/10 text-[0.72rem] text-purple-300/80 leading-relaxed font-mono">
                      <Info className="h-4.5 w-4.5 shrink-0 text-purple-400" />
                      This market was resolved as <span className="font-bold text-white uppercase mx-0.5">{activeMarket.outcome}</span>. Winning shares have been paid out at 1.0 credit per share.
                    </div>
                  )}

                  {activeMarket.status === "OPEN" && activeMarket.creator_agent_id === "HumanOperator" && (
                    <div className="flex gap-2 border-t border-purple-500/10 pt-3 mt-1 justify-end items-center">
                      <span className="text-[0.62rem] text-purple-400/40 font-bold uppercase tracking-wider mr-auto">Oracle Action</span>
                      <Button
                        size="xs"
                        className="cursor-pointer bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 font-bold"
                        onClick={() => handleResolveMarket("YES")}
                      >
                        Resolve YES
                      </Button>
                      <Button
                        size="xs"
                        className="cursor-pointer bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 font-bold"
                        onClick={() => handleResolveMarket("NO")}
                      >
                        Resolve NO
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Belief Ledger trade logs feed */}
          <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
            <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <MessageSquare className="h-4.5 w-4.5" />
                </div>
                <CardTitle className="text-sm font-semibold tracking-wide text-midground">
                  THE BELIEF LEDGER FEED
                </CardTitle>
              </div>
              <span className="text-[0.62rem] text-purple-400/40 uppercase font-mono tracking-wider font-bold">
                Last 100 Swarm speculations
              </span>
            </CardHeader>
            <CardContent className="px-0 pb-0 overflow-y-auto max-h-72 scrollbar-none flex flex-col gap-2.5">
              {trades.length === 0 ? (
                <p className="text-center py-10 text-purple-400/30 font-mono text-xs uppercase tracking-wider">
                  No swarm trades recorded. Market consensus dormant.
                </p>
              ) : (
                trades.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1.5 border border-purple-500/5 bg-background-base/20 p-3.5 rounded-xl transition-all hover:bg-background-base/40 hover:border-purple-500/15 font-mono text-xs"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-purple-300 font-mono">{t.agent_id}</span>
                      <span className="text-purple-400/40 font-mono">bought</span>
                      <Badge
                        tone={t.trade_type === "BUY_YES" ? "success" : "warning"}
                        className="text-[0.62rem] font-mono px-2 py-0.5 rounded uppercase font-semibold"
                      >
                        {t.trade_type === "BUY_YES" ? "YES" : "NO"}
                      </Badge>
                      <span className="text-purple-300 font-bold">{t.shares.toFixed(1)} shares</span>
                      <span className="text-purple-400/40 font-mono">at</span>
                      <span className="text-purple-200 font-semibold">{t.price.toFixed(2)} cr/sh</span>
                      <span className="text-[0.65rem] text-purple-400/30 font-mono ml-auto">
                        {new Date(t.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                    {t.rationale && (
                      <p className="text-[0.72rem] text-purple-400/60 leading-relaxed font-mono border-l-2 border-purple-500/10 pl-2.5 italic">
                        "{t.rationale}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Markets grid and Leaderboard */}
        <div className="lg:col-span-4 flex flex-col gap-5 min-w-0">
          {/* Active Pools list */}
          <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
            <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
              <CardTitle className="text-sm font-semibold tracking-wide text-midground uppercase font-mono">
                Active Markets
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0 flex flex-col gap-2.5 overflow-y-auto max-h-96 scrollbar-none">
              {markets.map((m) => {
                const isActive = activeMarket?.id === m.id;
                const prob = Math.round(m.probability_yes * 100);
                return (
                  <div
                    key={m.id}
                    onClick={() => selectMarket(m)}
                    className={`flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border cursor-pointer transition-all duration-300 font-mono ${
                      isActive
                        ? "bg-purple-500/15 border-purple-500/25 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.12)] font-semibold scale-[1.02]"
                        : "border-purple-500/5 bg-background-base/20 hover:bg-background-base/40 text-purple-400 hover:text-purple-300 hover:border-purple-500/15"
                    }`}
                  >
                    <div className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-[0.75rem] font-bold text-purple-100 truncate">
                        {m.title}
                      </span>
                      <div className="flex items-center gap-2.5 text-[0.62rem] text-purple-400/40">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {timeAgo(m.expires_at * 1000)}
                        </span>
                        <span>·</span>
                        <span>{m.liquidity_pool.toFixed(1)} cr pool</span>
                      </div>
                    </div>

                    <div className="shrink-0 flex flex-col items-end">
                      <span className={`text-[0.8rem] font-extrabold font-mono ${prob >= 50 ? "text-emerald-400" : "text-rose-400"}`}>
                        {prob}%
                      </span>
                      <span className="text-[0.55rem] text-purple-400/30 uppercase font-bold tracking-wider">
                        YES ODDS
                      </span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Leaderboard Card */}
          <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
            <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <Award className="h-4.5 w-4.5" />
                </div>
                <CardTitle className="text-sm font-semibold tracking-wide text-midground">
                  SWARM LEADERBOARD
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0 flex flex-col gap-2.5 font-mono text-xs">
              {leaderboard.map((entry, idx) => (
                <div
                  key={entry.agent_id}
                  className="flex items-center justify-between border-b border-purple-500/5 pb-2.5 last:pb-0 last:border-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-purple-400/35 font-bold">#{idx + 1}</span>
                    <span className="font-semibold text-purple-200 truncate">{entry.agent_id}</span>
                  </div>
                  <span className="font-bold text-white font-mono">{entry.credits.toFixed(1)} cr</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Trade Slider Overlay Modal */}
      {showTradeModal && activeMarket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="relative w-full max-w-md border border-purple-500/15 bg-black/90 p-6 rounded-2xl shadow-2xl flex flex-col gap-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
              <h3 className="text-sm font-bold text-purple-100 flex items-center gap-2">
                {tradeType === "BUY_YES" ? (
                  <TrendingUp className="h-4.5 w-4.5 text-emerald-400" />
                ) : (
                  <TrendingDown className="h-4.5 w-4.5 text-rose-400" />
                )}
                PLACE CONSENSUS BET
              </h3>
              <button
                onClick={() => setShowTradeModal(false)}
                className="text-purple-400 hover:text-purple-100 hover:bg-purple-500/10 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                Target Market
              </span>
              <span className="font-bold text-purple-200">
                {activeMarket.title}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 bg-purple-950/5 border border-purple-500/5 rounded-xl p-3.5">
              <div>
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold">Bet Type</span>
                <div className={`font-bold mt-0.5 text-sm ${tradeType === "BUY_YES" ? "text-emerald-400" : "text-rose-400"}`}>
                  {tradeType === "BUY_YES" ? "YES (ACQUISITION)" : "NO (REJECTION)"}
                </div>
              </div>
              <div>
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold">Unit Price</span>
                <div className="font-bold mt-0.5 text-sm text-purple-100">
                  {(tradeType === "BUY_YES" ? activeMarket.price_yes : activeMarket.price_no).toFixed(2)} cr
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                  Shares to Buy
                </span>
                <span className="font-bold text-purple-300">{tradeShares} shares</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={tradeShares}
                onChange={(e) => setTradeShares(e.target.value)}
                className="w-full accent-purple-500 h-1.5 bg-purple-950/40 rounded-lg cursor-pointer border border-purple-500/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                Consensus Rationale (Optional)
              </span>
              <textarea
                placeholder="Write why you believe this outcome is statistically most probable..."
                value={tradeRationale}
                onChange={(e) => setTradeRationale(e.target.value)}
                className="w-full bg-black/40 border border-purple-500/10 rounded-lg px-3 py-2 text-xs text-purple-200 placeholder:text-purple-400/20 focus-visible:outline-none focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 min-h-[60px]"
              />
            </div>

            <div className="border-t border-purple-500/10 pt-3 flex items-center justify-between bg-purple-950/5 border border-purple-500/5 rounded-xl p-3.5">
              <div className="flex flex-col">
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold">Total Estimated Cost</span>
                <span className="text-base font-bold text-emerald-400 font-mono">{tradeCostEstimate.toFixed(2)} cr</span>
              </div>
              <Button
                onClick={handlePlaceTrade}
                disabled={placingTrade || tradeCostEstimate > userBalance}
                className="cursor-pointer bg-primary text-white font-bold py-2 px-5 font-mono uppercase text-xs rounded-xl"
              >
                {placingTrade ? "placing..." : "confirm trade"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Market Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <form
            onSubmit={handleCreateMarket}
            className="relative w-full max-w-md border border-purple-500/15 bg-black/90 p-6 rounded-2xl shadow-2xl flex flex-col gap-4 font-mono text-xs"
          >
            <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
              <h3 className="text-sm font-bold text-purple-100 flex items-center gap-2">
                <Plus className="h-4.5 w-4.5 text-purple-400" />
                CREATE NEW PREDICTION
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-purple-400 hover:text-purple-100 hover:bg-purple-500/10 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                Prediction Hypothesis (Title)
              </span>
              <Input
                type="text"
                placeholder="e.g. Will gemini-2.5-pro successfully compile with 0 lint errors?"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                className="h-9 px-3 bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 placeholder:text-purple-400/20 focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                Hypothesis Description
              </span>
              <textarea
                placeholder="Provide detail specifications or criteria required to resolve this market outcome objectively."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-black/40 border border-purple-500/10 rounded-lg px-3 py-2 text-xs text-purple-200 placeholder:text-purple-400/20 focus-visible:outline-none focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 min-h-[60px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                  Category
                </span>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="h-9 px-3 bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 focus-visible:outline-none focus:border-purple-500/30 font-mono text-xs"
                >
                  <option value="general">General</option>
                  <option value="codebase">Codebase</option>
                  <option value="real-world">Real World</option>
                  <option value="performance">Performance</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">
                  Lifespan (Hours)
                </span>
                <select
                  value={newHours}
                  onChange={(e) => setNewHours(e.target.value)}
                  className="h-9 px-3 bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 focus-visible:outline-none focus:border-purple-500/30 font-mono text-xs"
                >
                  <option value="1">1 Hour</option>
                  <option value="12">12 Hours</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="168">168 Hours (7 Days)</option>
                </select>
              </div>
            </div>

            <Button
              type="submit"
              disabled={creatingMarket}
              className="cursor-pointer bg-primary text-white font-bold py-2.5 px-5 font-mono uppercase text-xs rounded-xl mt-2 w-full flex items-center justify-center gap-1.5"
            >
              {creatingMarket ? "creating..." : "launch prediction pool"}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function timeAgo(epochMs: number): string {
  const diff = epochMs - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / 3600000);
  if (hours >= 24) return `${Math.floor(hours / 24)}d left`;
  return `${hours}h left`;
}
