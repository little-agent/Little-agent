import os
import time
import math
import sqlite3
import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from web3 import Web3
from little_cli import prediction_market_db as pm_db

_log = logging.getLogger(__name__)

class Web3JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, bytes):
            return "0x" + obj.hex()
        try:
            return super().default(obj)
        except TypeError:
            if hasattr(obj, "hex"):
                return obj.hex()
            return str(obj)

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

FUJI_CONFIG_PATH = Path("/root/agent/little-agent/little_cli/contracts/fuji_config.json")

def load_fuji_config() -> Optional[Dict[str, Any]]:
    if FUJI_CONFIG_PATH.exists():
        try:
            config = json.loads(FUJI_CONFIG_PATH.read_text())
            # Load environment variables to fetch private key securely
            from dotenv import load_dotenv
            import os
            # Try project .env first, then ~/.little/.env
            load_dotenv("/root/agent/little-agent/.env")
            load_dotenv("/root/.little/.env")
            
            env_pk = os.getenv("FUJI_PRIVATE_KEY")
            if env_pk:
                config["private_key"] = env_pk
            return config
        except Exception as e:
            _log.error(f"Failed to load Fuji config: {e}")
            return None
    return None

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
                system_salt = "cockpit_prediction_market_stable_salt_fuji_v1"
                conn.execute("INSERT INTO pm_system_config (key, value) VALUES ('system_salt', ?)", (system_salt,))
                _log.info(f"System salt set to stable value: {system_salt}")

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
                VALUES (0, ?, '0x0000000000000000000000000000000000000000', ?, 0.0, 30000000.0, '0x0000000000000000000000000000000000000000')
                """, (genesis_hash, int(time.time())))
                _log.info("Genesis block minted.")

    except Exception as e:
        _log.error(f"Error initializing Web3 database: {e}")
    finally:
        conn.close()

def generate_wallet(agent_id: str) -> Dict[str, str]:
    """Generate or retrieve a highly realistic simulated private key and wallet address for an agent."""
    config = load_fuji_config()
    if config and agent_id == "HumanOperator":
        # Return Fuji credentials if configured
        return {"address": config["owner_address"], "private_key": config["private_key"]}

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
        pk_hash = hashlib.sha256(hash_seed + b"_privatekey").hexdigest()
        private_key = "0x" + pk_hash
        
        # Derive cryptographically valid public address from the private key
        from web3 import Web3
        w3_temp = Web3()
        account = w3_temp.eth.account.from_key(private_key)
        address = account.address

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
    config = load_fuji_config()
    wallets = []
    
    # Retrieve all wallets from local database
    conn = pm_db.connect()
    try:
        # Pre-seed standard agent wallets if they do not exist in the SQLite database
        for agent_id in ["gemini-2.5-pro", "gemini-2.5-flash", "claude-3-5-sonnet", "gpt-4o", "deepseek-coder", "swarm-moderator"]:
            cursor = conn.execute("SELECT address FROM pm_wallets WHERE agent_id = ?", (agent_id,))
            if not cursor.fetchone():
                # generate_wallet will create and insert the wallet into pm_wallets table
                generate_wallet(agent_id)
                
        cursor = conn.execute("SELECT * FROM pm_wallets")
        wallets = [dict(r) for r in cursor.fetchall()]
    finally:
        conn.close()

    if config:
        w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
        
        # Instantiate CCT Token Contract
        token_addr = config.get("token_address")
        token_abi = config.get("token_abi")
        token_contract = None
        if token_addr and token_abi:
            try:
                token_contract = w3.eth.contract(address=token_addr, abi=token_abi)
            except Exception as e:
                _log.error(f"Failed to load token contract: {e}")

        # Human Operator custom entry setup
        operator_wallet = {
            "agent_id": "HumanOperator",
            "address": config["owner_address"],
            "private_key": config["private_key"],
            "balance": 0.0,
            "nonce": 0
        }
        wallets = [w for w in wallets if w["agent_id"] != "HumanOperator"]
        wallets.insert(0, operator_wallet)

        # Update each wallet with real on-chain CCT token balance and nonce
        if w3.is_connected():
            for wallet in wallets:
                # 1. Fetch token balance (scaled by 1e18)
                if token_contract:
                    try:
                        checksum_addr = w3.to_checksum_address(wallet["address"])
                        bal_wei = token_contract.functions.balanceOf(checksum_addr).call()
                        wallet["balance"] = float(bal_wei) / 1e18
                    except Exception as e:
                        _log.error(f"Failed to fetch CCT balance for {wallet['address']}: {e}")
                
                # 2. Fetch transaction count (nonce)
                try:
                    checksum_addr = w3.to_checksum_address(wallet["address"])
                    wallet["nonce"] = w3.eth.get_transaction_count(checksum_addr)
                except Exception:
                    pass
                    
    return wallets

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
            """, (tx_hash, new_block_num, from_address, to_address, value, gas_used, input_data, status, json.dumps(event_logs, cls=Web3JSONEncoder)))

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

