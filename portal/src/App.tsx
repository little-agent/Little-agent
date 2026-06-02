import { useEffect, useState } from 'react'
import { 
  Terminal as TerminalIcon, 
  Copy, 
  Check, 
  Cpu, 
  BookOpen, 
  TrendingUp, 
  ArrowUpRight, 
  Layers, 
  ShieldCheck, 
  X, 
  RefreshCw 
} from 'lucide-react'

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
}

function App() {
  const [markets, setMarkets] = useState<Market[]>([])
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [showWhitepaper, setShowWhitepaper] = useState(false)
  const [showDocs, setShowDocs] = useState(false)
  const [activeDocsTab, setActiveDocsTab] = useState<'quickstart' | 'tokenomics' | 'swarm'>('quickstart')
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch live prediction market pools from our new public endpoint
  useEffect(() => {
    let active = true;
    const fetchMarkets = async () => {
      try {
        const res = await fetch('/api/prediction-market/markets')
        if (res.ok) {
          const data = await res.json()
          if (active) {
            setMarkets(data)
            setLoading(false)
          }
        }
      } catch (err) {
        console.error("Failed to fetch live markets:", err)
      }
    }

    fetchMarkets()
    const interval = setInterval(fetchMarkets, 5000)
    return () => {
      active = false;
      clearInterval(interval)
    }
  }, [refreshKey])

  const copyInstallCmd = () => {
    navigator.clipboard.writeText('curl -fsSL https://raw.githubusercontent.com/little-agent/Little-agent/main/scripts/install.sh | bash')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Helper to calculate YES probability based on pool shares
  const getYesProbability = (market: Market) => {
    const total = Number(market.yes_shares) + Number(market.no_shares);
    if (total === 0) return 50;
    return Math.round((Number(market.yes_shares) / total) * 100);
  }

  return (
    <div className="container">
      {/* Top Header / Navigation */}
      <header className="header-nav">
        <div className="logo-container" onClick={() => window.location.reload()}>
          <div className="logo-icon">
            <Cpu size={20} className="text-white" />
          </div>
          <span className="logo-text">Little Agent</span>
        </div>
        <div className="nav-links">
          <span className="nav-link" onClick={() => setShowWhitepaper(true)}>Whitepaper</span>
          <span className="nav-link" onClick={() => { setShowDocs(true); setActiveDocsTab('quickstart'); }}>Docs</span>
          <a href="https://github.com/little-agent/Little-agent" className="nav-link" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="badge-status">
          <span className="pulse-dot"></span>
          Live Swarm Running on Fuji
        </div>
        <h1 className="hero-title">
          Autonomous AI Agent Swarms <br />
          <span className="grad">Driving Web3 Prediction Markets</span>
        </h1>
        <p className="hero-desc">
          An on-chain consensus engine where specialized AI agents continuously evaluate global metrics, trade on-chain credit pools using Hanson's LMSR formulation, and establish decentralized oracle beliefs on Avalanche Fuji.
        </p>
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '4rem' }}>
          <button className="btn-primary" style={{ padding: '0.8rem 2rem', fontSize: '1rem' }} onClick={() => setShowWhitepaper(true)}>
            <BookOpen size={16} style={{ marginRight: '0.5rem', verticalAlign: 'middle', display: 'inline' }} />
            Read Whitepaper
          </button>
        </div>
      </section>

      {/* Main Grid: Interactive Terminal & Live Odds */}
      <main className="dashboard-grid">
        
        {/* Left Column: Live Odds */}
        <section className="glass-card">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={20} />
              Live Swarm Odds (Avalanche Fuji)
            </span>
            <button 
              onClick={() => setRefreshKey(k => k + 1)}
              style={{ background: 'transparent', border: 'none', color: '#a855f7', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="odds-container">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: '#94a3b8' }}>
                <span className="animate-pulse">Syncing smart contract pools...</span>
              </div>
            ) : markets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem 0', color: '#94a3b8' }}>
                No active pools found in current sqlite cache.
              </div>
            ) : (
              markets.map((m) => {
                const yesProb = getYesProbability(m);
                return (
                  <div className="market-item" key={m.id}>
                    <div className="market-header">
                      <h4 className="market-title">{m.title}</h4>
                      <span className="market-category">{m.category}</span>
                    </div>

                    <div className="odds-progress-container">
                      <span className="odds-label yes">YES</span>
                      <div className="odds-bar">
                        <div className="odds-bar-fill-yes" style={{ width: `${yesProb}%` }}></div>
                      </div>
                      <span className="odds-label no">{yesProb}%</span>
                    </div>

                    <div className="odds-meta">
                      <div className="odds-meta-item">
                        <span>Pool Liquidity:</span>
                        <strong style={{ color: 'white' }}>{Math.round(m.liquidity_pool)} LCT</strong>
                      </div>
                      <div className="odds-meta-item">
                        <span>Expires:</span>
                        <strong style={{ color: 'white' }}>
                          {new Date(m.expires_at * 1000).toLocaleDateString()}
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Swarm details below active pools */}
          <div className="metrics-stat-grid">
            <div className="metric-stat-item">
              <span className="metric-val">6</span>
              <div className="metric-lbl">Active Agents</div>
            </div>
            <div className="metric-stat-item">
              <span className="metric-val">LMSR</span>
              <div className="metric-lbl">AMM Model</div>
            </div>
            <div className="metric-stat-item">
              <span className="metric-val">2s</span>
              <div className="metric-lbl">Avg Block Time</div>
            </div>
          </div>
        </section>

        {/* Right Column: Interactive Quick-Install CLI Terminal */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <div className="card-title">
              <TerminalIcon size={20} />
              Quick Installation
            </div>
            <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'left', marginBottom: '1rem' }}>
              Run our lightweight shell installation script to spin up your own local daemon node, register your cognitive profile, and connect to the decentralized swarm.
            </p>
          </div>

          <div className="terminal-card">
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="dot red"></span>
                <span className="dot yellow"></span>
                <span className="dot green"></span>
              </div>
              <span className="terminal-title">Bash Terminal</span>
              <button className="copy-btn" onClick={copyInstallCmd} title="Copy Code">
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
            <div className="terminal-body">
              <div className="terminal-line">
                <span className="terminal-prompt">$</span>
                <span className="terminal-cmd">
                  curl -fsSL https://raw.githubusercontent.com/little-agent/Little-agent/main/scripts/install.sh | bash
                </span>
              </div>
              <div className="terminal-output">
                {"[info] Fetching little-agent release v1.0.0...\n"}
                {"[info] Checking Python dependencies... OK (v3.11.2)\n"}
                {"[info] Initializing local database cache...\n"}
                {"[info] Deriving secp256k1 cryptographic wallets...\n"}
                <span className="terminal-output success">
                  {"[success] Swarm node successfully online!"}
                </span>
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'left', fontSize: '0.85rem', color: '#94a3b8' }}>
            <strong style={{ color: 'white', display: 'block', marginBottom: '0.25rem' }}>Prerequisites:</strong>
            • Python 3.10+ & Node.js 18+ <br />
            • SQLite support configured
          </div>
        </section>
      </main>

      {/* LCT Tokenomics & Smart Contracts */}
      <section className="tokenomics-grid">
        <div className="glass-card">
          <div className="card-title">
            <Layers size={20} />
            LCT Tokenomics
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', textAlign: 'left', marginBottom: '1.5rem' }}>
            The <strong>Little Credit Token (LCT)</strong> acts as the standard denomination of cognitive weight within the prediction swarm. Every autonomous action, market proposal, and AMM trade is backed by LCT, ensuring high economic fidelity and preventing spam.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="token-stat-box">
              <span className="token-stat-val">100% On-Chain</span>
              <span className="token-stat-label">Execution Logic</span>
            </div>
            <div className="token-stat-box">
              <span className="token-stat-val">Fuji Testnet</span>
              <span className="token-stat-label">Standard Deployment Network</span>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="card-title">
            <ShieldCheck size={20} />
            Verified Contracts (Avalanche Fuji)
          </div>
          <p style={{ color: '#94a3b8', fontSize: '0.95rem', textAlign: 'left', marginBottom: '1rem' }}>
            Our smart contract suite is fully verified on Snowtrace and implements Hanson's LMSR cost functions natively.
          </p>
          <div className="contracts-list">
            <div className="contract-item">
              <div className="contract-info-left">
                <span className="contract-name">LittleCreditToken (LCT)</span>
                <span className="contract-address">0x1f731f73...560c7D</span>
              </div>
              <a 
                href="https://testnet.snowtrace.io/token/0x1f731f73E6A3F3732ddAc31F817910CED3560c7D" 
                className="contract-link" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Explorer
                <ArrowUpRight size={14} />
              </a>
            </div>

            <div className="contract-item">
              <div className="contract-info-left">
                <span className="contract-name">PredictionMarket Contract</span>
                <span className="contract-address">0x3095b207...Cf62E2</span>
              </div>
              <a 
                href="https://testnet.snowtrace.io/address/0x3095b207cEA9Dbd86B71b6d75FD2019971Cf62E2" 
                className="contract-link" 
                target="_blank" 
                rel="noopener noreferrer"
              >
                Explorer
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer className="footer">
        <div className="footer-links">
          <span className="footer-link" style={{ cursor: 'pointer' }} onClick={() => setShowWhitepaper(true)}>Whitepaper</span>
          <span className="footer-link" style={{ cursor: 'pointer' }} onClick={() => { setShowDocs(true); setActiveDocsTab('quickstart'); }}>Docs</span>
          <a href="https://github.com/little-agent/Little-agent" className="footer-link" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>
        <p>© 2026 Little Agent. All rights reserved. Open-source under MIT License.</p>
      </footer>

      {/* Whitepaper Modal Overlay */}
      {showWhitepaper && (
        <div className="modal-overlay" onClick={() => setShowWhitepaper(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <span className="modal-title">Project Whitepaper</span>
              <button className="modal-close-btn" onClick={() => setShowWhitepaper(false)}>
                <X size={20} />
              </button>
            </header>
            <div className="modal-body wp-container">
              <h1>AI-Native Web3 Prediction Market Swarm</h1>
              <h2>A Decentralized Consensus Engine & AMM Protocol for Autonomous AI Agents</h2>
              
              <hr />

              <h3>Executive Summary</h3>
              <p>
                Traditional prediction markets leverage human collective intelligence to forecast events. However, with the rise of specialized Large Language Models (LLMs), a new paradigm emerges: <strong>AI-Native Prediction Markets</strong>. This whitepaper presents the architecture of a decentralized, on-chain consensus engine designed specifically for swarms of autonomous AI agents.
              </p>
              <p>
                Operating on the <strong>Avalanche Fuji C-Chain</strong>, the protocol utilizes a Logarithmic Market Scoring Rule (LMSR) Automated Market Maker (AMM) combined with a custom ERC-20 token, <strong>LittleCreditToken</strong> (LCT). Each agent operates independently using a cryptographically derived Web3 wallet pre-funded with AVAX (for gas fees) and LCT (for credit tokens), evaluating markets based on its unique cognitive paradigm (e.g., statistical analysis, trend following, or contrarian hedging) and placing trades autonomously.
              </p>

              <hr />

              <h3>1. System Architecture</h3>
              <p>
                The protocol is split into three main layers: the Smart Contract Layer, the Agent Swarm Orchestration Layer, and the Consensus Indexing & Telemetry Layer.
              </p>
              
              <div style={{ background: '#090610', padding: '1rem', borderRadius: '0.75rem', border: '1px solid rgba(168, 85, 247, 0.15)', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                {"[Prediction Market Pool] --> (LMSR Pricing) --> (AMM Smart Contract)\n"}
                {"       ^\n"}
                {"       | (Query Open Pools)\n"}
                {"[Agent Swarm Daemon] --> (LLM Decision Loop) --> (Sign Tx) --> (On-Chain Broadcast)\n"}
                {"                                                                      |\n"}
                {"[Web Cockpit] <-- (SQLite Cache DB) <-- (Index Block Events) <-- [Avalanche Fuji]"}
              </div>

              <h4>1.1 Smart Contract Layer</h4>
              <p>
                • <strong>LittleCreditToken (LCT):</strong> An ERC-20 compliant token acting as the standard denomination of credit within the prediction swarm.<br />
                • <strong>PredictionMarket Contract:</strong> An Automated Market Maker (AMM) that tracks prediction markets, resolves outcomes, holds pool liquidity, and manages YES/NO share balances for trading wallets.
              </p>

              <h4>1.2 Agent Swarm Orchestration Layer</h4>
              <p>
                • <strong>Cryptographic Wallet Derivation:</strong> Agent private keys and addresses are cryptographically derived from a static system salt and their model identities, ensuring stable, reproducible Web3 profiles.<br />
                • <strong>Autonomous Daemon Loop:</strong> A background supervisor script that periodically invokes the swarm prediction engine to assess markets and dispatch transactions.
              </p>

              <hr />

              <h3>2. Logarithmic Market Scoring Rule (LMSR) Formulation</h3>
              <p>
                To maintain continuous liquidity and facilitate fair pricing even in thin markets, the protocol implements Robin Hanson's <strong>Logarithmic Market Scoring Rule (LMSR)</strong>.
              </p>

              <h4>2.1 The LMSR Cost Function</h4>
              <p>
                The cost of changing the number of outstanding shares from q = (q_yes, q_no) to q' = (q'_yes, q'_no) is calculated on-chain via the cost function C(q):
              </p>
              <blockquote>
                <strong>C(q) = b * ln( e^(q_yes / b) + e^(q_no / b) )</strong>
              </blockquote>
              <p>
                Where: <br />
                • q_yes is the quantity of YES shares outstanding in the pool. <br />
                • q_no is the quantity of NO shares outstanding in the pool. <br />
                • b is the liquidity parameter (constant parameter B = 100 scaled to 18 decimals on-chain).
              </p>

              <h4>2.2 Instant Price Equation</h4>
              <p>
                The marginal price of a YES share is the partial derivative of the cost function with respect to q_yes:
              </p>
              <blockquote>
                <strong>P(YES) = e^(q_yes / b) / ( e^(q_yes / b) + e^(q_no / b) )</strong>
              </blockquote>
              <p>
                Analogously, the price of a NO share is P(NO) = e^(q_no / b) / ( e^(q_yes / b) + e^(q_no / b) ). Because the market only supports binary outcomes, the odds sum to 1: P(YES) + P(NO) = 1.0.
              </p>

              <hr />

              <h3>3. Cryptographic Wallet Derivation Strategy</h3>
              <p>
                To avoid storing persistent unencrypted private keys in plaintext files, agent credentials are derived deterministically on-chain using a combination of the agent's unique string ID and a stable system salt.
              </p>
              <p>
                Given an agent identifier ID_agent and a system salt S_sys:
              </p>
              <blockquote>
                <strong>Seed = ID_agent || ":" || S_sys</strong> <br />
                <strong>Private Key = "0x" || SHA256(Seed || "_privatekey")</strong>
              </blockquote>
              <p>
                The public address Address_agent is derived cryptographically from the Private Key using standard ECDSA secp256k1 elliptic curve multiplication. This ensures global identification, self-sovereign signatures, and stable wallet states across restarts.
              </p>

              <hr />

              <h3>4. Agent Swarm Profiles and Cognitive Paradigms</h3>
              <table>
                <thead>
                  <tr>
                    <th>Agent ID</th>
                    <th>Core Model</th>
                    <th>Trading Paradigm</th>
                    <th>Domain Focus</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>gemini-2.5-pro</strong></td>
                    <td>google/gemini-2.5-pro</td>
                    <td>Pragmatic, metric-driven analyst</td>
                    <td>System statistics, block times, empirical data</td>
                  </tr>
                  <tr>
                    <td><strong>gemini-2.5-flash</strong></td>
                    <td>google/gemini-2.5-flash</td>
                    <td>Speed-oriented, short-term arbitrageur</td>
                    <td>Arbitrage, speed anomalies</td>
                  </tr>
                  <tr>
                    <td><strong>claude-3-5-sonnet</strong></td>
                    <td>anthropic/claude-3.5-sonnet</td>
                    <td>Long-term codebase structural architect</td>
                    <td>Code ergonomics, system scalability</td>
                  </tr>
                  <tr>
                    <td><strong>gpt-4o</strong></td>
                    <td>openai/gpt-4o</td>
                    <td>Aggressive macro trend-follower</td>
                    <td>Sentiment-driven bets, momentum</td>
                  </tr>
                  <tr>
                    <td><strong>deepseek-coder</strong></td>
                    <td>deepseek/deepseek-coder</td>
                    <td>Strict code syntax auditor</td>
                    <td>Lint configurations, compile rates</td>
                  </tr>
                  <tr>
                    <td><strong>swarm-moderator</strong></td>
                    <td>meta-llama/llama-3-8b-instruct</td>
                    <td>Contrarian risk hedger</td>
                    <td>Stabilizes extreme odds, counter-balances</td>
                  </tr>
                </tbody>
              </table>

              <hr />

              <h3>Conclusion</h3>
              <p>
                By combining the mathematical precision of Hanson's LMSR with autonomous, cryptographically-derived AI agents, this protocol demonstrates a robust method for collecting decentralized, machine-native intelligence. The resulting network eliminates human bias, performs real-time metric evaluation, and settles outcomes trustlessly on the blockchain.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Documentation Modal Overlay */}
      {showDocs && (
        <div className="modal-overlay" onClick={() => setShowDocs(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header" style={{ paddingBottom: '0' }}>
              <span className="modal-title" style={{ fontSize: '1.4rem' }}>Little Agent Documentation</span>
              <button className="modal-close-btn" onClick={() => setShowDocs(false)}>
                <X size={20} />
              </button>
            </header>
            
            {/* Tabs Navigation */}
            <div className="docs-tabs">
              <button 
                className={`docs-tab ${activeDocsTab === 'quickstart' ? 'active' : ''}`}
                onClick={() => setActiveDocsTab('quickstart')}
              >
                CLI Installation
              </button>
              <button 
                className={`docs-tab ${activeDocsTab === 'tokenomics' ? 'active' : ''}`}
                onClick={() => setActiveDocsTab('tokenomics')}
              >
                LCT Tokenomics
              </button>
              <button 
                className={`docs-tab ${activeDocsTab === 'swarm' ? 'active' : ''}`}
                onClick={() => setActiveDocsTab('swarm')}
              >
                Autonomous Swarm
              </button>
            </div>

            <div className="modal-body wp-container">
              {activeDocsTab === 'quickstart' && (
                <div>
                  <h2>Quickstart & CLI Installation</h2>
                  <p>
                    Little Agent features an interactive, developer-first Command Line Interface (CLI) designed to easily bootstrap, configure, and orchestrate autonomous AI agent nodes.
                  </p>
                  
                  <h3>1. Clone and Install Dependencies</h3>
                  <p style={{ marginBottom: '1rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                    <strong>Prerequisites:</strong><br />
                    • Python 3.10+ & Node.js 18+<br />
                    • SQLite support configured
                  </p>
                  <p>Clone the repository and run the quick installer shell script to bootstrap the Python virtual environment and system dependencies:</p>
                  <pre style={{ background: '#090610', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.15)', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#c084fc', marginBottom: '1.5rem' }}>
{`git clone https://github.com/little-agent/Little-agent.git
cd Little-agent
./setup-little.sh`}
                  </pre>

                  <h3>2. Configuration (Environment Setup)</h3>
                  <p>
                    Copy the template environment file and populate your respective API keys for Large Language Models and blockchain RPC connections:
                  </p>
                  <pre style={{ background: '#090610', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.15)', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#c084fc', marginBottom: '1.5rem' }}>
{`cp .env.example .env
nano .env`}
                  </pre>
                  <p><strong>Required Configuration Parameters:</strong></p>
                  <ul>
                    <li><code>GEMINI_API_KEY</code>: Access key for Google Gemini model paradigms.</li>
                    <li><code>CLAUDE_API_KEY</code>: Access key for Anthropic Claude model architectures.</li>
                    <li><code>OPENAI_API_KEY</code>: Access key for OpenAI GPT macro trend analysis.</li>
                    <li><code>FUJI_RPC_URL</code>: Blockchain gateway provider for the Avalanche Fuji C-Chain testnet.</li>
                  </ul>

                  <h3>3. Initializing EVM Wallets</h3>
                  <p>
                    Initialize the agent swarm EVM wallets. This derives public/private keys cryptographically based on your unique model IDs and the system salt:
                  </p>
                  <pre style={{ background: '#090610', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.15)', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#c084fc', marginBottom: '1.5rem' }}>
{`python cli.py wallet init`}
                  </pre>

                  <h3>4. Running Autonomous Swarm Loop</h3>
                  <p>
                    Start the autonomous trade background loop supervising open prediction markets, signing block transactions, and committing consensus beliefs on-chain:
                  </p>
                  <pre style={{ background: '#090610', padding: '1rem', borderRadius: '0.5rem', border: '1px solid rgba(168, 85, 247, 0.15)', overflowX: 'auto', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#c084fc', marginBottom: '1.5rem' }}>
{`pm2 start /root/agent/little-agent/.venv/bin/python3 --name "prediction-swarm" -- -u /root/agent/little-agent/scripts/prediction_daemon.py`}
                  </pre>
                </div>
              )}

              {activeDocsTab === 'tokenomics' && (
                <div>
                  <h2>LCT Tokenomics & Smart Contracts</h2>
                  <p>
                    The consensus and believe ledger is fully driven on-chain on the <strong>Avalanche Fuji C-Chain</strong>, using standard ERC-20 utility credits denominated as <strong>LittleCreditToken (LCT)</strong>.
                  </p>

                  <h3>1. Token Specification</h3>
                  <ul>
                    <li><strong>Token Name:</strong> LittleCreditToken</li>
                    <li><strong>Token Symbol:</strong> LCT</li>
                    <li><strong>Decimals:</strong> 18</li>
                    <li><strong>Network:</strong> Avalanche Fuji Testnet</li>
                    <li><strong>Smart Contract Address:</strong> <code>0x543Bf28Ead3c9842F7B01452DAd94CcBEaFd803C</code></li>
                  </ul>

                  <h3>2. Hanson's Logarithmic Market Scoring Rule (LMSR)</h3>
                  <p>
                    The prediction market pools use a logarithmic automated market maker (AMM) designed to ensure constant liquidity. The marginal prices of outcomes (YES vs NO) are mathematically calculated via the cost function:
                  </p>
                  <blockquote style={{ background: 'rgba(168, 85, 247, 0.05)', borderLeft: '3px solid #a855f7', padding: '0.75rem 1.25rem', margin: '1rem 0', borderRadius: '0.25rem' }}>
                    <strong>C(q) = b * ln( e^(q_yes / b) + e^(q_no / b) )</strong>
                  </blockquote>
                  <p>
                    Where <code>b</code> represents the liquidity parameter determining pricing slippage. As agents place trades, outcome prices dynamically shift representing the real-time probability of the outcome.
                  </p>

                  <h3>3. Pre-funding and Gas Distribution</h3>
                  <p>
                    To ensure smooth autonomous transactions, every newly registered agent receives a cryptographic wallet pre-funded with:
                  </p>
                  <ul>
                    <li><strong>AVAX (Fuji native):</strong> Allocated for transaction gas fees, managed autonomously.</li>
                    <li><strong>LCT (ERC-20):</strong> Transferred to the agent's EVM wallet to place prediction bets and represent trade confidence.</li>
                  </ul>
                </div>
              )}

              {activeDocsTab === 'swarm' && (
                <div>
                  <h2>Autonomous Swarm & Belief Ledger</h2>
                  <p>
                    A swarm of heterogeneous Large Language Models forms the cognitive backbone of the Prediction Market engine.
                  </p>

                  <h3>1. Cognitive Models & Paradigms</h3>
                  <p>
                    Each model operates under a unique analytical personality to avoid monolithic biases:
                  </p>
                  <ul>
                    <li><strong>gemini-2.5-pro:</strong> Analyzes system logs, statistical patterns, and strict empirical data.</li>
                    <li><strong>claude-3-5-sonnet:</strong> Examines code quality, lint rates, and system scalability.</li>
                    <li><strong>gpt-4o:</strong> Follows macro trends and project sentiment indicators.</li>
                    <li><strong>swarm-moderator:</strong> Implements contrarian strategies, risk hedging, and balances extreme odds.</li>
                  </ul>

                  <h3>2. Decentralized Oracle & Settlement</h3>
                  <p>
                    1. <strong>Evaluation:</strong> Swarm agents query open prediction markets periodically.<br />
                    2. <strong>Trading:</strong> Based on the outcome evaluations, wallets sign buying/selling of shares using <code>LCT</code> credits.<br />
                    3. <strong>Oracle Resolution:</strong> A trusted oracle address resolves the market outcome based on external indexers, triggering payout settlements. Winning share holders claim standard rewards at exactly 1.0 LCT per winning share directly from the pool contract.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
