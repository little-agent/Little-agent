import os
from dotenv import load_dotenv
load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

API_KEY = os.getenv("SNOWTRACE_API_KEY", "78XJKTK21P5P4F3J6N6GDDCYMP313FSC13")
CONTRACT_ADDRESS = "0x2ee7e9CA2629B2450ae97daC4fa14f1B9E57E4ff"
COMPILER_VERSION = "v0.8.20+commit.a1b79de6"

def verify():
    source_file = "/root/agent/little-agent/little_cli/contracts/PredictionMarket.sol"
    with open(source_file, "r") as f:
        source_code = f.read()

    print(f"Submitting contract {CONTRACT_ADDRESS} verification to Snowtrace...")
    
    url = "https://api-testnet.snowtrace.io/api"
    data = {
        "apikey": API_KEY,
        "module": "contract",
        "action": "verifysourcecode",
        "contractaddress": CONTRACT_ADDRESS,
        "sourceCode": source_code,
        "codeformat": "solidity-single-file",
        "contractname": "PredictionMarket",
        "compilerversion": COMPILER_VERSION,
        "optimizationUsed": 0,
        "runs": 200,
        "licenseType": 3 # MIT
    }

    resp = requests.post(url, data=data)
    print(f"Status Code: {resp.status_code}")
    print(f"Response JSON: {resp.text}")
    
    try:
        res_data = resp.json()
        if res_data.get("status") == "1":
            guid = res_data.get("result")
            print(f"Successfully submitted. GUID: {guid}")
            
            # Poll status
            print("Checking verification status...")
            for i in range(15):
                time.sleep(5)
                status_url = f"{url}?module=contract&action=checkverifystatus&guid={guid}&apikey={API_KEY}"
                status_resp = requests.get(status_url)
                status_data = status_resp.json()
                print(f"[{i+1}] Status response: {status_data}")
                if status_data.get("result") == "Pass - Verified" or "Verified" in status_data.get("result", ""):
                    print("Contract verified successfully!")
                    break
                elif "Fail" in status_data.get("result", ""):
                    print("Verification failed.")
                    break
        else:
            print("Submission failed.")
    except Exception as e:
        print(f"Error checking status: {e}")

if __name__ == "__main__":
    verify()
