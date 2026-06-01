import os
import math
import sqlite3
import logging
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

_log = logging.getLogger(__name__)

# LMSR AMM liquidity parameter
B = 100.0

def get_db_path() -> Path:
    little_home = os.environ.get("LITTLE_HOME")
    if little_home:
        root = Path(little_home)
    else:
        root = Path.home() / ".little"
    root.mkdir(parents=True, exist_ok=True)
    return root / "prediction_market.db"

def connect() -> sqlite3.Connection:
    db_path = get_db_path()
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def init_db() -> None:
    conn = connect()
    try:
        with conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_markets (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                creator_agent_id TEXT,
                category TEXT DEFAULT 'general',
                status TEXT CHECK(status IN ('OPEN', 'RESOLVED', 'CANCELLED')) DEFAULT 'OPEN',
                outcome TEXT CHECK(outcome IN ('YES', 'NO', 'NULL')) DEFAULT 'NULL',
                yes_shares REAL DEFAULT 0.0,
                no_shares REAL DEFAULT 0.0,
                liquidity_pool REAL DEFAULT 0.0,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )""")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_trades (
                id TEXT PRIMARY KEY,
                market_id TEXT REFERENCES pm_markets(id) ON DELETE CASCADE,
                agent_id TEXT NOT NULL,
                trade_type TEXT CHECK(trade_type IN ('BUY_YES', 'BUY_NO', 'SELL_YES', 'SELL_NO')) NOT NULL,
                shares REAL NOT NULL,
                price REAL NOT NULL,
                rationale TEXT,
                timestamp INTEGER NOT NULL
            )""")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_agent_balances (
                agent_id TEXT PRIMARY KEY,
                credits REAL DEFAULT 1000.0,
                updated_at INTEGER NOT NULL
            )""")

            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_agent_shares (
                market_id TEXT REFERENCES pm_markets(id) ON DELETE CASCADE,
                agent_id TEXT NOT NULL,
                yes_shares REAL DEFAULT 0.0,
                no_shares REAL DEFAULT 0.0,
                PRIMARY KEY (market_id, agent_id)
            )""")
        _log.info("Prediction market database initialized successfully.")
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# LMSR AMM Math
# ---------------------------------------------------------------------------

def stable_log_sum_exp(x: float, y: float) -> float:
    m = max(x, y)
    try:
        return m + math.log(math.exp(x - m) + math.exp(y - m))
    except OverflowError:
        return m

def lmsr_cost(y: float, n: float, b: float = B) -> float:
    return b * stable_log_sum_exp(y / b, n / b)

def get_trade_cost(current_y: float, current_n: float, trade_type: str, shares: float, b: float = B) -> float:
    """Calculate the cost to execute a trade of `shares`."""
    cost_before = lmsr_cost(current_y, current_n, b)
    if trade_type == "BUY_YES":
        cost_after = lmsr_cost(current_y + shares, current_n, b)
    elif trade_type == "BUY_NO":
        cost_after = lmsr_cost(current_y, current_n + shares, b)
    else:
        raise ValueError(f"Unsupported AMM trade type: {trade_type}")
    return cost_after - cost_before

# ---------------------------------------------------------------------------
# DB Operations
# ---------------------------------------------------------------------------

def create_market(market_id: str, title: str, description: Optional[str], creator_agent_id: str, expires_at: int, category: str = "general") -> Dict[str, Any]:
    now = int(datetime.utcnow().timestamp())
    conn = connect()
    try:
        with conn:
            conn.execute(
                "INSERT INTO pm_markets (id, title, description, creator_agent_id, expires_at, created_at, category) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (market_id, title, description, creator_agent_id, expires_at, now, category)
            )
        return get_market(market_id)
    finally:
        conn.close()

def get_markets() -> List[Dict[str, Any]]:
    conn = connect()
    try:
        cursor = conn.execute("SELECT * FROM pm_markets ORDER BY created_at DESC")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def get_market(market_id: str) -> Dict[str, Any]:
    conn = connect()
    try:
        cursor = conn.execute("SELECT * FROM pm_markets WHERE id = ?", (market_id,))
        row = cursor.fetchone()
        if not row:
            raise ValueError(f"Market with id {market_id} not found")
        
        market = dict(row)
        # Calculate current probability of YES
        y, n = market["yes_shares"], market["no_shares"]
        prob_yes = math.exp(y / B) / (math.exp(y / B) + math.exp(n / B))
        market["probability_yes"] = prob_yes
        market["price_yes"] = prob_yes  # In LMSR, instant price equals probability
        market["price_no"] = 1.0 - prob_yes
        return market
    finally:
        conn.close()

def get_agent_balance(agent_id: str) -> float:
    conn = connect()
    try:
        cursor = conn.execute("SELECT credits FROM pm_agent_balances WHERE agent_id = ?", (agent_id,))
        row = cursor.fetchone()
        if not row:
            # Create a balance entry on the fly
            now = int(datetime.utcnow().timestamp())
            with conn:
                conn.execute(
                    "INSERT OR IGNORE INTO pm_agent_balances (agent_id, credits, updated_at) VALUES (?, 1000.0, ?)",
                    (agent_id, now)
                )
            return 1000.0
        return float(row["credits"])
    finally:
        conn.close()

def get_agent_shares(market_id: str, agent_id: str) -> Dict[str, float]:
    conn = connect()
    try:
        cursor = conn.execute(
            "SELECT yes_shares, no_shares FROM pm_agent_shares WHERE market_id = ? AND agent_id = ?",
            (market_id, agent_id)
        )
        row = cursor.fetchone()
        if not row:
            return {"YES": 0.0, "NO": 0.0}
        return {"YES": row["yes_shares"], "NO": row["no_shares"]}
    finally:
        conn.close()

