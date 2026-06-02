import os
import sys
import json
import time
import requests
from dotenv import load_dotenv

# Ensure little_cli package is importable
sys.path.insert(0, "/root/agent/little-agent")

from little_cli import prediction_market_db as pm_db
from little_cli import web3_sim

# Load env variables
load_dotenv("/root/agent/little-agent/.env")
load_dotenv("/root/.little/.env")

AGENT_PARADIGMS = {
    "gemini-2.5-pro": {
        "model": "google/gemini-2.5-pro",
        "description": "Pragmatic developer agent. Prioritizes code compilation, low block times, and statistical correctness. Avoids high-risk speculation.",
        "prompt": "You are Gemini 2.5 Pro. You are highly analytical, developer-focused, and statistically rigorous. You focus on code correctness, block time metrics, and structural specifications. You bet conservatively, avoiding high risk unless there is strong empirical support."
    },
    "gemini-2.5-flash": {
        "model": "google/gemini-2.5-flash",
        "description": "Arbitrage hunter. Focuses on speed and capturing short-term sentiment and fast-moving trends.",
        "prompt": "You are Gemini 2.5 Flash. You are an opportunistic, high-speed trading agent. You search for rapid market odds imbalances and react quickly. You scale positions based on immediate trend momentum."
    },
    "claude-3-5-sonnet": {
        "model": "anthropic/claude-3.5-sonnet",
        "description": "Ergonomic system developer. Prioritizes developer experience, long-term codebase health, and balanced growth.",
        "prompt": "You are Claude 3.5 Sonnet. You are a balanced, context-aware system architect. You evaluate the long-term impact on developers and the ecosystem. You bet when there is clean structural layout and low technical debt."
    },
    "gpt-4o": {
        "model": "openai/gpt-4o",
        "description": "Aggressive macro trend-follower. High conviction bets, scales quickly, follows consensus.",
        "prompt": "You are GPT-4o. You are a highly confident, trend-following, and aggressive agent. You scale positions fast, bet heavily when probability is high, and like to drive consensus."
    },
    "deepseek-coder": {
        "model": "deepseek/deepseek-coder",
        "description": "Syntax correctness auditor. Strictly checks code compliance, compiler warnings, and linter errors.",
        "prompt": "You are DeepSeek Coder. You are obsessed with low-level details: compilation logs, linting results, unit tests, and syntax safety. If a prediction market mentions syntax or lint errors, you analyze it down to the exact compiler behaviour."
    },
    "swarm-moderator": {
        "model": "meta-llama/llama-3-8b-instruct",
        "description": "Hedger and contrarian. Balances extreme market consensus, plays devil's advocate.",
        "prompt": "You are the Swarm Moderator. You are a cautious hedging agent. Your job is to mitigate risks, balance extreme market odds, and buy contrary positions (NO when odds are over-bought YES, or YES when odds are overly discounted)."
    }
}

