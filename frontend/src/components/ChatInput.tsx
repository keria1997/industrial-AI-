/**
 * 聊天输入框组件
 *
 * 收集用户输入，支持 Enter 发送。禁止包含任何 prompt 或 AI 逻辑。
 */

import { useState, type FormEvent } from 'react';

interface Props {
  onSend: (message: string, useRag: boolean) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [useRag, setUseRag] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || disabled) return;
    onSend(text.trim(), useRag);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 p-4 border-t border-slate-200 bg-white">
      <label className="flex items-center gap-1.5 text-[12px] text-slate-500 cursor-pointer">
        <input
          type="checkbox"
          checked={useRag}
          onChange={e => setUseRag(e.target.checked)}
          className="accent-blue-600"
        />
        知识库检索
      </label>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="输入消息..."
        disabled={disabled}
        className="flex-1 h-10 rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-blue-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="h-10 px-5 rounded-lg bg-blue-600 text-white text-[14px] hover:bg-blue-700 disabled:opacity-50"
      >
        发送
      </button>
    </form>
  );
}
