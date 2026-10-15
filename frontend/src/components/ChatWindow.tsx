/**
 * 聊天窗口容器
 *
 * 组合消息列表和输入框，管理聊天状态。
 * 调用链路: App -> ChatWindow -> useChat -> api/chat
 */

import { useChat } from '../hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { ChatInput } from './ChatInput';

export function ChatWindow() {
  const { messages, sendMessage, isStreaming, error } = useChat();

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC]">
      <header className="h-14 flex items-center justify-center border-b border-slate-200 bg-white shrink-0">
        <h1 className="text-[16px] font-bold text-slate-800">AI 助手</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-400 text-[14px]">
            开始对话
          </div>
        )}
        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && (
          <div className="text-slate-400 text-[12px] ml-1">正在输入...</div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-50 text-rose-600 text-[13px] border-t border-rose-200">
          {error}
        </div>
      )}

      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
