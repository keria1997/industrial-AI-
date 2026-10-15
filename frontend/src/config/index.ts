/**
 * 前端环境配置
 * 只配置后端 API 地址。前端禁止配置 AI 服务地址。
 */

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';
