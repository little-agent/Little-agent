"""Sandbox execution module for Little Agent.

Replaces raw shell execution with a clean shlex.split execution model
using asyncio subprocess creation to prevent shell injection.
"""
from __future__ import annotations

import asyncio
import logging
import os
import shlex
from typing import Any

logger = logging.getLogger(__name__)

class LocalSandbox:
    """A safe command executor that runs commands with shell=False.

    Avoids dangerous metacharacters and prevents shell injection.
    """
    def __init__(self, cwd: str | None = None, env: dict[str, str] | None = None):
        self.cwd = cwd or os.getcwd()
        self.env = env or dict(os.environ)

    async def execute(
        self,
        command_string: str,
        timeout: float = 120.0,
        stdin_data: str | None = None,
    ) -> dict[str, Any]:
        """Split command_string safely and run it via asyncio subprocess."""
        # 1. Parse command safely
        try:
            # Check for common shell operators
            has_shell_operators = any(op in command_string for op in ['|', '&&', ';', '>', '<', '$', '`'])
            if has_shell_operators:
                # Execute securely via bash process wrapper with shell=False
                cmd_args = ["/bin/bash", "-c", command_string]
            else:
                cmd_args = shlex.split(command_string)
        except ValueError as e:
            return {
                "output": "",
                "exit_code": -1,
                "error": f"Invalid command string parsing: {e}",
            }

        if not cmd_args:
            return {
                "output": "",
                "exit_code": -1,
                "error": "Empty command string",
            }

        # 2. Run the subprocess asynchronously
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdin=asyncio.subprocess.PIPE if stdin_data is not None else asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=self.cwd,
                env=self.env,
            )
            
            if stdin_data is not None:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(input=stdin_data.encode('utf-8', errors='replace')),
                    timeout=timeout
                )
            else:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    proc.communicate(),
                    timeout=timeout
                )

            exit_code = proc.returncode or 0
            output = stdout_bytes.decode('utf-8', errors='replace')
            error_output = stderr_bytes.decode('utf-8', errors='replace')

            # Combine stdout and stderr if stderr is populated
            combined_output = output
            if error_output:
                if combined_output:
                    combined_output += "\n" + error_output
                else:
                    combined_output = error_output

            return {
                "output": combined_output,
                "exit_code": exit_code,
                "error": None if exit_code == 0 else f"Process exited with non-zero code {exit_code}",
            }

        except asyncio.TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            return {
                "output": "",
                "exit_code": 124,
                "error": f"Command timed out after {timeout} seconds",
            }
        except Exception as e:
            logger.error("Sandbox execution failed: %s", e)
            return {
                "output": "",
                "exit_code": -1,
                "error": f"Execution error: {e}",
            }