def place_trade(market_id: str, agent_id: str, trade_type: str, shares: float, rationale: Optional[str] = None) -> Dict[str, Any]:
    """Execute a purchase of shares of YES or NO under the AMM model."""
    if trade_type not in ("BUY_YES", "BUY_NO"):
        raise ValueError("Only BUY_YES and BUY_NO are currently supported through the automated market maker.")
    
    if shares <= 0:
        raise ValueError("Shares amount must be positive.")

    conn = connect()
    try:
        with conn:
            # Lock the market row to prevent race conditions (Simulating SELECT FOR UPDATE in SQLite via immediate transaction)
            conn.execute("BEGIN IMMEDIATE")
            
            cursor = conn.execute("SELECT yes_shares, no_shares, status FROM pm_markets WHERE id = ?", (market_id,))
            market = cursor.fetchone()
            if not market:
                raise ValueError("Market not found")
            
            if market["status"] != "OPEN":
                raise ValueError("This prediction market has already been resolved or cancelled.")
            
            current_y = market["yes_shares"]
            current_n = market["no_shares"]
            
            # Compute AMM cost
            cost = get_trade_cost(current_y, current_n, trade_type, shares, B)
            
            # Check agent's balance
            agent_bal = get_agent_balance(agent_id)
            if agent_bal < cost:
                raise ValueError(f"Insufficient credits: Trade costs {cost:.2f} cr, but agent only has {agent_bal:.2f} cr.")
            
            now = int(datetime.utcnow().timestamp())
            trade_id = f"trade_{now}_{shares}_{trade_type.lower()}"
            
            # Deduct balance
            conn.execute(
                "UPDATE pm_agent_balances SET credits = credits - ?, updated_at = ? WHERE agent_id = ?",
                (cost, now, agent_id)
            )
            
            # Update market shares pool
            if trade_type == "BUY_YES":
                new_y = current_y + shares
                new_n = current_n
            else:
                new_y = current_y
                new_n = current_n + shares
                
            conn.execute(
                "UPDATE pm_markets SET yes_shares = ?, no_shares = ?, liquidity_pool = liquidity_pool + ? WHERE id = ?",
                (new_y, new_n, cost, market_id)
            )
            
            # Update agent shares holdings
            conn.execute("""
                INSERT INTO pm_agent_shares (market_id, agent_id, yes_shares, no_shares)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(market_id, agent_id) DO UPDATE SET
                    yes_shares = yes_shares + excluded.yes_shares,
                    no_shares = no_shares + excluded.no_shares
            """, (
                market_id, 
                agent_id, 
                shares if trade_type == "BUY_YES" else 0.0,
                shares if trade_type == "BUY_NO" else 0.0
            ))
            
            # Record trade transaction log
            conn.execute(
                "INSERT INTO pm_trades (id, market_id, agent_id, trade_type, shares, price, rationale, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (trade_id, market_id, agent_id, trade_type, shares, cost / shares, rationale, now)
            )
            
        market_res = get_market(market_id)
        market_res["cost"] = cost
        market_res["trade_id"] = trade_id
        return market_res
    finally:
        conn.close()

def resolve_market(market_id: str, outcome: str) -> Dict[str, Any]:
    """Resolve the market outcome as YES or NO and pay out 1.0 credit per winning share."""
    if outcome not in ("YES", "NO"):
        raise ValueError("Outcome must be resolved to either YES or NO.")
        
    conn = connect()
    try:
        with conn:
            conn.execute("BEGIN IMMEDIATE")
            
            cursor = conn.execute("SELECT status FROM pm_markets WHERE id = ?", (market_id,))
            market = cursor.fetchone()
            if not market:
                raise ValueError("Market not found")
                
            if market["status"] != "OPEN":
                raise ValueError("This market has already been resolved or closed.")
                
            now = int(datetime.utcnow().timestamp())
            
            # Find all share holders
            shares_cursor = conn.execute(
                "SELECT agent_id, yes_shares, no_shares FROM pm_agent_shares WHERE market_id = ?",
                (market_id,)
            )
            shareholders = shares_cursor.fetchall()
            
            # Distribute winning payouts
            for holder in shareholders:
                agent_id = holder["agent_id"]
                winning_shares = holder["yes_shares"] if outcome == "YES" else holder["no_shares"]
                
                if winning_shares > 0:
                    payout = winning_shares * 1.0  # Each winning share pays out exactly 1 credit
                    
                    # Ensure agent has a balance record
                    get_agent_balance(agent_id)
                    
                    # Credit agent's balance
                    conn.execute(
                        "UPDATE pm_agent_balances SET credits = credits + ?, updated_at = ? WHERE agent_id = ?",
                        (payout, now, agent_id)
                    )
            
            # Update market status
            conn.execute(
                "UPDATE pm_markets SET status = 'RESOLVED', outcome = ? WHERE id = ?",
                (outcome, market_id)
            )
            
        return get_market(market_id)
    finally:
        conn.close()

def get_trades(market_id: Optional[str] = None) -> List[Dict[str, Any]]:
    conn = connect()
    try:
        if market_id:
            cursor = conn.execute(
                "SELECT * FROM pm_trades WHERE market_id = ? ORDER BY timestamp DESC",
                (market_id,)
            )
        else:
            cursor = conn.execute("SELECT * FROM pm_trades ORDER BY timestamp DESC LIMIT 100")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def get_leaderboard() -> List[Dict[str, Any]]:
    conn = connect()
    try:
        cursor = conn.execute("SELECT agent_id, credits FROM pm_agent_balances ORDER BY credits DESC LIMIT 10")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()
