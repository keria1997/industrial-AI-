import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [];
let shuttingDown = false;

function pipe(stream, label) {
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    process.stdout.write(chunk.replaceAll(/^/gm, `${label} `));
  });
}

function start(name, args, env = process.env) {
  const child = spawn(npmCommand, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.name = name;
  pipe(child.stdout, `[${name}]`);
  pipe(child.stderr, `[${name}]`);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    void shutdown();
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  children.push(child);
  return child;
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && !child.signalCode) child.kill("SIGTERM");
  }
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

const javaEnv = {
  ...process.env,
  JAVA_NATIVE_ONLY: process.env.JAVA_NATIVE_ONLY || "true",
};
start("java-api", ["run", "dev:java-api"], javaEnv);
start("web", ["run", "dev"], {
  ...process.env,
  VITE_API_PROXY_TARGET: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8081",
});