def sync_simulated_blockchain_events() -> None:
    """Fallback indexer pulling from SQLite transaction logs table."""
    conn = pm_db.connect()
    try:
        cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'last_indexed_block'")
        row = cursor.fetchone()
        last_indexed = int(row["value"]) if row else -1
        
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
                        
                        cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (creator_address,))
                        row_agent = cursor_agent.fetchone()
                        creator_agent_id = row_agent["agent_id"] if row_agent else "Unknown"
                        
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
                        
                        cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (trader_address,))
                        row_agent = cursor_agent.fetchone()
                        agent_id = row_agent["agent_id"] if row_agent else "Unknown"
                        
                        conn.execute("UPDATE pm_agent_balances SET credits = credits - ? WHERE agent_id = ?", (cost, agent_id))
                        conn.execute("UPDATE pm_wallets SET balance = balance - ? WHERE address = ?", (cost, trader_address))
                        
                        cursor_mkt = conn.execute("SELECT yes_shares, no_shares FROM pm_markets WHERE id = ?", (market_id,))
                        mkt = cursor_mkt.fetchone()
                        if mkt:
                            current_y = mkt["yes_shares"]
                            current_n = mkt["no_shares"]
                            new_y = current_y + shares if trade_type == "BUY_YES" else current_y
                            new_n = current_n + shares if trade_type == "BUY_NO" else current_n
                            conn.execute("""
                                UPDATE pm_markets 
                                SET yes_shares = ?, no_shares = ?, liquidity_pool = liquidity_pool + ? 
                                WHERE id = ?
                            """, (new_y, new_n, cost, market_id))
                            
                        conn.execute("""
                            INSERT INTO pm_agent_shares (market_id, agent_id, yes_shares, no_shares)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(market_id, agent_id) DO UPDATE SET
                                yes_shares = yes_shares + excluded.yes_shares,
                                no_shares = no_shares + excluded.no_shares
                        """, (market_id, agent_id, shares if trade_type == "BUY_YES" else 0.0, shares if trade_type == "BUY_NO" else 0.0))
                        
                        trade_id = f"trade_{tx['hash'][:10]}_{int(shares)}"
                        conn.execute("""
                            INSERT OR IGNORE INTO pm_trades (id, market_id, agent_id, trade_type, shares, price, rationale, timestamp)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """, (trade_id, market_id, agent_id, trade_type, shares, cost / shares, rationale, tx["timestamp"]))
                        
                    elif event_name == "MarketResolved":
                        market_id = args["marketId"]
                        outcome = args["outcome"]
                        conn.execute("UPDATE pm_markets SET status = 'RESOLVED', outcome = ? WHERE id = ?", (outcome, market_id))
                        
                        cursor_shares = conn.execute("SELECT agent_id, yes_shares, no_shares FROM pm_agent_shares WHERE market_id = ?", (market_id,))
                        for row_sh in cursor_shares.fetchall():
                            agent_id = row_sh["agent_id"]
                            winning_shares = row_sh["yes_shares"] if outcome == "YES" else row_sh["no_shares"]
                            if winning_shares > 0:
                                conn.execute("UPDATE pm_agent_balances SET credits = credits + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                conn.execute("UPDATE pm_wallets SET balance = balance + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                
            conn.execute("INSERT OR REPLACE INTO pm_system_config (key, value) VALUES ('last_indexed_block', ?)", (str(max_block),))
            _log.info(f"Local simulated block indexer synced up to block {max_block}")
    finally:
        conn.close()

def sync_blockchain_events() -> None:
    """
    Decentralized Block Indexer.
    Detects if Fuji deployment config exists, and reads real on-chain event logs
    from the Avalanche Fuji network contract directly, updating local tables.
    """
    config = load_fuji_config()
    if not config:
        # Fallback to simulated local block indexer
        return sync_simulated_blockchain_events()
        
    conn = pm_db.connect()
    try:
        w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
        if not w3.is_connected():
            _log.error("Fuji RPC not connected during indexing.")
            return
            
        contract = w3.eth.contract(address=config["contract_address"], abi=config["abi"])
        
        # Get last indexed block
        cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'last_indexed_block'")
        row = cursor.fetchone()
        
        # Default start block: Fuji deploy block was 55962597
        last_indexed = int(row["value"]) if row else 55962597
        if last_indexed < 55962597:
            last_indexed = 55962597
            
        current_block = w3.eth.block_number
        if last_indexed >= current_block:
            return
            
        _log.info(f"Fuji Indexer: Syncing blocks {last_indexed + 1} to {current_block}...")
        
        event_names = ["MarketCreated", "TradePlaced", "MarketResolved"]
        
        # Increment index in batches to prevent API limits
        from_block = last_indexed + 1
        to_block = min(current_block, from_block + 4999)
        
        while from_block <= current_block:
            for event_name in event_names:
                event_type = getattr(contract.events, event_name)
                logs = event_type().get_logs(from_block=from_block, to_block=to_block)
                
                with conn:
                    for log in logs:
                        args = log["args"]
                        tx_hash = log["transactionHash"].hex()
                        block_number = log["blockNumber"]
                        
                        try:
                            block = w3.eth.get_block(block_number)
                            timestamp = block["timestamp"]
                        except Exception:
                            timestamp = int(time.time())
                            
                        if event_name == "MarketCreated":
                            market_id = args["marketId"]
                            title = args["title"]
                            creator_address = args["creator"]
                            expires_at = int(args["expiresAt"])
                            
                            cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (creator_address,))
                            row_agent = cursor_agent.fetchone()
                            creator_agent_id = row_agent["agent_id"] if row_agent else "Operator"
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_markets (id, title, creator_agent_id, status, outcome, created_at, expires_at, yes_shares, no_shares, liquidity_pool)
                                VALUES (?, ?, ?, 'OPEN', 'NULL', ?, ?, 0.0, 0.0, 0.0)
                            """, (market_id, title, creator_agent_id, timestamp, expires_at))
                            
                            # Cache block details
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_blocks (number, hash, parent_hash, timestamp, gas_used, gas_limit, miner)
                                VALUES (?, ?, '0x0', ?, 0.0, 30000000.0, '0x0')
                            """, (block_number, log["blockHash"].hex(), timestamp))
                            
                            # Cache tx receipt
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_transactions (hash, block_number, from_address, to_address, value, gas_price, gas_used, input_data, status, event_logs)
                                VALUES (?, ?, ?, ?, 0.0, 25.0, 0.0, 'createMarket(...)', 1, ?)
                            """, (
                                tx_hash,
                                block_number,
                                creator_address,
                                config["contract_address"],
                                json.dumps([{"event": "MarketCreated", "args": {"marketId": market_id, "title": title, "creator": creator_address, "expiresAt": expires_at}}], cls=Web3JSONEncoder)
                            ))
                            
                        elif event_name == "TradePlaced":
                            market_id = args["marketId"]
                            trader_address = args["trader"]
                            trade_type_val = args["tradeType"] # 0 for BUY_YES, 1 for BUY_NO
                            trade_type = "BUY_YES" if trade_type_val == 0 else "BUY_NO"
                            shares = float(args["shares"]) / 1e18 # contract shares scaled
                            cost = float(args["cost"]) / 1e18 # contract cost scaled
                            rationale = args.get("rationale", "")
                            
                            cursor_agent = conn.execute("SELECT agent_id FROM pm_wallets WHERE address = ?", (trader_address,))
                            row_agent = cursor_agent.fetchone()
                            agent_id = row_agent["agent_id"] if row_agent else "Operator"
                            
                            conn.execute("UPDATE pm_agent_balances SET credits = credits - ? WHERE agent_id = ?", (cost, agent_id))
                            conn.execute("UPDATE pm_wallets SET balance = balance - ? WHERE address = ?", (cost, trader_address))
                            
                            cursor_mkt = conn.execute("SELECT yes_shares, no_shares FROM pm_markets WHERE id = ?", (market_id,))
                            mkt = cursor_mkt.fetchone()
                            if mkt:
                                current_y = mkt["yes_shares"]
                                current_n = mkt["no_shares"]
                                new_y = current_y + shares if trade_type == "BUY_YES" else current_y
                                new_n = current_n + shares if trade_type == "BUY_NO" else current_n
                                conn.execute("""
                                    UPDATE pm_markets 
                                    SET yes_shares = ?, no_shares = ?, liquidity_pool = liquidity_pool + ? 
                                    WHERE id = ?
                                """, (new_y, new_n, cost, market_id))
                                
                            conn.execute("""
                                INSERT INTO pm_agent_shares (market_id, agent_id, yes_shares, no_shares)
                                VALUES (?, ?, ?, ?)
                                ON CONFLICT(market_id, agent_id) DO UPDATE SET
                                    yes_shares = yes_shares + excluded.yes_shares,
                                    no_shares = no_shares + excluded.no_shares
                            """, (market_id, agent_id, shares if trade_type == "BUY_YES" else 0.0, shares if trade_type == "BUY_NO" else 0.0))
                            
                            trade_id = f"trade_{tx_hash[:10]}_{int(shares)}"
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_trades (id, market_id, agent_id, trade_type, shares, price, rationale, timestamp)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (trade_id, market_id, agent_id, trade_type, shares, (cost / shares) if shares > 0 else 0.0, rationale, timestamp))
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_blocks (number, hash, parent_hash, timestamp, gas_used, gas_limit, miner)
                                VALUES (?, ?, '0x0', ?, 0.0, 30000000.0, '0x0')
                            """, (block_number, log["blockHash"].hex(), timestamp))
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_transactions (hash, block_number, from_address, to_address, value, gas_price, gas_used, input_data, status, event_logs)
                                VALUES (?, ?, ?, ?, ?, 25.0, 0.0, 'placeTrade(...)', 1, ?)
                            """, (
                                tx_hash,
                                block_number,
                                trader_address,
                                config["contract_address"],
                                cost,
                                json.dumps([{"event": "TradePlaced", "args": {"marketId": market_id, "trader": trader_address, "tradeType": trade_type, "shares": shares, "cost": cost, "rationale": rationale}}], cls=Web3JSONEncoder)
                            ))
                            
                        elif event_name == "MarketResolved":
                            market_id = args["marketId"]
                            outcome_val = args["outcome"]
                            outcome = "YES" if outcome_val == 1 else "NO"
                            
                            conn.execute("UPDATE pm_markets SET status = 'RESOLVED', outcome = ? WHERE id = ?", (outcome, market_id))
                            
                            cursor_shares = conn.execute("SELECT agent_id, yes_shares, no_shares FROM pm_agent_shares WHERE market_id = ?", (market_id,))
                            for row_sh in cursor_shares.fetchall():
                                agent_id = row_sh["agent_id"]
                                winning_shares = row_sh["yes_shares"] if outcome == "YES" else row_sh["no_shares"]
                                if winning_shares > 0:
                                    conn.execute("UPDATE pm_agent_balances SET credits = credits + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                    conn.execute("UPDATE pm_wallets SET balance = balance + ? WHERE agent_id = ?", (winning_shares, agent_id))
                                    
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_blocks (number, hash, parent_hash, timestamp, gas_used, gas_limit, miner)
                                VALUES (?, ?, '0x0', ?, 0.0, 30000000.0, '0x0')
                            """, (block_number, log["blockHash"].hex(), timestamp))
                            
                            conn.execute("""
                                INSERT OR IGNORE INTO pm_transactions (hash, block_number, from_address, to_address, value, gas_price, gas_used, input_data, status, event_logs)
                                VALUES (?, ?, ?, ?, 0.0, 25.0, 0.0, 'resolveMarket(...)', 1, ?)
                            """, (
                                tx_hash,
                                block_number,
                                config["owner_address"],
                                config["contract_address"],
                                json.dumps([{"event": "MarketResolved", "args": {"marketId": market_id, "outcome": outcome}}], cls=Web3JSONEncoder)
                            ))
                            
            conn.execute("INSERT OR REPLACE INTO pm_system_config (key, value) VALUES ('last_indexed_block', ?)", (str(to_block),))
            _log.info(f"Fuji Indexer: Synced up to block {to_block}")
            
            from_block = to_block + 1
            to_block = min(current_block, from_block + 4999)
            
    except Exception as e:
        _log.error(f"Fuji event indexing failed: {e}")
    finally:
        conn.close()

