import sqlite3
import hashlib
from pathlib import Path
from web3 import Web3
import os
import json
from dotenv import load_dotenv

load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

RPC_URL = "https://avalanche-fuji-c-chain.publicnode.com"
PRIVATE_KEY = os.getenv("FUJI_PRIVATE_KEY", "aee82fa4e0df351eb8275b0de7f00bddb8935c4d996c39bbe83069bdde48109a")
SENDER_ADDRESS = "0xDc9D44889eD7A98a9a2B976146B2395df25f334d"

def get_system_salt():
    db_path = Path("/root/.little/prediction_market.db")
    conn = sqlite3.connect(str(db_path))
    cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'system_salt'")
    row = cursor.fetchone()
    conn.close()
    return row[0]

def get_agent_address(agent_id: str, salt: str) -> str:
    hash_seed = f"{agent_id}:{salt}".encode('utf-8')
    pk_hash = hashlib.sha256(hash_seed + b"_privatekey").hexdigest()
    private_key = "0x" + pk_hash
    # Derive address cryptographically from private key
    account = Web3().eth.account.from_key(private_key)
    return account.address

def distribute_cct():
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("Error connecting to Fuji C-Chain.")
        return

    # Load token address and ABI from config
    config_path = Path("/root/agent/little-agent/little_cli/contracts/fuji_config.json")
    with open(config_path, "r") as f:
        config = json.load(f)
        
    token_address = config["token_address"]
    token_abi = config["token_abi"]
    
    token_contract = w3.eth.contract(address=token_address, abi=token_abi)
    salt = get_system_salt()
    agents = ["gemini-2.5-pro", "gemini-2.5-flash", "claude-3-5-sonnet", "gpt-4o", "deepseek-coder", "swarm-moderator"]
    
    # 50,000 tokens each (scaled by 10**18)
    transfer_amount = 50000 * 10**18
    
    print("Distributing CCT tokens to correct agent addresses on Fuji...")
    for agent in agents:
        agent_addr = get_agent_address(agent, salt)
        nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
        
        # Check current CCT balance
        bal_wei = token_contract.functions.balanceOf(agent_addr).call()
        bal_cct = float(bal_wei) / 1e18
        print(f"Agent {agent} ({agent_addr}) has {bal_cct} CCT")
        
        if bal_cct < 1000.0:
            print(f"Sending 50,000 CCT to {agent} ({agent_addr})...")
            tx = token_contract.functions.transfer(agent_addr, transfer_amount).build_transaction({
                'nonce': nonce,
                'gas': 100000,
                'gasPrice': w3.eth.gas_price,
                'chainId': 43113,
                'from': SENDER_ADDRESS
            })
            signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)
            tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
            print(f"✓ Sent. Tx hash: {tx_hash.hex()}")
        else:
            print("✓ Already funded.")

if __name__ == "__main__":
    distribute_cct()
