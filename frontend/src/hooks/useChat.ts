/**
 * 聊天逻辑 Hook
 *
 * 管理会话创建、消息状态、SSE 流式接收。
 * 调用链路: ChatWindow -> useChat -> api/chat
 */

import { useState, useCallback, useRef } from 'react';
import { createSession, streamChat } from '../api/chat';
import type { ChatMessage } from '../types/chat';

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const ensureSession = useCallback(async () => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = await createSession();
    }
    return sessionIdRef.current;
  }, []);

  const sendMessage = useCallback(async (text: string, useRag: boolean) => {
    setError(null);
    setIsStreaming(true);

    // 立即显示用户消息
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    // 初始化 assistant 占位消息
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const sessionId = await ensureSession();
      // SSE 流式接收
      for await (const chunk of streamChat(sessionId, text, useRag)) {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsg.id ? { ...m, content: m.content + chunk } : m
          )
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setIsStreaming(false);
    }
  }, [ensureSession]);

  return { messages, sendMessage, isStreaming, error };
}