# ---------------------------------------------------------------------------
# Fuji Testnet Transaction Dispatcher Helper
# ---------------------------------------------------------------------------

def fuji_send_transaction(func_call, private_key=None, value_wei: int = 0) -> str:
    config = load_fuji_config()
    if not config:
        raise ValueError("Fuji config not loaded.")
    w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
    
    # Use specified private key or default to owner
    pk = private_key or config["private_key"]
    account = w3.eth.account.from_key(pk)
    from_address = account.address
    
    nonce = w3.eth.get_transaction_count(from_address)
    
    # Dynamic gas estimation
    try:
        gas_estimate = func_call.estimate_gas({
            'from': from_address,
            'value': value_wei
        })
        gas = int(gas_estimate * 1.2)  # 20% buffer
    except Exception:
        gas = 800000
        
    tx = func_call.build_transaction({
        'chainId': 43113,
        'gas': gas,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'value': value_wei,
        'from': from_address
    })
    
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=pk)
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    return tx_hash.hex()

# ---------------------------------------------------------------------------
# High-level Web3 transactional functions mapping to DB prediction operations
# ---------------------------------------------------------------------------

def web3_create_market(agent_id: str, market_id: str, title: str, description: Optional[str], expires_at: int, category: str = "general") -> Dict[str, Any]:
    """Wraps market creation in an on-chain smart contract transaction call."""
    config = load_fuji_config()
    if not config:
        # Run simulated indexer logic (Fallback)
        wallet = generate_wallet(agent_id)
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
        tx_hash = mine_block(wallet["address"], CONTRACT_ADDRESS, 0.0, gas, input_data, 1, events)
        sync_blockchain_events()
        res = pm_db.get_market(market_id)
        res["tx_hash"] = tx_hash
        res["block_address"] = CONTRACT_ADDRESS
        return res
        
    w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
    contract = w3.eth.contract(address=config["contract_address"], abi=config["abi"])
    
    func = contract.functions.createMarket(
        market_id,
        title,
        description or "",
        category or "general",
        expires_at
    )
    
    tx_hash = fuji_send_transaction(func)
    sync_blockchain_events()
    
    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = config["contract_address"]
    return res

