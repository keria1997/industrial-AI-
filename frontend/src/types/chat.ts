/**
 * 聊天类型定义，与 docs/api-contract.md 保持一致
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatRequest {
  sessionId: string;
  message: string;
  useRag: boolean;
}
