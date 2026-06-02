import os
import sys
import time
import subprocess

print("=========================================================")
print("PREDICTION SWARM DAEMON INITIALIZED")
print(f"Interval: 2 minutes (120 seconds)")
print(f"Python Executable: {sys.executable}")
print("=========================================================\n")

while True:
    try:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Launching autonomous prediction run...")
        script_path = "/root/agent/little-agent/scripts/run_swarm_predictions.py"
        
        # Execute the swarm runner under the same virtualenv python binary
        result = subprocess.run([sys.executable, script_path], capture_output=True, text=True)
        
        # Log outputs
        if result.stdout:
            print(result.stdout)
        if result.stderr:
            print("ERROR OUTPUT:", result.stderr, file=sys.stderr)
            
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Swarm run complete. Sleeping for 120 seconds...\n")
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Exception in daemon loop: {e}", file=sys.stderr)
        time.sleep(10)
        continue
        
    time.sleep(120)