def notify_trade_via_telegram(agent_id: str, title: str, trade_type: str, shares: float, cost: float, rationale: Optional[str], tx_hash: str) -> None:
    from dotenv import load_dotenv
    import os
    import threading
    import asyncio
    from tools.send_message_tool import _send_telegram

    agent_display = agent_id if agent_id != "HumanOperator" else "Operator"
    trade_text = "YES" if trade_type == "BUY_YES" else "NO"
    
    message = f"""🔔 <b>Prediction Market Trade Placed!</b> 📈

<b>Agent:</b> <code>{agent_display}</code>
<b>Market:</b> {title}
<b>Trade:</b> BUY {shares:.2f} {trade_text} shares
<b>Cost:</b> {cost:.2f} CREDIT
<b>Rationale:</b> <i>{rationale or "None"}</i>
<b>Tx Hash:</b> <code>{tx_hash}</code>"""

    def run_telegram_async():
        load_dotenv('/root/.little/.env')
        token = os.getenv("TELEGRAM_BOT_TOKEN")
        chat_id = os.getenv("TELEGRAM_OWNER_ID")
        if not token or not chat_id:
            return
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_send_telegram(token, chat_id, message))
        except Exception as e:
            _log.error(f"Failed to send Telegram notification: {e}")
        finally:
            loop.close()

    threading.Thread(target=run_telegram_async, daemon=True).start()

