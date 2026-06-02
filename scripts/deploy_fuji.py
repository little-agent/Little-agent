import sys
import os
import json
import solcx
from web3 import Web3

# Ensure solcx compiler is ready
solcx.install_solc('0.8.20')

from dotenv import load_dotenv
load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

RPC_URL = "https://avalanche-fuji-c-chain.publicnode.com"
PRIVATE_KEY = os.getenv("FUJI_PRIVATE_KEY", "aee82fa4e0df351eb8275b0de7f00bddb8935c4d996c39bbe83069bdde48109a")
SENDER_ADDRESS = "0xDc9D44889eD7A98a9a2B976146B2395df25f334d"

def deploy():
    print(f"Connecting to Avalanche Fuji C-Chain RPC: {RPC_URL}")
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    if not w3.is_connected():
        print("Error: Could not connect to Avalanche Fuji C-Chain!")
        sys.exit(1)

    balance = w3.from_wei(w3.eth.get_balance(SENDER_ADDRESS), 'ether')
    print(f"Sender address: {SENDER_ADDRESS} | Balance: {balance} AVAX")
    if balance < 0.05:
        print("Error: Insufficient balance to deploy smart contract. Minimum ~0.05 AVAX required.")
        sys.exit(1)

    print("\nCompiling contracts/PredictionMarket.sol...")
    compiled = solcx.compile_files(
        ["little_cli/contracts/PredictionMarket.sol"],
        solc_version="0.8.20"
    )
    
    contract_key = "little_cli/contracts/PredictionMarket.sol:PredictionMarket"
    contract_interface = compiled[contract_key]
    abi = contract_interface['abi']
    bytecode = contract_interface['bin']

    print("Building deploy transaction...")
    PredictionMarketContract = w3.eth.contract(abi=abi, bytecode=bytecode)
    
    # Get transaction nonce
    nonce = w3.eth.get_transaction_count(SENDER_ADDRESS)
    
    # Build transaction
    tx = PredictionMarketContract.constructor().build_transaction({
        'chainId': 43113,  # Fuji Testnet ChainId
        'gas': 3000000,
        'gasPrice': w3.eth.gas_price,
        'nonce': nonce,
        'from': SENDER_ADDRESS
    })

    print("Signing deployment transaction...")
    signed_tx = w3.eth.account.sign_transaction(tx, private_key=PRIVATE_KEY)

    print("Sending deployment transaction to Avalanche Fuji...")
    tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
    print(f"Tx submitted. Tx Hash: {tx_hash.hex()}")
    
    print("Waiting for block confirmations (this can take 5-15 seconds)...")
    tx_receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    
    deployed_address = tx_receipt.contractAddress
    print(f"\n[SUCCESS] Contract deployed successfully!")
    print(f"Contract Address: {deployed_address}")
    print(f"Block Number: {tx_receipt.blockNumber}")
    print(f"Gas Used: {tx_receipt.gasUsed}")

    # Write deployment info to JSON file (excluding private_key for security)
    config_data = {
        "network": "avalanche-fuji",
        "rpc_url": RPC_URL,
        "contract_address": deployed_address,
        "owner_address": SENDER_ADDRESS,
        "abi": abi
    }
    
    config_path = "/root/agent/little-agent/little_cli/contracts/fuji_config.json"
    with open(config_path, "w") as f:
        json.dump(config_data, f, indent=2)
    print(f"Config successfully written to: {config_path}")

if __name__ == "__main__":
    deploy()
