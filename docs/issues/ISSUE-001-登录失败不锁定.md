# ISSUE-001：登录失败不锁定（P0 安全）
- 级别：P0 安全 | 模块：认证 | 状态：🔴 待修复
## 问题
连续 7 次错误密码后账号未锁定，第 8 次正确密码直接登录成功。
## 方案
AuthController.login() 添加失败计数 + 5 次/15 分钟锁定。
修改文件：AuthController.java + RegisteredUser.java + 数据库迁移。
## 验收
第 5 次失败触发锁定；锁定期间正确密码被拒绝；到期后可登录。
## 进展
🔴 待修复（方案详见 reports/fix-plan.md）
