import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Execute a Python script and return the parsed JSON result.
 * 
 * @param scriptName - Name of the Python script in server/python-ml/
 * @param inputData - Data to pass to the script via JSON file
 * @param cliArgs - Optional additional CLI arguments to pass to the Python script
 * @returns Parsed JSON output from the Python script
 */
export async function executePythonScript(
  scriptName: string,
  inputData: any,
  cliArgs: string[] = []
): Promise<any> {
  const tempDir = os.tmpdir();
  const inputFile = path.join(tempDir, `ml-orion-input-${Date.now()}.json`);
  const outputFile = path.join(tempDir, `ml-orion-output-${Date.now()}.json`);
  const scriptPath = path.join(__dirname, "python-ml", scriptName);

  try {
    // Write input data to temp file
    await writeFile(inputFile, JSON.stringify(inputData, null, 2));

    // Find Python executable (prefer venv if exists)
    const pythonPath = process.env.PYTHON_PATH || "python";

    // Build arguments: [scriptPath, inputFile, outputFile, ...additionalArgs]
    const args = [scriptPath, inputFile, outputFile, ...cliArgs];
    
    console.log(`[Python Executor] Running: ${pythonPath} ${scriptName} ${cliArgs.join(' ')}`);

    // Execute Python script
    const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      const proc = spawn(pythonPath, args, {
        cwd: path.join(__dirname, "python-ml"),
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      proc.on("close", (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      proc.on("error", (err) => {
        reject(new Error(`Failed to spawn Python process: ${err.message}`));
      });
    });

    // Read output file — this is the authoritative result source
    let outputData;
    try {
      const outputContent = await readFile(outputFile, "utf-8");
      outputData = JSON.parse(outputContent);
      console.log(`[Python Executor] Success: ${scriptName} returned`, outputData.bestModel || outputData.success);
    } catch (e) {
      // Output file missing or malformed: scan stdout for any valid JSON line
      const allOutput = result.stdout || "";
      let parsed: any = null;
      // Try each line of stdout in reverse — find the last parseable JSON
      const lines = allOutput.split(/\r?\n/).reverse();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            parsed = JSON.parse(trimmed);
            break;
          } catch {
            // continue searching
          }
        }
      }
      if (parsed) {
        outputData = parsed;
        console.log(`[Python Executor] Success (from stdout): ${scriptName}`);
      } else {
        const detail = result.stderr || result.stdout || "No output";
        console.error(`[Python Executor] Failed to parse output for ${scriptName}:`, detail);
        throw new Error(`Python script failed: ${detail}`);
      }
    }

    // Cleanup temp files
    await Promise.all([
      unlink(inputFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);

    if (!outputData.success) {
      throw new Error(outputData.error || "Python script execution failed");
    }

    return outputData;
  } catch (error: any) {
    // Cleanup on error
    await Promise.all([
      unlink(inputFile).catch(() => {}),
      unlink(outputFile).catch(() => {}),
    ]);
    throw error;
  }
}
