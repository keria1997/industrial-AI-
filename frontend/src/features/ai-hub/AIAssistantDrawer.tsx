import { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, X, Send, UploadCloud, CheckCircle2, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { type ChatMessage, type AIActionPlan, type DomainId, defaultDomainCategories } from './types';
import { aiApi } from '../../api/ai';
import type { ApiContext } from '../../api/client';
import { DataImportPanel } from './import/DataImportPanel';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  tenantCode: string;
  roleName: string;
  onActionSubmit?: (action: AIActionPlan) => void;
  apiContext?: ApiContext | null;
  permissions?: string[];
};

const formatTime = () => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const importEntityPermissionMap: Record<string, string> = {
  warehouse: 'inventory.warehouse.create',
  product: 'inventory.product.create',
  material: 'inventory.material.create',
  customer: 'sc.customer.create',
  supplier: 'sc.supplier.create',
  inventoryFact: 'inventory.availability.import',
};

export const AIAssistantDrawer = ({ isOpen, onClose, tenantCode, roleName, onActionSubmit, apiContext, permissions = [] }: Props) => {
  const hasImportPermission = permissions.includes('*') || permissions.includes('ai.import.use')
    || permissions.includes('inventory.availability.import');
  const allowedImportEntities = Object.entries(importEntityPermissionMap)
    .filter(([, perm]) => permissions.includes('*') || permissions.includes(perm))
    .map(([entity]) => entity);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '你好，我是工业 AI 助手。你可以直接问经营、销售、生产、库存和采购数据；涉及生成单据或改变 ERP 数据时，我会先给出依据、影响范围和审批要求。',
      time: formatTime(),
    },
  ]);
  const [input, setInput] = useState('');
  const [expandedBasis, setExpandedBasis] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<DomainId>('inventory');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [requestError, setRequestError] = useState<{ message: string; retryText?: string } | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const scope = `${apiContext?.tenantId || ''}:${apiContext?.accessToken || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const chatPending = useRef(false);
  const actionPending = useRef(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMessages([]);
    setConversationId(undefined);
    setRequestError(null);
    setInput('');
    setIsTyping(false);
    setSubmittingId(null);
    chatPending.current = false;
    actionPending.current = false;
  }, [scope]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // 打开时自动聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value || chatPending.current) return;
    const requestScope = scope;
    chatPending.current = true;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: value,
      time: formatTime(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);
    setRequestError(null);

    // UI -> business API -> AI service. Failed requests never manufacture business answers.
    try {
        if (!apiContext) throw new Error('请登录后使用 AI 助手');
        const response = await aiApi.chat(apiContext, {
          conversationId,
          message: value,
          domain: activeDomain,
        });
        if (scopeRef.current !== requestScope) return;
        if (!response?.conversation?.id || !response.assistantMessage?.id
          || typeof response.assistantMessage.content !== 'string' || !response.assistantMessage.content.trim()) {
          throw new Error('AI 服务未返回有效回答');
        }
        const actionData = response.actionPlan ?? response.assistantMessage.actionPlan;
        setConversationId(response.conversation.id);
        const assistantMessage: ChatMessage = {
          id: response.assistantMessage.id,
          role: 'assistant',
          text: response.assistantMessage.content,
          time: formatTime(),
          actionData,
          action: actionData ? {
            id: response.assistantMessage.id,
            title: actionData.title,
            scope: actionData.impactScope,
            basis: (actionData.dataEvidence ?? []).map(e => `${e.label}: ${e.value}`).join(' / '),
            approval: actionData.approvalPath,
            risk: actionData.riskLevel === 'critical' ? 'high' : actionData.riskLevel,
            status: 'draft',
          } : undefined,
        };
        setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      if (scopeRef.current === requestScope) {
        setRequestError({ message: error instanceof Error ? error.message : 'AI 服务暂不可用', retryText: value });
      }
    } finally {
      if (scopeRef.current === requestScope) {
        chatPending.current = false;
        setIsTyping(false);
      }
    }
  }, [input, scope, apiContext, conversationId, activeDomain]);

  const handleSubmitAction = useCallback(async (messageId: string) => {
    if (actionPending.current) return;
    const requestScope = scope;
    actionPending.current = true;
    setSubmittingId(messageId);
    setRequestError(null);
    try {
        const msg = messages.find(m => m.id === messageId);
        if (!apiContext || !conversationId || !msg?.action || !msg.actionData) throw new Error('缺少正式行动方案，未提交');
        if (msg.action.status === 'submitted') return;
        const response = await aiApi.submitActionPlan(apiContext, {
            messageId,
            conversationId,
            actionPlan: msg.actionData,
          });
        if (scopeRef.current !== requestScope) return;
        if (!response?.actionPlan?.id || response.actionPlan.status !== 'submitted') throw new Error('未收到审批提交确认');
        const updatedAction = { ...msg.action, status: 'submitted' as const };
        setMessages(prev => prev.map(item => item.id === messageId ? { ...item, action: updatedAction } : item));
        onActionSubmit?.(updatedAction);
    } catch (error) {
      if (scopeRef.current === requestScope) setRequestError({ message: error instanceof Error ? error.message : '审批提交失败，草稿已保留' });
    } finally {
      if (scopeRef.current === requestScope) {
        actionPending.current = false;
        setSubmittingId(null);
      }
    }
  }, [onActionSubmit, scope, apiContext, conversationId, messages]);

  const toggleBasis = useCallback((messageId: string) => {
    setExpandedBasis(prev => prev === messageId ? null : messageId);
  }, []);

  const copyMessage = useCallback((messageId: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(messageId);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  }, []);

  const handleImportComplete = useCallback((summary: string) => {
    const importMessage: ChatMessage = {
      id: `import-${Date.now()}`,
      role: 'assistant',
      text: summary,
      time: formatTime(),
    };
    setMessages(prev => [...prev, importMessage]);
  }, []);

  // 获取当前要展示的域列表
  const visibleDomains = defaultDomainCategories.filter(d => d.id === activeDomain);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[130] flex justify-end pointer-events-none">
      <div className="relative h-full bg-white border-l-4 border-blue-600 shadow-2xl pointer-events-auto flex flex-col animate-in slide-in-from-right duration-200 w-[520px] max-w-[100vw] md:max-w-[min(920px,calc(100vw-280px))]">
        {/* 顶部标题栏 */}
        <div className="h-[72px] bg-blue-600 text-white px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center">
              <Bot size={20} />
            </div>
            <div>
              <div className="text-[16px] font-bold">AI 工业助手</div>
              <div className="text-[12px] text-blue-100 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isTyping ? 'bg-amber-300 animate-pulse' : 'bg-emerald-300 animate-pulse'}`}></span>
                {tenantCode} · {roleName} · {isTyping ? '正在分析...' : '权限内分析'}
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭 AI 助手"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* 对话内容区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar bg-[#FBFCFF] p-5">
          {requestError && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[13px] text-rose-700">
            {requestError.message}
            {requestError.retryText && <button onClick={() => sendMessage(requestError.retryText)} disabled={isTyping} className="ml-3 font-bold underline">重试</button>}
          </div>}
          <div className="space-y-5">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              return (
                <div key={message.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {!isUser && (
                    <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Bot size={15} />
                    </div>
                  )}
                  <div className={`max-w-[88%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                    <div className={`px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm ${
                      isUser
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-100 text-slate-700 rounded-tl-sm'
                    }`}>
                      {message.text}
                    </div>

                    {/* 复制按钮 - 仅AI消息 */}
                    {!isUser && (
                      <button
                        onClick={() => copyMessage(message.id, message.text)}
                        className="mt-1 flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        {copiedId === message.id ? (
                          <><CheckCircle2 size={11} /> 已复制</>
                        ) : (
                          <><Copy size={11} /> 复制</>
                        )}
                      </button>
                    )}

                    {/* 操作确认卡片 */}
                    {message.action && (
                      <div className="mt-2.5 w-full bg-[#10263f] text-blue-50 rounded-xl border border-[#1d3b5c] overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-blue-100/10 flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-black tracking-[0.12em] text-amber-300">AI ACTION PLAN</div>
                            <div className="mt-1 text-[14px] font-black text-white">{message.action.title}</div>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold whitespace-nowrap ${
                            message.action.risk === 'high' ? 'bg-rose-500/20 text-rose-200'
                            : message.action.risk === 'medium' ? 'bg-amber-300/15 text-amber-200'
                            : 'bg-emerald-400/15 text-emerald-200'
                          }`}>
                            {message.action.risk === 'high' ? '高风险' : message.action.risk === 'medium' ? '中风险' : '低风险'}
                          </span>
                        </div>

                        <div className="px-4 py-3 space-y-2 text-[11px] leading-relaxed">
                          <div>
                            <span className="text-blue-100/55">影响范围：</span>
                            <span className="text-blue-50">{message.action.scope}</span>
                          </div>
                          <div>
                            <span className="text-blue-100/55">审批路径：</span>
                            <span className="text-blue-50">{message.action.approval}</span>
                          </div>
                        </div>

                        {/* 可折叠的数据依据 */}
                        <div className="border-t border-blue-100/10">
                          <button
                            onClick={() => toggleBasis(message.id)}
                            className="w-full px-4 py-2.5 flex items-center justify-between text-[11px] text-blue-100/70 hover:bg-blue-100/5 transition-colors"
                          >
                            <span>数据依据</span>
                            {expandedBasis === message.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                          {expandedBasis === message.id && (
                            <div className="px-4 pb-3 text-[11px] leading-relaxed text-blue-50 bg-blue-500/5">
                              {message.action.basis}
                            </div>
                          )}
                        </div>

                        <div className="px-4 pb-4 flex gap-2">
                          {message.action.status === 'submitted' ? (
                            <div className="h-9 w-full rounded-lg bg-emerald-400/15 text-emerald-200 flex items-center justify-center gap-2 text-[11px] font-bold">
                              <CheckCircle2 size={14} /> 已提交审批，等待授权执行
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => toggleBasis(message.id)}
                                className="h-9 flex-1 rounded-lg bg-blue-50/10 hover:bg-blue-50/15 text-blue-100 text-[11px] font-bold transition-colors"
                              >
                                查看依据
                              </button>
                              <button
                                onClick={() => handleSubmitAction(message.id)}
                                disabled={Boolean(submittingId)}
                                className="h-9 flex-1 rounded-lg bg-amber-300 hover:bg-amber-200 text-[#10263f] text-[11px] font-black transition-colors disabled:opacity-50"
                              >
                                {submittingId === message.id ? '提交中...' : '提交审批'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="text-[11px] text-slate-400 mt-1.5">{message.time}</div>
                  </div>
                </div>
              );
            })}

            {/* 打字指示器 */}
            {isTyping && (
              <div className="flex gap-3 justify-start animate-in fade-in duration-200">
                <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Bot size={15} />
                </div>
                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部输入区 */}
        <div className="border-t border-slate-100 bg-white shrink-0">
          {/* 域分类标签 */}
          <div
            role="group"
            aria-label="助手业务域"
            className="px-5 pt-3 pb-1.5 flex items-center gap-1.5 flex-wrap"
          >
            {defaultDomainCategories.map(cat => (
              <button
                key={cat.id}
                type="button"
                aria-pressed={activeDomain === cat.id}
                onClick={() => setActiveDomain(cat.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${
                  activeDomain === cat.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 能力展示区 */}
          <div
            role="group"
            aria-label={`${visibleDomains[0]?.label ?? '助手'}快捷提问`}
            className="px-5 pb-2 max-h-[120px] overflow-y-auto custom-scrollbar"
          >
            {visibleDomains.map(domain => (
              <div key={domain.id} className="mb-1.5">
                {domain.features.map(feature => (
                  <button
                    key={feature}
                    type="button"
                    aria-label={`发送快捷提问：${feature}`}
                    onClick={() => sendMessage(feature)}
                    disabled={isTyping}
                    className="inline-block mr-1.5 mb-1 px-2.5 py-1 rounded-full bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-100 text-[11px] font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {feature}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* 输入框 */}
          <div className="p-4 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) setImportFile(selected);
                e.target.value = '';
              }}
            />
            {hasImportPermission && (
              <button
                type="button"
                aria-label="上传主数据文件"
                onClick={() => fileInputRef.current?.click()}
                className="w-11 h-11 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 flex items-center justify-center transition-colors border border-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <UploadCloud size={18} />
              </button>
            )}
            <div className="flex-1 h-11 border border-slate-200 bg-slate-50 rounded-xl px-4 flex items-center focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                aria-label="向 AI 助手提问"
                placeholder="输入问题，回车发送..."
                className="w-full bg-transparent outline-none focus-visible:outline-none text-[13px] text-slate-700"
              />
            </div>
            <button
              type="button"
              aria-label="发送问题"
              onClick={() => sendMessage()}
              disabled={isTyping || !input.trim()}
              className="w-11 h-11 rounded-xl bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
        {importFile && (
          <div className="absolute inset-x-4 bottom-[72px] z-10">
            <DataImportPanel
              file={importFile}
              apiContext={apiContext ?? null}
              allowedEntities={allowedImportEntities}
              onClose={() => setImportFile(null)}
              onComplete={handleImportComplete}
            />
          </div>
        )}
      </div>
    </div>
  );
};