def web3_place_trade(agent_id: str, market_id: str, trade_type: str, shares: float, rationale: Optional[str] = None) -> Dict[str, Any]:
    """Wraps place trade in an on-chain smart contract transaction call with gas fees."""
    config = load_fuji_config()
    if not config:
        # Run simulated indexer logic (Fallback)
        wallet = generate_wallet(agent_id)
        conn = pm_db.connect()
        try:
            cursor = conn.execute("SELECT yes_shares, no_shares FROM pm_markets WHERE id = ?", (market_id,))
            m = cursor.fetchone()
            if not m: raise ValueError("Market not found")
            current_y, current_n = m["yes_shares"], m["no_shares"]
        finally:
            conn.close()

        trade_cost = pm_db.get_trade_cost(current_y, current_n, trade_type, shares, pm_db.B)
        agent_bal = pm_db.get_agent_balance(agent_id)
        if agent_bal < trade_cost:
            raise ValueError(f"Insufficient credits: Trade costs {trade_cost:.2f} cr, but agent only has {agent_bal:.2f} cr.")

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
        tx_hash = mine_block(wallet["address"], CONTRACT_ADDRESS, trade_cost, gas, input_data, 1, events)
        sync_blockchain_events()
        res = pm_db.get_market(market_id)
        res["tx_hash"] = tx_hash
        res["block_address"] = CONTRACT_ADDRESS
        res["cost"] = trade_cost
        notify_trade_via_telegram(agent_id, res["title"], trade_type, shares, trade_cost, rationale, tx_hash)
        return res
        
    w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
    contract = w3.eth.contract(address=config["contract_address"], abi=config["abi"])
    
    # 1. Resolve trader's private key and address
    if agent_id == "HumanOperator":
        trader_pk = config["private_key"]
        trader_address = config["owner_address"]
    else:
        trader_wallet = generate_wallet(agent_id)
        trader_pk = trader_wallet["private_key"]
        trader_address = trader_wallet["address"]
        
    trade_type_int = 0 if trade_type == "BUY_YES" else 1
    # Scale to 18 decimals on Ethereum standard smart contracts
    shares_wei = int(shares * 1e18)
    
    # 2. Calculate the exact trade cost in CCT tokens from the contract's LMSR pricing
    try:
        m_info = contract.functions.markets(market_id).call()
        yes_shares = m_info[7]
        no_shares = m_info[8]
        
        current_lmsr = contract.functions.calculateLmsrCost(yes_shares, no_shares).call()
        new_yes = yes_shares + shares_wei if trade_type == "BUY_YES" else yes_shares
        new_no = no_shares + shares_wei if trade_type == "BUY_NO" else no_shares
        after_lmsr = contract.functions.calculateLmsrCost(new_yes, new_no).call()
        cost_wei = after_lmsr - current_lmsr
    except Exception as e:
        _log.error(f"Failed to calculate on-chain trade cost: {e}")
        cost_wei = int(shares_wei) # Fallback
        
    # 3. Handle ERC-20 token approval if spender allowance is insufficient
    token_addr = config.get("token_address")
    token_abi = config.get("token_abi")
    if token_addr and token_abi:
        try:
            token_contract = w3.eth.contract(address=w3.to_checksum_address(token_addr), abi=token_abi)
            c_trader = w3.to_checksum_address(trader_address)
            c_market = w3.to_checksum_address(config["contract_address"])
            allowance = token_contract.functions.allowance(c_trader, c_market).call()
            if allowance < cost_wei:
                _log.info(f"Insufficient allowance ({allowance}) for cost ({cost_wei}). Executing CCT approval...")
                approve_func = token_contract.functions.approve(c_market, 10**32)
                approve_tx = fuji_send_transaction(approve_func, private_key=trader_pk)
                _log.info(f"CCT token approved successfully. Tx: {approve_tx}")
        except Exception as e:
            _log.error(f"ERC-20 token approval check failed: {e}")

    # 4. Dispatch placeTrade transaction signed by the trader
    func = contract.functions.placeTrade(
        market_id,
        trade_type_int,
        shares_wei,
        rationale or ""
    )
    
    tx_hash = fuji_send_transaction(func, private_key=trader_pk)
    sync_blockchain_events()
    
    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = config["contract_address"]

    # Retrieve trade cost from SQLite database updated by sync_blockchain_events()
    conn = pm_db.connect()
    trade_cost = 0.0
    try:
        cursor = conn.execute("SELECT shares, price FROM pm_trades WHERE id LIKE ?", (f"trade_{tx_hash[:10]}%",))
        row = cursor.fetchone()
        if row:
            trade_cost = row["shares"] * row["price"]
    finally:
        conn.close()
    
    res["cost"] = trade_cost
    notify_trade_via_telegram(agent_id, res["title"], trade_type, shares, trade_cost, rationale, tx_hash)
    return res

def web3_resolve_market(market_id: str, outcome: str) -> Dict[str, Any]:
    """Wraps resolve market in an on-chain smart contract transaction call."""
    config = load_fuji_config()
    if not config:
        # Run simulated indexer logic (Fallback)
        wallet = generate_wallet("swarm-moderator")
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
        tx_hash = mine_block(wallet["address"], CONTRACT_ADDRESS, 0.0, gas, input_data, 1, events)
        sync_blockchain_events()
        res = pm_db.get_market(market_id)
        res["tx_hash"] = tx_hash
        res["block_address"] = CONTRACT_ADDRESS
        return res
        
    w3 = Web3(Web3.HTTPProvider(config["rpc_url"]))
    contract = w3.eth.contract(address=config["contract_address"], abi=config["abi"])
    
    outcome_int = 1 if outcome == "YES" else 2
    func = contract.functions.resolveMarket(
        market_id,
        outcome_int
    )
    
    tx_hash = fuji_send_transaction(func)
    sync_blockchain_events()
    
    res = pm_db.get_market(market_id)
    res["tx_hash"] = tx_hash
    res["block_address"] = config["contract_address"]
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
