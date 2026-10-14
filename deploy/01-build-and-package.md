# 01 - 编译与打包

## 构建机要求

- Node.js 20 或更高版本，npm 10 或更高版本。
- Java Development Kit 17。
- Apache Maven 3.9 或更高版本。
- GNU `tar`、`sha256sum` 或 `shasum`，以及 Bash 4 或更高版本。
- 可访问 npm 和 Maven 仓库；如果使用内网镜像或已预热的本地缓存，则不要求公网访问。

以下命令都在项目根目录 `gongye_ai_plat` 中执行。

## 一条命令构建

```bash
chmod +x deploy/scripts/*.sh deploy/database/scripts/*.sh
./deploy/scripts/build-release.sh
```

脚本按以下顺序执行：

1. 清理 Node 和 Maven 的旧构建输出。
2. 使用 `npm ci` 按 `package-lock.json` 安装前端依赖。
3. 执行 TypeScript 类型检查和前端 Vitest 测试。
4. 构建前端到独立真实目录，并复制到发布包 `app/dist/`。
5. 校验 Java 路由定义。
6. 执行后端 Maven 测试，并打包可执行 JAR。
7. 组装 `app/`、`config/`、`scripts/`、`database/` 和环境配置模板。
8. 生成 `MANIFEST.txt`、`MANIFEST.sha256`、发布压缩包和压缩包校验文件。

输出文件命名格式：

```text
deploy/artifacts/industrial-ai-0.1.0-YYYYMMDDHHMMSS.tar.gz
deploy/artifacts/industrial-ai-0.1.0-YYYYMMDDHHMMSS.tar.gz.sha256
```

只有在受控紧急场景下才允许使用下面的测试跳过开关：

```bash
SKIP_TESTS=1 ./deploy/scripts/build-release.sh
```

紧急发布产物必须在发布记录中标注原因，并在恢复正常后重新执行完整测试构建。

## 手工等价命令

需要单独检查某一步时，可以使用以下命令：

```bash
npm ci
npm run typecheck
npm run test:frontend
npm run build
npm run test:routes:java
mvn -f server-java/pom.xml clean package
```

前端产物是 `dist/`；后端产物是 `server-java/target/industrial-ai-api-0.1.0.jar`。

## 传输到 Ubuntu

先用生成的实际文件名替换示例中的版本和时间戳：

```bash
sha256sum -c deploy/artifacts/industrial-ai-0.1.0-*.tar.gz.sha256
scp deploy/artifacts/industrial-ai-0.1.0-*.tar.gz* user@ubuntu-host:/tmp/
```

在 Ubuntu 主机上：

```bash
mkdir -p /tmp/industrial-ai-release
tar -xzf /tmp/industrial-ai-0.1.0-*.tar.gz -C /tmp/industrial-ai-release --strip-components=1
```

发布压缩包包含 PostgreSQL 离线软件包，因此体积大于仅包含应用的发布包。