def ask_openrouter(agent_id, paradigm_prompt, market_title, market_desc, current_prob, yes_price, no_price, balance):
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key or "your_" in api_key or api_key.startswith("sk-or-v1-replace"):
        return get_fallback_decision(agent_id, market_title, current_prob)

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://little-agent.com",
        "X-Title": "Little Swarm Prediction Engine"
    }

    user_content = f"""
Analyze this prediction market pool:
Title: {market_title}
Description: {market_desc}
Current probability of YES: {current_prob}%
YES price: {yes_price:.2f} credits
NO price: {no_price:.2f} credits
Your current balance: {balance:.2f} credits

Your Paradigm:
{paradigm_prompt}

Decide your action: BUY_YES, BUY_NO, or HOLD.
If you decide to buy, output the number of shares (integer, between 5 and 30) and a brief rationale (under 100 words) reflecting your paradigm.

Response MUST be in strict JSON format like:
{{
  "decision": "BUY_YES",
  "shares": 15,
  "rationale": "Reasoning here..."
}}
Do NOT output any markdown tags (like ```json), write only the raw JSON string.
"""

    payload = {
        "model": AGENT_PARADIGMS[agent_id]["model"],
        "messages": [
            {"role": "system", "content": "You are a professional prediction market participant. You speak only in valid JSON format matching the schema requested. No prose."},
            {"role": "user", "content": user_content}
        ],
        "temperature": 0.2
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        if response.status_code == 200:
            data = response.json()
            content = data["choices"][0]["message"]["content"].strip()
            # Clean possible markdown wrap
            if content.startswith("```"):
                content = content.replace("```json", "").replace("```", "").strip()
            res = json.loads(content)
            return res.get("decision", "HOLD"), int(res.get("shares", 0)), res.get("rationale", "")
        else:
            print(f"OpenRouter API returned error code {response.status_code}: {response.text}")
            return get_fallback_decision(agent_id, market_title, current_prob)
    except Exception as e:
        print(f"Error querying OpenRouter for {agent_id}: {e}")
        return get_fallback_decision(agent_id, market_title, current_prob)

def get_fallback_decision(agent_id, market_title, current_prob):
    import random
    decision = "HOLD"
    shares = 0
    rationale = "Fallback simulation logic."

    title_lower = market_title.lower()
    
    if agent_id == "gemini-2.5-pro":
        if "block time" in title_lower or "telemetry" in title_lower:
            decision = "BUY_YES"
            shares = 20
            rationale = "[Gemini 2.5 Pro]: Average Fuji C-Chain blocktimes are statistically proven to remain under 2 seconds. Favorable network conditions support a Yes outcome."
        else:
            decision = "HOLD"
    elif agent_id == "gemini-2.5-flash":
        decision = "BUY_YES" if current_prob < 40 else "BUY_NO"
        shares = 15
        rationale = f"[Gemini 2.5 Flash]: Rapidly scaling into arbitrage opportunity based on odds imbalance at {current_prob}%."
    elif agent_id == "claude-3-5-sonnet":
        if "compile" in title_lower or "lint" in title_lower:
            decision = "BUY_YES"
            shares = 25
            rationale = "[Claude 3.5 Sonnet]: Syntactic patterns and clean compilation suite structure ensure stable build outcomes. Favorable long-term prospect."
        else:
            decision = "BUY_NO"
            shares = 10
            rationale = "[Claude 3.5 Sonnet]: Positioned cautiously due to systemic network dependencies."
    elif agent_id == "gpt-4o":
        # Follow trend/momentum
        decision = "BUY_YES" if current_prob >= 50 else "BUY_NO"
        shares = 30
        rationale = f"[GPT-4o]: Strong momentum observed on the {decision} side. Aggressively sizing position to capture maximum yield."
    elif agent_id == "deepseek-coder":
        if "compile" in title_lower or "lint" in title_lower:
            decision = "BUY_YES"
            shares = 30
            rationale = "[DeepSeek Coder]: Rigorous code verification confirms that the indexing pipeline operates with zero syntax warnings. High probability of success."
        else:
            decision = "HOLD"
    elif agent_id == "swarm-moderator":
        # Contrarian hedger
        decision = "BUY_NO" if current_prob > 50 else "BUY_YES"
        shares = 15
        rationale = f"[Swarm Moderator]: Hedging risk to stabilize consensus odds. Placing contrarian position to correct current {current_prob}% probability skew."

    return decision, shares, rationale

def run_predictions():
    print("======================================================================")
    print("STARTING AUTONOMOUS SWARM PREDICTION RUN")
    print(f"Time: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("======================================================================\n")

    # Force sync before starting
    print("Syncing with Avalanche Fuji C-Chain...")
    try:
        web3_sim.sync_blockchain_events()
        print("✓ Local database cache synchronized.")
    except Exception as e:
        print(f"Warning during sync: {e}")

    markets = pm_db.get_markets()
    open_markets = [m for m in markets if m["status"] == "OPEN"]
    
    if not open_markets:
        print("No open prediction markets found. Swarm is idle.")
        return

    print(f"Found {len(open_markets)} active markets. Evaluating agents...")

    for m in open_markets:
        market_id = m["id"]
        title = m["title"]
        desc = m["description"] or ""
        prob_yes = int(m.get("probability_yes", 0.5) * 100)
        price_yes = m.get("price_yes", 0.5)
        price_no = m.get("price_no", 0.5)

        print(f"\nEvaluating Pool: '{title}' (ID: {market_id})")
        print(f"Odds: {prob_yes}% YES | Prices: YES={price_yes:.2f} cr, NO={price_no:.2f} cr")

        for agent_id, paradigm in AGENT_PARADIGMS.items():
            # Check if this agent already made a trade in this pool
            conn = pm_db.connect()
            already_traded = False
            try:
                cursor = conn.execute("SELECT id FROM pm_trades WHERE market_id = ? AND agent_id = ?", (market_id, agent_id))
                if cursor.fetchone():
                    already_traded = True
            finally:
                conn.close()

            if already_traded:
                print(f"  - Agent '{agent_id}' has already placed a trade in this market. Skipping.")
                continue

            balance = pm_db.get_agent_balance(agent_id)
            if balance <= 0:
                print(f"  - Agent '{agent_id}' has insufficient balance ({balance:.2f} cr). Skipping.")
                continue

            print(f"  - Requesting decision for agent '{agent_id}' (Balance: {balance:.2f} cr)...")
            decision, shares, rationale = ask_openrouter(
                agent_id=agent_id,
                paradigm_prompt=paradigm["prompt"],
                market_title=title,
                market_desc=desc,
                current_prob=prob_yes,
                yes_price=price_yes,
                no_price=price_no,
                balance=balance
            )

            if decision == "HOLD" or shares <= 0:
                print(f"    └─ Action: HOLD. (No action taken).")
                continue

            trade_type = "BUY_YES" if decision == "BUY_YES" else "BUY_NO"
            print(f"    └─ Action: {trade_type} | Shares: {shares} | Rationale: '{rationale}'")

            print(f"       Broadcasting on-chain transaction for {agent_id}...")
            try:
                res = web3_sim.web3_place_trade(
                    agent_id=agent_id,
                    market_id=market_id,
                    trade_type=trade_type,
                    shares=float(shares),
                    rationale=rationale
                )
                print(f"       [SUCCESS] Transaction confirmed! Tx Hash: {res['tx_hash']} | Cost: {res['cost']:.2f} CCT")
                # Sleep briefly to avoid RPC rate limit and block timing issues
                time.sleep(2.0)
            except Exception as e:
                print(f"       [REVERTED] On-chain tx failed: {e}")

    print("\n======================================================================")
    print("SWARM PREDICTION RUN COMPLETE")
    print("======================================================================")

if __name__ == "__main__":
    run_predictions()
