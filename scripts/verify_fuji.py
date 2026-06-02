import os
import requests
import json
import time
from dotenv import load_dotenv

load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

API_KEY = os.getenv("SNOWTRACE_API_KEY", "78XJKTK21P5P4F3J6N6GDDCYMP313FSC13")
COMPILER_VERSION = "v0.8.20+commit.a1b79de6"

TOKEN_ADDRESS = "0x1f731f73E6A3F3732ddAc31F817910CED3560c7D"
MARKET_ADDRESS = "0x3095b207cEA9Dbd86B71b6d75FD2019971Cf62E2"

def check_status(guid):
    url = "https://api-testnet.snowtrace.io/api"
    print(f"Checking verification status for GUID: {guid}")
    for i in range(15):
        time.sleep(5)
        status_url = f"{url}?module=contract&action=checkverifystatus&guid={guid}&apikey={API_KEY}"
        resp = requests.get(status_url)
        res_data = resp.json()
        print(f"[{i+1}] Status: {res_data.get('result')}")
        if "Pass" in res_data.get("result", "") or "Verified" in res_data.get("result", ""):
            print("✓ Verified successfully!")
            return True
        elif "Fail" in res_data.get("result", ""):
            print("✗ Verification failed.")
            return False
    return False

def verify_token():
    source_file = "/root/agent/little-agent/little_cli/contracts/LittleCreditToken.sol"
    with open(source_file, "r") as f:
        source_code = f.read()

    print(f"\nSubmitting LittleCreditToken ({TOKEN_ADDRESS}) verification...")
    # Constructor argument: uint256 10000000 -> hex 989680 padded to 32 bytes
    constructor_args = "0000000000000000000000000000000000000000000000000000000000989680"

    url = "https://api-testnet.snowtrace.io/api"
    data = {
        "apikey": API_KEY,
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": TOKEN_ADDRESS,
        "sourceCode": source_code,
        "codeformat": "solidity-single-file",
        "contractname": "LittleCreditToken",
        "compilerversion": COMPILER_VERSION,
        "optimizationUsed": 0,
        "runs": 200,
        "licenseType": 3, # MIT
        "constructorArguments": constructor_args
    }

    resp = requests.post(url, data=data)
    res_data = resp.json()
    if res_data.get("status") == "1":
        check_status(res_data.get("result"))
    else:
        print(f"Failed to submit: {res_data}")

def verify_market():
    source_file = "/root/agent/little-agent/little_cli/contracts/PredictionMarket.sol"
    with open(source_file, "r") as f:
        source_code = f.read()

    print(f"\nSubmitting PredictionMarket ({MARKET_ADDRESS}) verification...")
    # Constructor argument: address TOKEN_ADDRESS -> remove 0x, pad to 32 bytes
    token_addr_clean = TOKEN_ADDRESS.replace("0x", "").zfill(64).lower()

    url = "https://api-testnet.snowtrace.io/api"
    data = {
        "apikey": API_KEY,
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": MARKET_ADDRESS,
        "sourceCode": source_code,
        "codeformat": "solidity-single-file",
        "contractname": "PredictionMarket",
        "compilerversion": COMPILER_VERSION,
        "optimizationUsed": 0,
        "runs": 200,
        "licenseType": 3, # MIT
        "constructorArguments": token_addr_clean
    }

    resp = requests.post(url, data=data)
    res_data = resp.json()
    if res_data.get("status") == "1":
        check_status(res_data.get("result"))
    else:
        print(f"Failed to submit: {res_data}")

if __name__ == "__main__":
    verify_token()
    verify_market()
