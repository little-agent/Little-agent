import { useEffect, useState, useCallback, useRef } from "react";
import {
  TrendingUp,
  MessageSquare,
  Award,
  Plus,
  Calendar,
  X,
  TrendingDown,
  Info,
  Shield,
  FileCode,
  Database,
  Copy,
  Check,
  ExternalLink,
  Cpu,
  Wallet,
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

interface Web3Block {
  number: number;
  hash: string;
  parent_hash: string;
  timestamp: number;
  gas_used: number;
  gas_limit: number;
  miner: string;
}

interface Web3Tx {
  hash: string;
  block_number: number;
  from_address: string;
  to_address: string;
  value: number;
  gas_price: number;
  gas_used: number;
  input_data: string;
  status: number;
  timestamp: number;
  event_logs: any[] | null;
}

interface Web3Wallet {
  agent_id: string;
  address: string;
  private_key: string;
  balance: number;
  nonce: number;
}

interface ContractInfo {
  address: string;
  abi: any[];
  solidity_code: string;
  network?: string;
  network_name?: string;
  chain_id?: number;
  rpc_url?: string;
  explorer_url?: string;
}

export default function PredictionMarketPage() {
  const [activeTab, setActiveTab] = useState<"predictions" | "contracts" | "explorer">("predictions");
  const [markets, setMarkets] = useState<Market[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMarket, setActiveMarket] = useState<Market | null>(null);

  // Web3 State
  const [wallets, setWallets] = useState<Web3Wallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<Web3Wallet | null>(null);
  const [blocks, setBlocks] = useState<Web3Block[]>([]);
  const [txs, setTxs] = useState<Web3Tx[]>([]);
  const [contractInfo, setContractInfo] = useState<ContractInfo | null>(null);
  const [selectedTx, setSelectedTx] = useState<Web3Tx | null>(null);
  
  // Wallet modal/drawer
  const [showWalletDrawer, setShowWalletDrawer] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Modals / Overlays
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState<"BUY_YES" | "BUY_NO">("BUY_YES");
  const [showMetaMaskSign, setShowMetaMaskSign] = useState(false);

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

  // Use refs for mutable state to avoid recreating loadData on every state change
  const activeMarketRef = useRef(activeMarket);
  activeMarketRef.current = activeMarket;
  const selectedWalletRef = useRef(selectedWallet);
  selectedWalletRef.current = selectedWallet;
  const contractInfoRef = useRef(contractInfo);
  contractInfoRef.current = contractInfo;

  const loadData = useCallback(async () => {
    try {
      // 1. Markets
      const marketsData = await fetchJSON<Market[]>("/api/prediction-market/markets");
      setMarkets(marketsData);
      
      // 2. Trades
      const tradesData = await fetchJSON<Trade[]>("/api/prediction-market/trades");
      setTrades(tradesData);
      
      // 3. Leaderboard
      const leaderboardData = await fetchJSON<LeaderboardEntry[]>("/api/prediction-market/leaderboard");
      setLeaderboard(leaderboardData);

      // 4. Web3 Wallets
      const walletsData = await fetchJSON<Web3Wallet[]>("/api/prediction-market/web3/wallets");
      setWallets(walletsData);

      // Deterministic selected wallet if not set
      const curWallet = selectedWalletRef.current;
      if (walletsData.length > 0 && !curWallet) {
        const human = walletsData.find(w => w.agent_id === "HumanOperator") || walletsData[0];
        setSelectedWallet(human);
      } else if (curWallet) {
        const updated = walletsData.find(w => w.agent_id === curWallet.agent_id);
        if (updated) setSelectedWallet(updated);
      }

      // 5. Blocks & Txs
      const blocksData = await fetchJSON<Web3Block[]>("/api/prediction-market/web3/blocks");
      setBlocks(blocksData);

      const txsData = await fetchJSON<Web3Tx[]>("/api/prediction-market/web3/transactions");
      setTxs(txsData);

      // 6. Contract Info (only once)
      if (!contractInfoRef.current) {
        const contractData = await fetchJSON<ContractInfo>("/api/prediction-market/web3/contract");
        setContractInfo(contractData);
      }
      
      const curMarket = activeMarketRef.current;
      if (marketsData.length > 0 && !curMarket) {
        const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${marketsData[0].id}`);
        setActiveMarket(detailed);
      } else if (curMarket) {
        const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${curMarket.id}`);
        setActiveMarket(detailed);
      }
    } catch (err) {
      console.error("Failed to fetch prediction market data:", err);
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies — uses refs for mutable state

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Compute trade cost estimate
  useEffect(() => {
    if (!activeMarket) return;
    const shares = parseFloat(tradeShares);
    if (isNaN(shares) || shares <= 0) {
      setTradeCostEstimate(0.0);
      return;
    }
    
    // LMSR AMM formula simulation
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const selectMarket = async (m: Market) => {
    setActiveTab("predictions");
    try {
      const detailed = await fetchJSON<Market>(`/api/prediction-market/markets/${m.id}`);
      setActiveMarket(detailed);
    } catch {
      setActiveMarket(m);
    }
  };

  const handleCreateMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !selectedWallet) return;
    setCreatingMarket(true);
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + parseInt(newHours) * 3600;
      const res = await fetchJSON<any>("/api/prediction-market/markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc || null,
          creator_agent_id: selectedWallet.agent_id,
          expires_at: expiresAt,
          category: newCategory,
        }),
      });
      showToast(`Mined Block! Market created on-chain. Tx Hash: ${res.tx_hash.slice(0, 14)}...`, "success");
      setNewTitle("");
      setNewDesc("");
      setShowCreateModal(false);
      loadData();
    } catch (err) {
      showToast("Failed to create market on-chain.", "error");
    } finally {
      setCreatingMarket(false);
    }
  };

  const executeTradeOnChain = async () => {
    if (!activeMarket || !selectedWallet) return;
    const shares = parseFloat(tradeShares);
    if (isNaN(shares) || shares <= 0) return;
    
    setPlacingTrade(true);
    setShowMetaMaskSign(true);

    // Artificial transaction signing animation
    setTimeout(async () => {
      try {
        const res = await fetchJSON<any>(`/api/prediction-market/markets/${activeMarket.id}/trade`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent_id: selectedWallet.agent_id,
            trade_type: tradeType,
            shares,
            rationale: tradeRationale || null,
          }),
        });
        showToast(`Mined Tx! Bought shares. Tx Hash: ${res.tx_hash.slice(0, 14)}...`, "success");
        setTradeRationale("");
        setShowTradeModal(false);
        setShowMetaMaskSign(false);
        loadData();
      } catch (err: any) {
        showToast(err.message || "On-chain Transaction Reverted.", "error");
        setShowMetaMaskSign(false);
      } finally {
        setPlacingTrade(false);
      }
    }, 1800);
  };

  const handleResolveMarket = async (outcome: "YES" | "NO") => {
    if (!activeMarket) return;
    try {
      const res = await fetchJSON<any>(`/api/prediction-market/markets/${activeMarket.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      showToast(`Mined Tx! Resolved outcome ${outcome}. Tx Hash: ${res.tx_hash.slice(0, 14)}...`, "success");
      loadData();
    } catch (err) {
      showToast("Only oracle addresses are authorized resolvers.", "error");
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
    <div className="flex min-w-0 w-full max-w-full flex-col gap-5 relative">
      <Toast toast={toast} />

      {/* Amethyst glass header bar */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 bg-purple-950/[0.04] border border-purple-500/10 p-4 rounded-2xl shadow-xl backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-2.5 sm:flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
            <TrendingUp className="h-5 w-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold tracking-wider text-purple-100 uppercase font-mono flex items-center gap-1.5">
              AI-Native Web3 Prediction Market
              <span className={`text-[0.55rem] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest font-mono ${contractInfo?.network === 'local' ? 'bg-purple-500/10 border border-purple-500/30 text-purple-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                {contractInfo?.network === 'local' ? 'Simulated EVM' : 'Fuji Testnet'}
              </span>
            </h2>
            <p className="text-[0.68rem] text-purple-400/50 font-mono mt-0.5">
              Smart contract consensus engine driving agent swarms with on-chain credit tokens.
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3.5 sm:shrink-0 font-mono text-xs">
          {/* Tabs Navigation */}
          <div className="flex p-0.5 rounded-xl bg-black/40 border border-purple-500/10">
            <button
              onClick={() => setActiveTab("predictions")}
              className={`px-3 py-1.5 rounded-lg text-[0.7rem] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                activeTab === "predictions" ? "bg-purple-500/25 text-purple-200 border border-purple-500/20" : "text-purple-400/60 hover:text-purple-300"
              }`}
            >
              Predictions
            </button>
            <button
              onClick={() => setActiveTab("contracts")}
              className={`px-3 py-1.5 rounded-lg text-[0.7rem] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                activeTab === "contracts" ? "bg-purple-500/25 text-purple-200 border border-purple-500/20" : "text-purple-400/60 hover:text-purple-300"
              }`}
            >
              Contracts
            </button>
            <button
              onClick={() => setActiveTab("explorer")}
              className={`px-3 py-1.5 rounded-lg text-[0.7rem] uppercase font-bold tracking-wider transition-all cursor-pointer ${
                activeTab === "explorer" ? "bg-purple-500/25 text-purple-200 border border-purple-500/20" : "text-purple-400/60 hover:text-purple-300"
              }`}
            >
              Explorer
            </button>
          </div>

          {/* Web3 Wallet capsule button */}
          {selectedWallet && (
            <button
              onClick={() => setShowWalletDrawer(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/5 border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-500/10 shadow-lg cursor-pointer transition-all active:scale-95"
            >
              <Wallet className="h-4 w-4 text-purple-400" />
              <div className="flex flex-col items-start leading-none font-mono text-[0.68rem]">
                <span className="text-purple-300/60 text-[0.55rem] font-bold uppercase">Wallet ({selectedWallet.agent_id})</span>
                <span className="text-white font-bold tracking-wider mt-0.5">
                  {selectedWallet.address.slice(0, 6)}...{selectedWallet.address.slice(-4)}
                </span>
              </div>
              <Badge tone="success" className="text-[0.62rem] font-mono px-1.5 py-0.5 rounded font-bold shadow bg-emerald-500/10 border-emerald-500/20 text-emerald-300">
                {selectedWallet.balance.toFixed(0)} cr
              </Badge>
            </button>
          )}

          <Button
            size="sm"
            onClick={() => setShowCreateModal(true)}
            className="cursor-pointer bg-primary hover:bg-primary-hover font-mono font-bold text-xs uppercase"
            prefix={<Plus className="h-3.5 w-3.5" />}
          >
            New Pool
          </Button>
        </div>
      </div>

      {activeTab === "predictions" && (
        <div className="grid gap-5 lg:grid-cols-12 items-start animate-fade-in">
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

                    {activeMarket.status === "OPEN" && selectedWallet?.agent_id === "HumanOperator" && (
                      <div className="flex gap-2 border-t border-purple-500/10 pt-3 mt-1 justify-end items-center">
                        <span className="text-[0.62rem] text-purple-400/40 font-bold uppercase tracking-wider mr-auto">Oracle Action</span>
                        <Button
                          size="xs"
                          className="cursor-pointer bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 font-bold animate-pulse"
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
                      <span className="text-purple-400/35 font-bold font-mono">#{idx + 1}</span>
                      <span className="font-semibold text-purple-200 truncate">{entry.agent_id}</span>
                    </div>
                    <span className="font-bold text-white font-mono">{entry.credits.toFixed(0)} CREDIT</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Contracts Tab: View Solidity & Deployment state */}
      {activeTab === "contracts" && contractInfo && (
        <div className="grid gap-5 lg:grid-cols-12 items-start animate-fade-in font-mono text-xs">
          {/* Smart Contract Properties */}
          <div className="lg:col-span-4 flex flex-col gap-5">
            <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
                <CardTitle className="text-sm font-semibold tracking-wide text-midground flex items-center gap-2">
                  <Shield className="h-4.5 w-4.5 text-purple-400" />
                  CONTRACT METADATA
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 flex flex-col gap-4 font-mono text-xs">
                <div className="flex flex-col gap-1 bg-black/40 border border-purple-500/5 rounded-xl p-3.5">
                  <span className="text-[0.6rem] text-purple-400/40 uppercase font-bold tracking-wider">Contract Address</span>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-purple-200 text-[0.7rem] select-all truncate">{contractInfo.address}</span>
                    <button
                      onClick={() => copyToClipboard(contractInfo.address, "addr")}
                      className="text-purple-400 hover:text-white cursor-pointer active:scale-90"
                    >
                      {copiedText === "addr" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 text-[0.7rem]">
                  <div className="flex flex-col bg-purple-950/10 border border-purple-500/5 rounded-xl p-3">
                    <span className="text-[0.55rem] text-purple-400/40 uppercase font-bold">Compiler</span>
                    <span className="text-purple-200 mt-1 font-bold">solc 0.8.20</span>
                  </div>
                  <div className="flex flex-col bg-purple-950/10 border border-purple-500/5 rounded-xl p-3">
                    <span className="text-[0.55rem] text-purple-400/40 uppercase font-bold">Gas Limit</span>
                    <span className="text-purple-200 mt-1 font-bold">30,000,000</span>
                  </div>
                  <div className="flex flex-col bg-purple-950/10 border border-purple-500/5 rounded-xl p-3">
                    <span className="text-[0.55rem] text-purple-400/40 uppercase font-bold">Gas Price</span>
                    <span className="text-purple-200 mt-1 font-bold">25.0 Gwei</span>
                  </div>
                  <div className="flex flex-col bg-purple-950/10 border border-purple-500/5 rounded-xl p-3">
                    <span className="text-[0.55rem] text-purple-400/40 uppercase font-bold">Network</span>
                    <span className="text-emerald-400 mt-1 font-bold flex items-center gap-1">
                      <span className="inline-block h-1.5 w-1.5 bg-emerald-400 rounded-full animate-ping" />
                      {contractInfo.network_name || "Local EVM"} ({contractInfo.chain_id || 1337})
                    </span>
                  </div>
                </div>

                {/* Deployment log */}
                <div className="flex flex-col gap-2">
                  <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">Deployment Log</span>
                  <div className="bg-black/60 border border-purple-500/10 rounded-xl p-3.5 h-36 font-mono text-[0.68rem] text-purple-400/70 overflow-y-auto leading-relaxed scrollbar-none">
                    <p className="text-emerald-400 font-bold">[solcx] Compiling PredictionMarket.sol (solc 0.8.20)...</p>
                    <p className="text-purple-300 mt-1">[solcx] Compilation successful. ABI + Bytecode generated.</p>
                    <p className="text-purple-300 mt-1">[web3] Connecting to {contractInfo.network_name || "EVM"} (Chain ID: {contractInfo.chain_id || "?"})...</p>
                    <p className="text-emerald-400 font-bold mt-1">[web3] ✓ Connected. RPC: {contractInfo.rpc_url || "local"}</p>
                    <p className="text-purple-300 mt-1">[deploy] Deploying PredictionMarket to {contractInfo.address}</p>
                    <p className="text-emerald-400 font-bold">[deploy] ✓ Contract deployed successfully on {contractInfo.network_name || "network"}.</p>
                    {contractInfo.explorer_url && (
                      <p className="text-cyan-400 mt-1">[explorer] <a href={`${contractInfo.explorer_url}/address/${contractInfo.address}`} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">{contractInfo.explorer_url}/address/{contractInfo.address}</a></p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Solidity Code Viewer */}
          <div className="lg:col-span-8">
            <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10 flex items-center justify-between">
                <CardTitle className="text-sm font-semibold tracking-wide text-midground flex items-center gap-2 font-mono">
                  <FileCode className="h-4.5 w-4.5 text-purple-400" />
                  PREDICTIONMARKET.SOL
                </CardTitle>
                <Badge tone="outline" className="text-[0.65rem] border border-purple-500/30 bg-purple-950/20 text-purple-300">
                  Read Only
                </Badge>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <div className="bg-black/40 border border-purple-500/5 rounded-xl p-4 overflow-x-auto h-[480px] font-mono text-[0.68rem] leading-relaxed text-purple-200/80 scrollbar-none whitespace-pre select-text">
                  {contractInfo.solidity_code || "// Solidity source code missing."}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Explorer Tab: simulated on-chain block/tx list */}
      {activeTab === "explorer" && (
        <div className="grid gap-5 lg:grid-cols-12 items-start animate-fade-in font-mono text-xs">
          {/* Blocks List */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10 flex items-center gap-2">
                <Database className="h-4.5 w-4.5 text-purple-400" />
                <CardTitle className="text-sm font-semibold tracking-wide text-midground">
                  ON-CHAIN BLOCKS
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 flex flex-col gap-2 overflow-y-auto max-h-[480px] scrollbar-none">
                {blocks.map((b) => (
                  <div
                    key={b.number}
                    className="flex flex-col gap-1 border border-purple-500/5 bg-background-base/20 p-3 rounded-xl transition-all hover:bg-background-base/40 hover:border-purple-500/15"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-[0.72rem]">Block #{b.number}</span>
                      <span className="text-[0.62rem] text-purple-400/40">
                        {new Date(b.timestamp * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[0.65rem] text-purple-400/50 mt-1">
                      <span className="font-mono truncate mr-4">Hash: {b.hash.slice(0, 16)}...</span>
                      <span>Gas: {b.gas_used.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Transactions List */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            <Card className="border border-purple-500/10 bg-card p-5 backdrop-blur-md shadow-2xl rounded-2xl">
              <CardHeader className="px-0 pt-0 pb-3 mb-3 border-b border-purple-500/10">
                <CardTitle className="text-sm font-semibold tracking-wide text-midground">
                  ON-CHAIN TRANSACTIONS
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0 pb-0 flex flex-col gap-2.5 overflow-y-auto max-h-[480px] scrollbar-none">
                {txs.length === 0 ? (
                  <p className="text-center py-10 text-purple-400/30 uppercase tracking-wider font-mono">
                    No transactions compiled on-chain yet.
                  </p>
                ) : (
                  txs.map((tx) => (
                    <div
                      key={tx.hash}
                      onClick={() => setSelectedTx(tx)}
                      className="flex flex-col gap-1 border border-purple-500/5 bg-background-base/20 p-3 rounded-xl cursor-pointer hover:bg-background-base/40 hover:border-purple-500/15 transition-all text-xs font-mono"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-purple-300 font-bold text-[0.7rem] truncate select-all">
                          Tx: {tx.hash.slice(0, 16)}...
                        </span>
                        <Badge tone={tx.status === 1 ? "success" : "destructive"} className="text-[0.55rem] px-1 py-0.5 rounded">
                          {tx.status === 1 ? "SUCCESS" : "REVERTED"}
                        </Badge>
                      </div>
                      <p className="text-[0.68rem] text-purple-400/60 leading-relaxed font-mono font-bold mt-1 truncate">
                        Input: {tx.input_data}
                      </p>
                      <div className="flex items-center justify-between text-[0.62rem] text-purple-400/40 mt-1">
                        <span>Block #{tx.block_number}</span>
                        <span>Gas Used: {tx.gas_used.toFixed(0)} units</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Transaction Receipt Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in font-mono text-xs">
          <div className="relative w-full max-w-lg border border-purple-500/15 bg-black/90 p-6 rounded-2xl shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-purple-500/10 pb-3">
              <h3 className="text-sm font-bold text-purple-100 flex items-center gap-2 uppercase">
                <ExternalLink className="h-4.5 w-4.5 text-purple-400" />
                TRANSACTION RECEIPT
              </h3>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-purple-400 hover:text-purple-100 hover:bg-purple-500/10 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 font-mono text-[0.72rem] bg-black/40 border border-purple-500/5 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <span className="text-purple-400/50 uppercase font-bold">Transaction Hash</span>
                <span className="text-white font-bold select-all">{selectedTx.hash}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/50 uppercase font-bold">Status</span>
                <Badge tone={selectedTx.status === 1 ? "success" : "destructive"} className="px-2 py-0.5 rounded font-bold uppercase">
                  {selectedTx.status === 1 ? "Success (Confirmed)" : "Reverted"}
                </Badge>
              </div>
              <div className="flex items-center justify-between border-t border-purple-500/5 pt-2.5">
                <span className="text-purple-400/50 uppercase font-bold">Block Number</span>
                <span className="text-purple-200 font-bold">#{selectedTx.block_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/50 uppercase font-bold">Gas Used</span>
                <span className="text-purple-200 font-bold">{selectedTx.gas_used.toFixed(0)} units</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-purple-400/50 uppercase font-bold">Value Transferred</span>
                <span className="text-emerald-400 font-extrabold">{selectedTx.value.toFixed(2)} CREDIT</span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-purple-500/5 pt-2.5 mt-0.5">
                <span className="text-purple-400/50 uppercase font-bold">Raw Method Call (Input Data)</span>
                <span className="bg-black/60 border border-purple-500/10 rounded px-2.5 py-1.5 text-[0.68rem] text-purple-300 font-bold break-all select-all">
                  {selectedTx.input_data}
                </span>
              </div>
            </div>

            {selectedTx.event_logs && selectedTx.event_logs.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">On-Chain Event Logs Emitted</span>
                {selectedTx.event_logs.map((ev, index) => (
                  <div key={index} className="bg-purple-950/10 border border-purple-500/10 rounded-xl p-3.5 flex flex-col gap-2 font-mono text-[0.68rem] leading-relaxed">
                    <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                      <Cpu className="h-3.5 w-3.5" />
                      Event: {ev.event}
                    </span>
                    <div className="grid grid-cols-2 gap-2 mt-1 border-t border-purple-500/5 pt-2 text-purple-200/80">
                      {Object.entries(ev.args).map(([k, v]: any) => (
                        <div key={k} className="flex flex-col gap-0.5">
                          <span className="text-[0.55rem] text-purple-400/40 font-bold uppercase">{k}</span>
                          <span className="font-semibold break-all select-all text-purple-100">{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Web3 MetaMask Style transaction signature modal */}
      {showMetaMaskSign && activeMarket && selectedWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in font-mono text-xs">
          <div className="relative w-full max-w-sm border border-purple-500/20 bg-black/95 p-6 rounded-2xl shadow-3xl flex flex-col gap-5">
            <div className="flex items-center gap-3 border-b border-purple-500/10 pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-400 animate-pulse border border-purple-500/30">
                <Shield className="h-5.5 w-5.5 animate-spin-slow" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">Sign transaction</h3>
                <span className="text-[0.62rem] text-purple-400/50 uppercase font-mono mt-0.5">Origin: Swarm Cockpit (1337)</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 font-mono text-[0.7rem] bg-purple-950/5 border border-purple-500/10 rounded-xl p-3.5">
              <div className="flex justify-between">
                <span className="text-purple-400/40 font-bold uppercase">Contract Address</span>
                <span className="text-purple-200 truncate select-all max-w-[160px] font-bold">0x89205A...6Cc2</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-400/40 font-bold uppercase">Function</span>
                <span className="text-emerald-400 font-extrabold">placeTrade(...)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-400/40 font-bold uppercase">Gas Limit</span>
                <span className="text-purple-200 font-bold">{(45000 + parseFloat(tradeShares) * 10).toFixed(0)} units</span>
              </div>
              <div className="flex justify-between border-t border-purple-500/5 pt-2.5">
                <span className="text-purple-400/40 font-bold uppercase">Est. Transaction Fee</span>
                <span className="text-purple-200 font-bold">0.0011 cr</span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center py-4 bg-purple-500/5 border border-purple-500/10 rounded-xl">
              <span className="text-xs text-purple-400/50 uppercase font-bold tracking-widest font-mono">{contractInfo?.network === 'local' ? 'Simulated Web3 Mining' : 'Avalanche Fuji Mining'}</span>
              <div className="flex items-center gap-2.5 mt-2">
                <Spinner className="text-purple-400 text-base" />
                <span className="text-purple-200 font-bold uppercase animate-pulse tracking-wide font-mono text-xs">Waiting for block confirmations...</span>
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-1">
              <Button
                disabled={true}
                className="flex-1 cursor-not-allowed bg-purple-500/10 text-purple-400"
              >
                Sign Message
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet drawer/panel */}
      {showWalletDrawer && selectedWallet && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-purple-500/15 bg-black/95 p-6 shadow-3xl flex flex-col gap-5 animate-slide-in font-mono text-xs">
          <div className="flex items-center justify-between border-b border-purple-500/10 pb-4">
            <h3 className="text-sm font-bold text-purple-100 flex items-center gap-2">
              <Wallet className="h-4.5 w-4.5 text-purple-400" />
              SWARM WEB3 ACCOUNTS
            </h3>
            <button
              onClick={() => setShowWalletDrawer(false)}
              className="text-purple-400 hover:text-purple-100 hover:bg-purple-500/10 p-1.5 rounded-lg cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          <div className="flex flex-col gap-4 overflow-y-auto max-h-[380px] scrollbar-none pr-1">
            <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider">Select Active Trader Wallet</span>
            {wallets.map((w) => {
              const isSelected = selectedWallet.agent_id === w.agent_id;
              return (
                <div
                  key={w.agent_id}
                  onClick={() => setSelectedWallet(w)}
                  className={`flex flex-col gap-2 p-3.5 border rounded-xl cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? "bg-purple-500/15 border-purple-500/25 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.12)] font-semibold"
                      : "border-purple-500/5 bg-background-base/20 hover:bg-background-base/40 text-purple-400 hover:text-purple-300 hover:border-purple-500/15"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-purple-100">{w.agent_id}</span>
                    <Badge tone="success" className="text-[0.6rem] px-2 py-0.5 rounded font-mono">
                      {w.balance.toFixed(0)} cr
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[0.65rem] text-purple-400/50 font-mono mt-1 leading-none">
                    <span>Address: {w.address.slice(0, 12)}...{w.address.slice(-6)}</span>
                    <span>Nonce: {w.nonce}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Wallet Details with simulated private key */}
          <div className="mt-auto border-t border-purple-500/10 pt-4 flex flex-col gap-3 font-mono text-[0.72rem] bg-purple-950/5 border border-purple-500/10 rounded-xl p-4">
            <span className="text-[0.62rem] text-purple-400/40 uppercase font-bold tracking-wider mb-1">Active Wallet Credentials</span>
            <div className="flex flex-col">
              <span className="text-[0.55rem] text-purple-400/40 font-bold uppercase">Address</span>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-semibold text-purple-200 select-all truncate mr-2">{selectedWallet.address}</span>
                <button
                  onClick={() => copyToClipboard(selectedWallet.address, "addr-det")}
                  className="text-purple-400 hover:text-white cursor-pointer"
                >
                  {copiedText === "addr-det" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
            
            <div className="flex flex-col border-t border-purple-500/5 pt-2">
              <div className="flex items-center justify-between">
                <span className="text-[0.55rem] text-purple-400/40 font-bold uppercase">Private Key</span>
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="text-[0.58rem] text-purple-400 hover:text-white font-bold cursor-pointer underline uppercase tracking-wider leading-none"
                >
                  {showPrivateKey ? "Hide" : "Show"}
                </button>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="font-bold text-rose-400/90 break-all select-all font-mono">
                  {showPrivateKey ? selectedWallet.private_key : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                </span>
                {showPrivateKey && (
                  <button
                    onClick={() => copyToClipboard(selectedWallet.private_key, "pk")}
                    className="text-purple-400 hover:text-white cursor-pointer shrink-0 ml-2"
                  >
                    {copiedText === "pk" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
                onClick={executeTradeOnChain}
                disabled={placingTrade || !selectedWallet || tradeCostEstimate > selectedWallet.balance}
                className="cursor-pointer bg-primary text-white font-bold py-2 px-5 font-mono uppercase text-xs rounded-xl"
              >
                {placingTrade ? "placing..." : "confirm bet"}
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
                className="h-9 px-3 bg-black/40 border border-purple-500/10 rounded-lg text-purple-200 placeholder:text-purple-400/20 focus:border-purple-500/30 focus:ring-1 focus:ring-purple-500/10 font-mono text-xs"
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
              className="cursor-pointer bg-primary text-white font-bold py-2.5 px-5 font-mono uppercase text-xs rounded-xl mt-2 w-full flex items-center justify-center gap-1.5 font-mono"
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
