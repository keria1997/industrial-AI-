/**
 * 消息气泡组件
 *
 * 渲染单条聊天消息，区分用户和 AI 角色。
 */

import type { ChatMessage } from '../types/chat';

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-slate-800 border border-slate-200 rounded-bl-sm'
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
