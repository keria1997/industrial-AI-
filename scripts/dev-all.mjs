import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const envFiles = [".env.local"].filter((path) => existsSync(path));
for (const path of envFiles) process.loadEnvFile(path);

const procs = [];

const frontend = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", "5173"], {
  cwd: "frontend",
  env: process.env,
  stdio: "inherit",
});
procs.push(frontend);

const backend = spawn("mvn", ["-f", "backend/pom.xml", "spring-boot:run"], {
  env: process.env,
  stdio: "inherit",
});
procs.push(backend);

for (const proc of procs) {
  proc.on("exit", (code, signal) => {
    procs.forEach((p) => p !== proc && p.kill());
    process.exitCode = code ?? (signal ? 1 : 0);
    process.exit();
  });
}
