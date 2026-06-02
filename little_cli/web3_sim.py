import os
import time
import math
import sqlite3
import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from little_cli import prediction_market_db as pm_db

_log = logging.getLogger(__name__)

# Simulated Smart Contract Details
CONTRACT_ADDRESS = "0x89205A3A3b2A6ADF7F39423cc81a5aCDdB146Cc2"
CONTRACT_ABI = [
    {
        "inputs": [],
        "stateMutability": "nonpayable",
        "type": "constructor"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "marketId", "type": "string"},
            {"indexed": False, "name": "title", "type": "string"},
            {"indexed": True, "name": "creator", "type": "address"},
            {"indexed": False, "name": "expiresAt", "type": "uint256"}
        ],
        "name": "MarketCreated",
        "type": "event"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "marketId", "type": "string"},
            {"indexed": True, "name": "trader", "type": "address"},
            {"indexed": True, "name": "tradeType", "type": "uint8"},
            {"indexed": False, "name": "shares", "type": "uint256"},
            {"indexed": False, "name": "cost", "type": "uint256"},
            {"indexed": False, "name": "rationale", "type": "string"}
        ],
        "name": "TradePlaced",
        "type": "event"
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "name": "marketId", "type": "string"},
            {"indexed": False, "name": "outcome", "type": "uint8"},
            {"indexed": False, "name": "totalPayout", "type": "uint256"}
        ],
        "name": "MarketResolved",
        "type": "event"
    },
    {
        "inputs": [
            {"name": "_marketId", "type": "string"},
            {"name": "_title", "type": "string"},
            {"name": "_description", "type": "string"},
            {"name": "_category", "type": "string"},
            {"name": "_expiresAt", "type": "uint256"}
        ],
        "name": "createMarket",
        "outputs": [{"name": "", "type": "string"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"name": "_marketId", "type": "string"},
            {"name": "_tradeType", "type": "uint8"},
            {"name": "_shares", "type": "uint256"},
            {"name": "_rationale", "type": "string"}
        ],
        "name": "placeTrade",
        "outputs": [{"name": "cost", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

def init_web3_db() -> None:
    """Initialize SQLite tables for simulated Web3 blockchain layers."""
    conn = pm_db.connect()
    try:
        with conn:
            # 1. System Config Table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )""")

            # Ensure a unique system_salt exists for globally secure wallet generation
            cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'system_salt'")
            row = cursor.fetchone()
            if not row:
                system_salt = os.urandom(16).hex()
                conn.execute("INSERT INTO pm_system_config (key, value) VALUES ('system_salt', ?)", (system_salt,))
                _log.info(f"System salt generated for secure wallet hashing: {system_salt}")

            # Ensure last_indexed_block exists
            cursor_idx = conn.execute("SELECT value FROM pm_system_config WHERE key = 'last_indexed_block'")
            row_idx = cursor_idx.fetchone()
            if not row_idx:
                conn.execute("INSERT INTO pm_system_config (key, value) VALUES ('last_indexed_block', '-1')")

            # 2. Blocks Table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_blocks (
                number INTEGER PRIMARY KEY,
                hash TEXT UNIQUE NOT NULL,
                parent_hash TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                gas_used REAL NOT NULL,
                gas_limit REAL NOT NULL,
                miner TEXT NOT NULL
            )""")

            # 3. Transactions Table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_transactions (
                hash TEXT PRIMARY KEY,
                block_number INTEGER REFERENCES pm_blocks(number) ON DELETE CASCADE,
                from_address TEXT NOT NULL,
                to_address TEXT NOT NULL,
                value REAL DEFAULT 0.0,
                gas_price REAL NOT NULL,
                gas_used REAL NOT NULL,
                input_data TEXT NOT NULL,
                status INTEGER CHECK(status IN (0, 1)) DEFAULT 1,
                event_logs TEXT
            )""")

            # 4. Wallets Table
            conn.execute("""
            CREATE TABLE IF NOT EXISTS pm_wallets (
                agent_id TEXT PRIMARY KEY,
                address TEXT UNIQUE NOT NULL,
                private_key TEXT UNIQUE NOT NULL,
                balance REAL DEFAULT 1000.0,
                nonce INTEGER DEFAULT 0
            )""")

            # Ensure Genesis Block exists
            cursor = conn.execute("SELECT count(*) as count FROM pm_blocks WHERE number = 0")
            if cursor.fetchone()["count"] == 0:
                genesis_hash = "0x" + hashlib.sha256(b"genesis_block_cockpit_v1").hexdigest()
                conn.execute("""
                INSERT INTO pm_blocks (number, hash, parent_hash, timestamp, gas_used, gas_limit, miner)
                VALUES (0, ?, '0x0000000000000000000000000000000000000000000000000000000000000000', ?, 0.0, 30000000.0, '0x0000000000000000000000000000000000000000')
                """, (genesis_hash, int(time.time())))
                _log.info("Genesis block minted.")

    except Exception as e:
        _log.error(f"Error initializing Web3 database: {e}")
    finally:
        conn.close()

def generate_wallet(agent_id: str) -> Dict[str, str]:
    """Generate or retrieve a highly realistic simulated private key and wallet address for an agent."""
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT address, private_key FROM pm_wallets WHERE agent_id = ?", (agent_id,))
        row = cursor.fetchone()
        if row:
            return {"address": row["address"], "private_key": row["private_key"]}

        # Retrieve the system salt for secure, collision-proof hashing
        cursor_salt = conn.execute("SELECT value FROM pm_system_config WHERE key = 'system_salt'")
        row_salt = cursor_salt.fetchone()
        system_salt = row_salt["value"] if row_salt else "default_salt_fallback"

        # Create wallet deterministic from agent_id combined with system_salt hash
        hash_seed = f"{agent_id}:{system_salt}".encode('utf-8')
        addr_hash = hashlib.sha256(hash_seed + b"_address").hexdigest()[:40]
        pk_hash = hashlib.sha256(hash_seed + b"_privatekey").hexdigest()
        
        address = "0x" + addr_hash
        private_key = "0x" + pk_hash

        # Replicate cognitive credits from normal db into wallet balance
        credits = pm_db.get_agent_balance(agent_id)

        with conn:
            conn.execute(
                "INSERT OR REPLACE INTO pm_wallets (agent_id, address, private_key, balance, nonce) VALUES (?, ?, ?, ?, 0)",
                (agent_id, address, private_key, credits)
            )

        return {"address": address, "private_key": private_key}
    finally:
        conn.close()

def get_wallet_by_address(address: str) -> Optional[Dict[str, Any]]:
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT * FROM pm_wallets WHERE address = ?", (address,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def get_wallets() -> List[Dict[str, Any]]:
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT * FROM pm_wallets")
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def mine_block(from_address: str, to_address: str, value: float, gas_used: float, input_data: str, status: int, event_logs: List[Dict[str, Any]]) -> str:
    """Mine a simulated on-chain block containing a single smart-contract calling transaction."""
    conn = pm_db.connect()
    try:
        with conn:
            # 1. Get latest block
            cursor = conn.execute("SELECT number, hash FROM pm_blocks ORDER BY number DESC LIMIT 1")
            latest = cursor.fetchone()
            new_block_num = latest["number"] + 1
            parent_hash = latest["hash"]

            # 2. Increment sender nonce and adjust balance
            wallet_sender = conn.execute("SELECT nonce, balance FROM pm_wallets WHERE address = ?", (from_address,)).fetchone()
            if wallet_sender:
                new_nonce = wallet_sender["nonce"] + 1
                new_balance = wallet_sender["balance"] - value
                conn.execute("UPDATE pm_wallets SET nonce = ?, balance = ? WHERE address = ?", (new_nonce, max(0.0, new_balance), from_address))

            # 3. Create unique transaction hash
            tx_data = f"{new_block_num}_{from_address}_{to_address}_{time.time()}".encode("utf-8")
            tx_hash = "0x" + hashlib.sha256(tx_data).hexdigest()

            # 4. Create unique block hash
            block_data = f"{new_block_num}_{parent_hash}_{tx_hash}".encode("utf-8")
            block_hash = "0x" + hashlib.sha256(block_data).hexdigest()

            # 5. Insert Block
            conn.execute("""
            INSERT INTO pm_blocks (number, hash, parent_hash, timestamp, gas_used, gas_limit, miner)
            VALUES (?, ?, ?, ?, ?, 30000000.0, '0x0000000000000000000000000000000000000000')
            """, (new_block_num, block_hash, parent_hash, int(time.time()), gas_used))

            # 6. Insert Transaction
            conn.execute("""
            INSERT INTO pm_transactions (hash, block_number, from_address, to_address, value, gas_price, gas_used, input_data, status, event_logs)
            VALUES (?, ?, ?, ?, ?, 25.0, ?, ?, ?, ?)
            """, (tx_hash, new_block_num, from_address, to_address, value, gas_used, input_data, status, json.dumps(event_logs)))

            _log.info(f"Block #{new_block_num} successfully mined. Tx Hash: {tx_hash}")
            return tx_hash
    except Exception as e:
        _log.error(f"Failed to mine block: {e}")
        raise e
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Simulated Web3 Block Indexer / Event Sync Loop
# ---------------------------------------------------------------------------

def sync_blockchain_events() -> None:
    """
    Simulated Web3 Block Indexer.
    Pulls unindexed on-chain transactions, parses their emitted event logs,
    and updates local SQLite read-cache tables to index the blockchain state.
    """
    conn = pm_db.connect()
    try:
        # Get last indexed block
        cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'last_indexed_block'")
        row = cursor.fetchone()
        last_indexed = int(row["value"]) if row else -1
        
        # Get all transactions from blocks higher than last_indexed
        cursor_txs = conn.execute("""
            SELECT t.*, b.timestamp FROM pm_transactions t
            JOIN pm_blocks b ON t.block_number = b.number
            WHERE b.number > ?
            ORDER BY b.number ASC
        """, (last_indexed,))
        
        txs = cursor_txs.fetchall()
        if not txs:
            return
            
        max_block = last_indexed
        
        with conn:
            for tx in txs:
                block_num = tx["block_number"]
                if block_num > max_block:
                    max_block = block_num
                    
                status = tx["status"]
                if status == 0:
                    # Transaction reverted on-chain
                    continue
                    
                event_logs_str = tx["event_logs"]
                if not event_logs_str:
                    continue
                    
                events = json.loads(event_logs_str)
                for ev in events:
                    event_name = ev.get("event")
                    args = ev.get("args", {})
                    
                    if event_name == "MarketCreated":
                        market_id = args["marketId"]
                        title = args["title"]
                        creator_address = args["creator"]
                        expires_at = args["expiresAt"]
                        
                        # Resolve creator_agent_id from address
                        cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (creator_address,))
                        row_agent = cursor_agent.fetchone()
                        creator_agent_id = row_agent["agent_id"] if row_agent else "Unknown"
                        
                        # Index creation to local table
                        conn.execute("""
                            INSERT OR IGNORE INTO pm_markets (id, title, creator_agent_id, status, outcome, created_at, expires_at, yes_shares, no_shares, liquidity_pool)
                            VALUES (?, ?, ?, 'OPEN', 'NULL', ?, ?, 0.0, 0.0, 0.0)
                        """, (market_id, title, creator_agent_id, tx["timestamp"], expires_at))
                        
                    elif event_name == "TradePlaced":
                        market_id = args["marketId"]
                        trader_address = args["trader"]
                        trade_type = args["tradeType"]
                        shares = float(args["shares"])
                        cost = float(args["cost"])
                        rationale = args.get("rationale")
                        
                        # Resolve agent_id from address
                        cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (trader_address,))
                        row_agent = cursor_agent.fetchone()
                        agent_id = row_agent["agent_id"] if row_agent else "Unknown"
                        
                        # 1. Update balances
                        conn.execute("UPDATE pm_agent_balances SET credits = credits - ? WHERE agent_id = ?", (cost, agent_id))
                        conn.execute("UPDATE pm_wallets SET balance = balance - ? WHERE address = ?", (cost, trader_address))
                        
                        # 2. Update market share pools
                        cursor_mkt = conn.execute("SELECT yes_shares, no_shares FROM pm_markets WHERE id = ?", (market_id,))
                        mkt = cursor_mkt.fetchone()
                        if mkt:
                            current_y = mkt["yes_shares"]
                            current_n = mkt["no_shares"]
                            if trade_type == "BUY_YES":
                                new_y = current_y + shares
                                new_n = current_n
                            else:
                                new_y = current_y
                                new_n = current_n + shares
                                
                            conn.execute("""
                                UPDATE pm_markets 
                                SET yes_shares = ?, no_shares = ?, liquidity_pool = liquidity_pool + ? 
                                WHERE id = ?
                            """, (new_y, new_n, cost, market_id))
                            
                        # 3. Update agent shares holdings
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
                        
                        # 4. Insert trade log
                        trade_id = f"trade_{tx['hash'][:10]}_{int(shares)}"
                        conn.execute("""
                            INSERT OR IGNORE INTO pm_trades (id, market_id, agent_id, trade_type, shares, price, rationale, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (trade_id, market_id, agent_id, trade_type, shares, cost / shares, rationale, tx["timestamp"]))
                        
                    elif event_name == "MarketResolved":
                        market_id = args["marketId"]
                        outcome = args["outcome"]
                        
                        # Update market status in local DB
                        conn.execute("UPDATE pm_markets SET status = 'RESOLVED', outcome = ? WHERE id = ?", (outcome, market_id))
                        
                        # Distribute credits to winners (1.0 credit per winning share)
                        cursor_shares = conn.execute("SELECT agent_id, yes_shares, no_shares FROM pm_agent_shares WHERE market_id = ?", (market_id,))
                        for row_sh in cursor_shares.fetchall():
                            agent_id = row_sh["agent_id"]
                            winning_shares = row_sh["yes_shares"] if outcome == "YES" else row_sh["no_shares"]
                            if winning_shares > 0:
                                conn.execute("UPDATE pm_agent_balances SET credits = credits + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                conn.execute("UPDATE pm_wallets SET balance = balance + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                
            # Update last indexed block configuration
            conn.execute("INSERT OR REPLACE INTO pm_system_config (key, value) VALUES ('last_indexed_block', ?)", (str(max_block),))
            
        _log.info(f"Block Indexer successfully synchronized up to Block #{max_block}.")
    except Exception as e:
        _log.error(f"Event indexing failed: {e}")
        raise e
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# High-level Web3 transactional functions mapping to DB prediction operations
# ---------------------------------------------------------------------------

def web3_create_market(agent_id: str, market_id: str, title: str, description: Optional[str], expires_at: int, category: str = "general") -> Dict[str, Any]:
    """Wraps market creation in an on-chain smart contract transaction call."""
    wallet = generate_wallet(agent_id)
    
    # Mine on-chain
    gas = 68000.0
    input_data = f"createMarket('{market_id}', '{title}', '{category}', {expires_at})"
    events = [{
        "event": "MarketCreated",
        "args": {
            "marketId": market_id,
            "title": title,
            "creator": wallet["address"],
            "expiresAt": expires_at
        }
    }]
    
    tx_hash = mine_block(
        from_address=wallet["address"],
        to_address=CONTRACT_ADDRESS,
        value=0.0,
        gas_used=gas,
        input_data=input_data,
        status=1,
        event_logs=events
    )

    # Trigger Indexer to sync block events to local DB
    sync_blockchain_events()

    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = CONTRACT_ADDRESS
    return res

def web3_place_trade(agent_id: str, market_id: str, trade_type: str, shares: float, rationale: Optional[str] = None) -> Dict[str, Any]:
    """Wraps place trade in an on-chain smart contract transaction call with gas fees."""
    wallet = generate_wallet(agent_id)
    
    # Fetch current market state from SQLite index tables
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT yes_shares, no_shares FROM pm_markets WHERE id = ?", (market_id,))
        m = cursor.fetchone()
        if not m:
            raise ValueError("Market not found")
        current_y = m["yes_shares"]
        current_n = m["no_shares"]
    finally:
        conn.close()

    # Calculate cost using standard AMM LMSR formula
    trade_cost = pm_db.get_trade_cost(current_y, current_n, trade_type, shares, pm_db.B)
    
    # Check agent balance
    agent_bal = pm_db.get_agent_balance(agent_id)
    if agent_bal < trade_cost:
        raise ValueError(f"Insufficient credits: Trade costs {trade_cost:.2f} cr, but agent only has {agent_bal:.2f} cr.")

    # Mine on-chain
    gas = 45000.0 + (shares * 10)
    trade_type_int = 0 if trade_type == "BUY_YES" else 1
    input_data = f"placeTrade('{market_id}', {trade_type_int}, {shares}, '{rationale or ''}')"
    events = [{
        "event": "TradePlaced",
        "args": {
            "marketId": market_id,
            "trader": wallet["address"],
            "tradeType": trade_type,
            "shares": shares,
            "cost": trade_cost,
            "rationale": rationale or ""
        }
    }]
    
    tx_hash = mine_block(
        from_address=wallet["address"],
        to_address=CONTRACT_ADDRESS,
        value=trade_cost,
        gas_used=gas,
        input_data=input_data,
        status=1,
        event_logs=events
    )

    # Trigger Indexer to sync block events to local DB
    sync_blockchain_events()

    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = CONTRACT_ADDRESS
    res["cost"] = trade_cost
    return res

def web3_resolve_market(market_id: str, outcome: str) -> Dict[str, Any]:
    """Wraps resolve market in an on-chain smart contract transaction call."""
    wallet = generate_wallet("swarm-moderator")

    # Mine on-chain
    gas = 35000.0
    outcome_int = 1 if outcome == "YES" else 2
    input_data = f"resolveMarket('{market_id}', {outcome_int})"
    events = [{
        "event": "MarketResolved",
        "args": {
            "marketId": market_id,
            "outcome": outcome
        }
    }]
    
    tx_hash = mine_block(
        from_address=wallet["address"],
        to_address=CONTRACT_ADDRESS,
        value=0.0,
        gas_used=gas,
        input_data=input_data,
        status=1,
        event_logs=events
    )

    # Trigger Indexer to sync block events to local DB
    sync_blockchain_events()

    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = CONTRACT_ADDRESS
    return res

# ---------------------------------------------------------------------------
# Blockchain Explorer Queries
# ---------------------------------------------------------------------------

def get_blocks(limit: int = 20) -> List[Dict[str, Any]]:
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT * FROM pm_blocks ORDER BY number DESC LIMIT ?", (limit,))
        return [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

def get_transactions(market_id: Optional[str] = None, limit: int = 30) -> List[Dict[str, Any]]:
    conn = pm_db.connect()
    try:
        if market_id:
            cursor = conn.execute("""
            SELECT t.*, b.timestamp FROM pm_transactions t 
            JOIN pm_blocks b ON t.block_number = b.number
            WHERE t.input_data LIKE ?
            ORDER BY b.number DESC LIMIT ?
            """, (f"%{market_id}%", limit))
        else:
            cursor = conn.execute("""
            SELECT t.*, b.timestamp FROM pm_transactions t 
            JOIN pm_blocks b ON t.block_number = b.number
            ORDER BY b.number DESC LIMIT ?
            """, (limit,))
        
        txs = []
        for r in cursor.fetchall():
            d = dict(r)
            if d["event_logs"]:
                d["event_logs"] = json.loads(d["event_logs"])
            txs.append(d)
        return txs
    finally:
        conn.close()

def get_transaction_details(tx_hash: str) -> Optional[Dict[str, Any]]:
    conn = pm_db.connect()
    try:
        cursor = conn.execute("""
        SELECT t.*, b.timestamp FROM pm_transactions t
        JOIN pm_blocks b ON t.block_number = b.number
        WHERE t.hash = ?
        """, (tx_hash,))
        row = cursor.fetchone()
        if not row:
            return None
        d = dict(row)
        if d["event_logs"]:
            d["event_logs"] = json.loads(d["event_logs"])
        return d
    finally:
        conn.close()
