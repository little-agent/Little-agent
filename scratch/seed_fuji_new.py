import os
import sys
import time
from datetime import datetime, timedelta

sys.path.insert(0, "/root/agent/little-agent")

from little_cli import prediction_market_db as pm_db
from little_cli import web3_sim

def seed_fuji_data():
    print("Initializing SQLite Read-Cache for Avalanche Fuji...")
    pm_db.init_db()
    web3_sim.init_web3_db()

    # Pre-populate wallets in SQLite
    print("Seeding standard agent wallets...")
    web3_sim.get_wallets()

    # Define some agents and give them credits in local DB
    agents = {
        "gemini-2.5-pro": 50000.0,
        "gemini-2.5-flash": 50000.0,
        "claude-3-5-sonnet": 50000.0,
        "gpt-4o": 50000.0,
        "deepseek-coder": 50000.0,
        "swarm-moderator": 50000.0,
        "HumanOperator": 9700000.0
    }

    print("Syncing local agent balances...")
    conn = pm_db.connect()
    try:
        with conn:
            for agent_id, credits in agents.items():
                conn.execute(
                    "INSERT OR REPLACE INTO pm_agent_balances (agent_id, credits, updated_at) VALUES (?, ?, ?)",
                    (agent_id, credits, int(time.time()))
                )
    finally:
        conn.close()

    # Define Fuji prediction markets to deploy
    markets_to_create = [
        {
            "market_id": "fuji_mkt_blocktime",
            "title": "Will Avalanche Fuji C-Chain average block time remain under 2 seconds today?",
            "description": "Tracks C-Chain performance and network congestion during active swarm transaction runs.",
            "creator_agent_id": "HumanOperator",
            "category": "network",
            "expires_in_days": 10
        },
        {
            "market_id": "fuji_mkt_telemetry",
            "title": "Will gemini-2.5-pro successfully compile with 0 lint errors on Fuji test suite?",
            "description": "Tracks correctness and linting results of the Web3 indexer telemetry script.",
            "creator_agent_id": "HumanOperator",
            "category": "development",
            "expires_in_days": 5
        }
    ]

    print("\nDeploying prediction markets to Avalanche Fuji C-Chain (sending transactions)...")
    for m in markets_to_create:
        expires_at = int((datetime.utcnow() + timedelta(days=m["expires_in_days"])).timestamp())
        try:
            res = web3_sim.web3_create_market(
                agent_id=m["creator_agent_id"],
                market_id=m["market_id"],
                title=m["title"],
                description=m["description"],
                expires_at=expires_at,
                category=m["category"]
            )
            print(f"[SUCCESS] Market deployed on Fuji! | Title: '{m['title']}' | Tx Hash: {res['tx_hash']}")
            time.sleep(1.0)
        except Exception as e:
            print(f"Failed to create market: {e}")

    # Seed trades
    trades_to_place = [
        {
            "market_id": "fuji_mkt_blocktime",
            "agent_id": "HumanOperator",
            "trade_type": "BUY_YES",
            "shares": 30.0,
            "rationale": "Historically, Avalanche C-Chain Fuji blocktimes are stable around 1.5 seconds under normal loads."
        },
        {
            "market_id": "fuji_mkt_blocktime",
            "agent_id": "gemini-2.5-pro",
            "trade_type": "BUY_NO",
            "shares": 10.0,
            "rationale": "A temporary network spike could push the average block time above 2 seconds."
        },
        {
            "market_id": "fuji_mkt_telemetry",
            "agent_id": "HumanOperator",
            "trade_type": "BUY_YES",
            "shares": 50.0,
            "rationale": "Indexer logic was checked locally and runs seamlessly. A yes outcome is highly likely."
        }
    ]

    print("\nPlacing trades on Avalanche Fuji C-Chain (sending transactions)...")
    for t in trades_to_place:
        try:
            res = web3_sim.web3_place_trade(
                agent_id=t["agent_id"],
                market_id=t["market_id"],
                trade_type=t["trade_type"],
                shares=t["shares"],
                rationale=t["rationale"]
            )
            print(f"[SUCCESS] Trade placed on Fuji by {t['agent_id']}! | Tx Hash: {res['tx_hash']} | Cost: {res['cost']:.2f} CCT")
            time.sleep(1.0)
        except Exception as e:
            print(f"Failed to place trade: {e}")

    print("\nAvalanche Fuji Database Seeding Completed successfully!")

if __name__ == "__main__":
    # Clear local db first to start with a fresh genesis/indexing state for Fuji
    db_path = "/root/.little/prediction_market.db"
    if os.path.exists(db_path):
        os.remove(db_path)
        print("Cleared previous SQLite cache database.")
        
    seed_fuji_data()
