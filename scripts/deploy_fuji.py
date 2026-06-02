import sys
import os
import json
import solcx
import hashlib
import sqlite3
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

# Load env variables
load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

# Ensure solcx compiler is ready
solcx.install_solc('0.8.20')

RPC_URL = "https://avalanche-fuji-c-chain.publicnode.com"
PRIVATE_KEY = os.getenv("FUJI_PRIVATE_KEY", "aee82fa4e0df351eb8275b0de7f00bddb8935c4d996c39bbe83069bdde48109a")
SENDER_ADDRESS = "0xDc9D44889eD7A98a9a2B976146B2395df25f334d"

def get_system_salt():
    db_path = Path("/root/.little/prediction_market.db")
    if not db_path.exists():
        # Fallback salt if DB not created yet
        return "default_salt_fallback"
    try:
        conn = sqlite3.connect(str(db_path))
        cursor = conn.execute("SELECT value FROM pm_system_config WHERE key = 'system_salt'")
        row = cursor.fetchone()
        conn.close()
        if row:
            return row[0]
    except Exception:
        pass
    return "default_salt_fallback"

def get_agent_address(agent_id: str, salt: str) -> str:
    hash_seed = f"{agent_id}:{salt}".encode('utf-8')
    pk_hash = hashlib.sha256(hash_seed + b"_privatekey").hexdigest()
    private_key = "0x" + pk_hash
    # Derive address cryptographically from private key
    account = Web3().eth.account.from_key(private_key)
    return account.address

def deploy():
    print(f"Connecting to Avalanche Fuji C-Chain RPC: {RPC_URL}")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("Error: Could not connect to Avalanche Fuji C-Chain!")
        sys.exit(1)

    balance = w3.from_wei(w3.eth.get_balance(SENDER_ADDRESS), 'ether')
    print(f"Sender address: {SENDER_ADDRESS} | Balance: {balance} AVAX")
    if balance < 0.08:
        print("Error: Insufficient balance to deploy both contracts. Minimum ~0.08 AVAX required.")
        sys.exit(1)

    print("\nCompiling contracts...")
    compiled = solcx.compile_files(
        [
            "little_cli/contracts/CognitiveCreditToken.sol",
            "little_cli/contracts/PredictionMarket.sol"
        ],
        solc_version="0.8.20"
    )
    
    # 1. Deploy CognitiveCreditToken
    print("\nDeploying CognitiveCreditToken...")
    token_key = "little_cli/contracts/CognitiveCreditToken.sol:CognitiveCreditToken"
    token_interface = compiled[token_key]
    token_abi = token_interface['abi']
    token_bytecode = token_interface['bin']
    
    TokenContract = w3.eth.contract(abi=token_abi, bytecode=token_bytecode)
    nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
    
    # Initial supply: 10,000,000 tokens
    tx_token = TokenContract.constructor(10000000).build_transaction({
        'chainId': 43113,
        'gas': 4000000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'from': SENDER_ADDRESS
    })
    
    signed_tx_token = w3.eth.account.sign_transaction(tx_token, private_key=PRIVATE_KEY)
    tx_hash_token = w3.eth.send_raw_transaction(signed_tx_token.raw_transaction)
    print(f"Token deploy tx submitted: {tx_hash_token.hex()}")
    receipt_token = w3.eth.wait_for_transaction_receipt(tx_hash_token, timeout=120)
    token_address = receipt_token.contractAddress
    print(f"[SUCCESS] Token deployed at: {token_address}")

    # 2. Deploy PredictionMarket
    print("\nDeploying PredictionMarket...")
    market_key = "little_cli/contracts/PredictionMarket.sol:PredictionMarket"
    market_interface = compiled[market_key]
    market_abi = market_interface['abi']
    market_bytecode = market_interface['bin']
    
    MarketContract = w3.eth.contract(abi=market_abi, bytecode=market_bytecode)
    nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
    
    tx_market = MarketContract.constructor(token_address).build_transaction({
        'chainId': 43113,
        'gas': 5000000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'from': SENDER_ADDRESS
    })
    
    signed_tx_market = w3.eth.account.sign_transaction(tx_market, private_key=PRIVATE_KEY)
    tx_hash_market = w3.eth.send_raw_transaction(signed_tx_market.raw_transaction)
    print(f"Market deploy tx submitted: {tx_hash_market.hex()}")
    receipt_market = w3.eth.wait_for_transaction_receipt(tx_hash_market, timeout=120)
    market_address = receipt_market.contractAddress
    print(f"[SUCCESS] PredictionMarket deployed at: {market_address}")

    # 3. Transfer ERC-20 Credit Tokens to Agents
    print("\nDistributing ERC-20 Cognitive Credit Tokens to agents...")
    token_inst = w3.eth.contract(address=token_address, abi=token_abi)
    salt = get_system_salt()
    agents = ["gemini-2.5-pro", "gemini-2.5-flash", "claude-3-5-sonnet", "gpt-4o", "deepseek-coder", "swarm-moderator"]
    
    # 50,000 tokens each (scaled by 10**18)
    transfer_amount = 50000 * 10**18
    
    for agent in agents:
        agent_addr = get_agent_address(agent, salt)
        nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
        
        print(f"Sending 50,000 CCT tokens to agent {agent} ({agent_addr})...")
        tx_transfer = token_inst.functions.transfer(agent_addr, transfer_amount).build_transaction({
            'chainId': 43113,
            'gas': 100000,
            'gasPrice': w3.eth.gas_price,
            'nonce': nonce,
            'from': SENDER_ADDRESS
        })
        
        signed_tx_transfer = w3.eth.account.sign_transaction(tx_transfer, private_key=PRIVATE_KEY)
        tx_hash_transfer = w3.eth.send_raw_transaction(signed_tx_transfer.raw_transaction)
        w3.eth.wait_for_transaction_receipt(tx_hash_transfer, timeout=120)
        print(f"✓ Transferred successfully. Tx: {tx_hash_transfer.hex()}")

    # 4. Save fuji_config.json
    config_data = {
        "network": "avalanche-fuji",
        "rpc_url": RPC_URL,
        "contract_address": market_address,
        "token_address": token_address,
        "owner_address": SENDER_ADDRESS,
        "abi": market_abi,
        "token_abi": token_abi
    }
    
    config_path = "/root/agent/little-agent/little_cli/contracts/fuji_config.json"
    with open(config_path, "w") as f:
        json.dump(config_data, f, indent=2)
    print(f"\nConfig successfully written to: {config_path}")
    print("Verification instructions: Run verify_fuji.py next to verify the contracts on Snowtrace.")

if __name__ == "__main__":
    deploy()
