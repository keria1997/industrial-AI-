import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const envFiles = [".env.local"].filter((path) => existsSync(path));
for (const path of envFiles) process.loadEnvFile(path);

const child = spawn("mvn", ["-f", "backend/pom.xml", "spring-boot:run"], {
  env: process.env,
  stdio: "inherit",
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
