/**
 * AI 助手侧滑抽屉
 *
 * 从右侧滑入，包含聊天窗口。
 * 从顶栏 Sparkles 按钮触发。
 * 调用链路: App -> AiAssistantDrawer -> useChat -> api/chat
 */

import { useEffect, useRef } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { MessageBubble } from './MessageBubble';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AiAssistantDrawer({ open, onClose }: Props) {
  const { messages, sendMessage, isStreaming, error } = useChat();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[420px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="h-14 flex items-center justify-between px-5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-purple-600" />
            <span className="text-[15px] font-bold text-slate-800">AI 助手</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 text-[13px] gap-2">
              <Sparkles size={28} className="text-purple-300" />
              <span>有什么可以帮你的？</span>
            </div>
          )}
          {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
          {isStreaming && <div className="text-slate-400 text-[12px] ml-1">正在输入...</div>}
        </div>

        {error && <div className="px-4 py-2 bg-rose-50 text-rose-600 text-[12px]">{error}</div>}

        <form
          onSubmit={e => {
            e.preventDefault();
            const input = inputRef.current;
            if (!input || !input.value.trim() || isStreaming) return;
            sendMessage(input.value.trim(), false);
            input.value = '';
          }}
          className="p-4 border-t border-slate-200 flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="输入消息..."
            disabled={isStreaming}
            className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-[13px] outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming}
            className="h-10 px-4 rounded-lg bg-purple-600 text-white text-[13px] hover:bg-purple-700 disabled:opacity-50"
          >
            发送
          </button>
        </form>
      </div>
    </div>
  );
}
