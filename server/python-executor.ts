import { spawn, execSync } from "child_process";
import { access, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import os from "os";

function getGfortranLibPath(): string {
  if (process.platform === "win32") {
    return "";
  }

  try {
    const libPath = execSync("gfortran -print-file-name=libgomp.so.1", { encoding: "utf-8" }).trim();
    if (libPath && libPath !== "libgomp.so.1") {
      return path.dirname(libPath);
    }
  } catch {
    // gfortran not available
  }
  return "";
}

const GFORTRAN_LIB_PATH = getGfortranLibPath();

let cachedPythonMlDir: string | null = null;

type PythonCommandCandidate = {
  command: string;
  preArgs?: string[];
};

async function resolvePythonMlDir() {
  if (cachedPythonMlDir) {
    return cachedPythonMlDir;
  }

  const candidateDirs = [
    process.env.PYTHON_ML_DIR,
    // Prefer the source directory so Replit (and local dev) always picks up
    // the latest git-checked-out scripts instead of a potentially-stale dist copy.
    path.resolve(process.cwd(), "server", "python-ml"),
    path.resolve(process.cwd(), "dist", "python-ml"),
  ].filter((value): value is string => Boolean(value));

  if (typeof __dirname !== "undefined") {
    // Fall back to __dirname/python-ml (typically dist/python-ml in the CJS bundle)
    // only when neither of the above paths exists on disk.
    candidateDirs.push(path.resolve(__dirname, "python-ml"));
  }

  for (const candidateDir of candidateDirs) {
    try {
      await access(candidateDir);
      cachedPythonMlDir = candidateDir;
      return candidateDir;
    } catch {
      // Continue until we find a directory that exists in the current runtime.
    }
  }

  throw new Error(
    `Could not locate the python-ml directory. Checked: ${candidateDirs.join(", ")}`,
  );
}

function getPythonCommandCandidates(): PythonCommandCandidate[] {
  if (process.env.PYTHON_PATH) {
    return [{ command: process.env.PYTHON_PATH }];
  }

  if (process.platform === "win32") {
    const venvPython = path.resolve(process.cwd(), ".venv", "Scripts", "python.exe");
    return [
      { command: venvPython },
      { command: "python" },
      { command: "py", preArgs: ["-3"] },
      { command: "python3" },
    ];
  }

  const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python");
  return [
    { command: venvPython },
    { command: "python3" },
    { command: "python" },
    { command: "/usr/bin/python3" },
  ];
}

async function spawnPythonProcess(
  candidates: PythonCommandCandidate[],
  scriptPath: string,
  scriptArgs: string[],
  cwd: string,
) {
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    const args = [...(candidate.preArgs || []), scriptPath, ...scriptArgs];

    try {
      const result = await new Promise<{ stdout: string; stderr: string; code: number; commandLabel: string }>((resolve, reject) => {
        const existingLdPath = process.env.LD_LIBRARY_PATH || "";
        const ldLibraryPath = GFORTRAN_LIB_PATH
          ? [GFORTRAN_LIB_PATH, existingLdPath].filter(Boolean).join(":")
          : existingLdPath;
        const proc = spawn(candidate.command, args, {
          cwd,
          env: {
            ...process.env,
            ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
          },
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
          resolve({
            stdout,
            stderr,
            code: code || 0,
            commandLabel: [candidate.command, ...(candidate.preArgs || [])].join(" "),
          });
        });

        proc.on("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "ENOENT") {
            reject(err);
            return;
          }

          reject(new Error(`Failed to spawn Python process: ${err.message}`));
        });
      });

      return result;
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        lastError = new Error(`Python executable not found: ${candidate.command}`);
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Failed to spawn Python process: no Python executable found. Checked ${candidates
      .map((candidate) => [candidate.command, ...(candidate.preArgs || [])].join(" "))
      .join(", ")}`,
  );
}

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
  const pythonMlDir = await resolvePythonMlDir();
  const tempDir = os.tmpdir();
  const inputFile = path.join(tempDir, `ml-orion-input-${Date.now()}.json`);
  const outputFile = path.join(tempDir, `ml-orion-output-${Date.now()}.json`);
  const scriptPath = path.join(pythonMlDir, scriptName);

  try {
    await access(scriptPath);

    // Write input data to temp file
    await writeFile(inputFile, JSON.stringify(inputData, null, 2));

    // Build arguments: [scriptPath, inputFile, outputFile, ...additionalArgs]
    const args = [inputFile, outputFile, ...cliArgs];
    const pythonCandidates = getPythonCommandCandidates();

    console.log(
      `[Python Executor] Running ${scriptName} with candidates: ${pythonCandidates
        .map((candidate) => [candidate.command, ...(candidate.preArgs || [])].join(" "))
        .join(", ")}`,
    );

    // Execute Python script
    const result = await spawnPythonProcess(pythonCandidates, scriptPath, args, pythonMlDir);

    // Read output file — this is the authoritative result source
    let outputData;
    try {
      const outputContent = await readFile(outputFile, "utf-8");
      outputData = JSON.parse(outputContent);
      console.log(`[Python Executor] Success via ${result.commandLabel}: ${scriptName} returned`, outputData.bestModel || outputData.success);
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
        console.log(`[Python Executor] Success from stdout via ${result.commandLabel}: ${scriptName}`);
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
