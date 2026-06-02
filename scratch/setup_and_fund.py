import os
import sys
import sqlite3
import hashlib
from pathlib import Path
from web3 import Web3
import json
from dotenv import load_dotenv

sys.path.insert(0, "/root/agent/little-agent")

from little_cli import prediction_market_db as pm_db
from little_cli import web3_sim

load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

RPC_URL = "https://avalanche-fuji-c-chain.publicnode.com"
PRIVATE_KEY = os.getenv("FUJI_PRIVATE_KEY", "aee82fa4e0df351eb8275b0de7f00bddb8935c4d996c39bbe83069bdde48109a")
SENDER_ADDRESS = "0xDc9D44889eD7A98a9a2B976146B2395df25f334d"

STABLE_SALT = "cockpit_prediction_market_stable_salt_fuji_v1"

def get_agent_address(agent_id: str) -> str:
    hash_seed = f"{agent_id}:{STABLE_SALT}".encode('utf-8')
    pk_hash = hashlib.sha256(hash_seed + b"_privatekey").hexdigest()
    private_key = "0x" + pk_hash
    account = Web3().eth.account.from_key(private_key)
    return account.address

def run_setup_and_fund():
    db_path = "/root/.little/prediction_market.db"
    if os.path.exists(db_path):
        os.remove(db_path)
        print("Cleared previous SQLite cache database.")

    # Initialize DB with stable salt
    pm_db.init_db()
    web3_sim.init_web3_db()
    print("Database cache initialized with stable salt.")

    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("Error connecting to Fuji RPC.")
        return

    # Load CCT token info
    config_path = Path("/root/agent/little-agent/little_cli/contracts/fuji_config.json")
    with open(config_path, "r") as f:
        config = json.load(f)
    token_address = config["token_address"]
    token_abi = config["token_abi"]
    token_contract = w3.eth.contract(address=token_address, abi=token_abi)

    agents = ["gemini-2.5-pro", "gemini-2.5-flash", "claude-3-5-sonnet", "gpt-4o", "deepseek-coder", "swarm-moderator"]
    
    # 1. Fund AVAX gas
    print("\n--- Funding AVAX Gas (0.05 AVAX each) ---")
    gas_amount = w3.to_wei(0.05, 'ether')
    for agent in agents:
        agent_addr = get_agent_address(agent)
        bal_wei = w3.eth.get_balance(agent_addr)
        bal_avax = w3.from_wei(bal_wei, 'ether')
        print(f"Agent {agent} ({agent_addr}) has {bal_avax} AVAX")
        if bal_avax < 0.04:
            nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
            tx = {
                'nonce': nonce,
                'to': agent_addr,
                'value': gas_amount,
                'gas': 21000,
                'gasPrice': w3.eth.gas_price,
                'chainId': 43113
            }
            signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            print(f"✓ Transferred gas. Tx: {tx_hash.hex()}")
        else:
            print("✓ Gas already funded.")

    # 2. Fund CCT Credit Tokens
    print("\n--- Funding CCT Tokens (50,000 CCT each) ---")
    cct_amount = 50000 * 10**18
    for agent in agents:
        agent_addr = get_agent_address(agent)
        bal_wei = token_contract.functions.balanceOf(agent_addr).call()
        bal_cct = float(bal_wei) / 1e18
        print(f"Agent {agent} ({agent_addr}) has {bal_cct} CCT")
        if bal_cct < 1000.0:
            nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
            tx = token_contract.functions.transfer(agent_addr, cct_amount).build_transaction({
                'nonce': nonce,
                'gas': 100000,
                'gasPrice': w3.eth.gas_price,
                'chainId': 43113,
                'from': SENDER_ADDRESS
            })
            signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            print(f"✓ Transferred tokens. Tx: {tx_hash.hex()}")
        else:
            print("✓ Tokens already funded.")

    print("\nSetup and funding completed successfully!")

if __name__ == "__main__":
    run_setup_and_fund()
