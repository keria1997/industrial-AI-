/**
 * 聊天 API 客户端
 *
 * 只请求业务后端，禁止直连 AI 服务。
 * 调用链路: useChat -> api/chat -> backend/ChatController
 */

import { API_BASE_URL } from '../config';
import type { ChatMessage } from '../types/chat';

const BASE = `${API_BASE_URL}/api/v1/chat`;

function getHeaders(): HeadersInit {
  const token = sessionStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function createSession(): Promise<string> {
  const res = await fetch(`${BASE}/sessions`, {
    method: 'POST',
    headers: getHeaders(),
  });
  const json = await res.json();
  return json.data.sessionId;
}

export async function getMessages(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`, {
    headers: getHeaders(),
  });
  const json = await res.json();
  return json.data;
}

/**
 * SSE 流式聊天，返回 async iterator 逐 chunk 产出文本。
 * 调用链路: useChat -> streamChat -> backend/ChatController.chat (SSE)
 */
export async function* streamChat(
  sessionId: string,
  message: string,
  useRag: boolean,
): AsyncGenerator<string> {
  const body = JSON.stringify({ sessionId, message, useRag });
  const res = await fetch(`${BASE}/completions`, {
    method: 'POST',
    headers: { ...getHeaders(), Accept: 'text/event-stream' },
    body,
  });

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // 解析 SSE 格式: event:xxx\ndata:yyy\n\n
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') {
          yield data;
        }
      }
    }
  }
}
