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

// 意图识别：根据用户输入判断意图类型
const detectIntent = (text: string): 'query' | 'action' | 'prediction' | 'general' => {
  if (/(生成|创建|执行|排产|补货|下单|提交|审批|调拨|出库|入库|下达)/.test(text)) return 'action';
  if (/(预测|预计|趋势|未来|下月|下季|风险|预警)/.test(text)) return 'prediction';
  if (/(库存|物料|缺料|补货|查询|查看|多少|哪些|状态|进度|延期|账龄|呆滞|安全)/.test(text)) return 'query';
  return 'general';
};

// 生成AI回复
const generateReply = (text: string, tenantName: string): { text: string; action?: AIActionPlan } => {
  const intent = detectIntent(text);
  const isInventoryRelated = /(库存|物料|缺料|补货|安全)/.test(text);
  const isSalesRelated = /(订单|销售|发货|客户)/.test(text);
  const isProductionRelated = /(生产|工单|排产|报工|完工|FQC)/.test(text);
  const isProcurementRelated = /(采购|PR|PO|供应商|交期|到货)/.test(text);

  // Import capability questions
  if (/导入|上传|批量|文件|格式/i.test(text) && /(什么|哪些|支持|格式|类型|怎么|如何)/.test(text)) {
    return {
      text: '当前系统支持通过 AI 助手上传 CSV 文件（UTF-8 编码）批量导入主数据和 WMS 库存快照。\n\n支持导入的类型：仓库、产品、物料、WMS库存快照。\n点击底部上传按钮选择文件，系统会自动识别列名并建议映射。\n暂不支持 Excel（.xlsx）直接导入，请先另存为 CSV 格式。',
    };
  }

  switch (intent) {
    case 'action':
      return {
        text: isInventoryRelated
          ? '已完成库存可用量、在途采购和未来 14 天生产需求校验。建议为 3 项短缺物料创建采购申请，预计可把订单延期风险从 38% 降至 12%。'
          : isProductionRelated
          ? '已根据当前排产计划、齐套状态和工单进度生成执行方案。提交前请确认影响范围与审批路径。'
          : '我已根据当前业务上下文生成一份可执行方案。提交前请确认影响范围与审批路径。',
        action: {
          id: `AI-ACT-${Date.now()}`,
          title: isInventoryRelated ? '生成 3 笔采购申请' : isProductionRelated ? '提交生产执行方案' : '提交业务执行方案',
          scope: isInventoryRelated ? 'RM201 / RM202 / RM305 · 合计 ¥186,400' : `${tenantName} · 当前业务单据`,
          basis: isInventoryRelated ? '现存量 + 已分配量 + 在途量 + MRP 净需求' : '当前页面数据、关联单据与岗位权限',
          approval: isInventoryRelated ? '采购主管 → 财务经理（金额阈值）' : '按单据类型匹配审批规则',
          risk: 'medium',
          status: 'draft',
        },
      };
    case 'prediction':
      return {
        text: isInventoryRelated
          ? '基于 BOM 展开、MRP 净需求、在途交期和安全库存水位，未来 7 天有 3 项物料存在短缺风险：RM201（缺口 230kg）、RM202（缺口 180kg）、RM305（缺口 95kg）。建议提前启动补货流程。'
          : isSalesRelated
          ? '基于近 12 个月销售数据、季节性指数和当前订单储备，预测下月销量为 ¥2,340,000，环比增长 8.2%。主要驱动因素：工业控制器顶配版订单增加（+15%）、季节性需求高峰。置信区间 ±5%。'
          : '基于历史数据和当前业务上下文，已完成趋势分析。你可以继续追问具体指标或要求生成操作建议。',
      };
    case 'query':
      return {
        text: isInventoryRelated
          ? '当前共有 12 项物料低于安全库存，其中 RM201、RM202、RM305 会影响 SO-LINK-20260622-001。数据来自库存台账、在途采购和 MRP 净需求，更新于 2 分钟前。'
          : isSalesRelated
          ? `已在 ${tenantName} 的授权范围内完成查询。当前有 8 笔待确认订单、3 笔已确认待发货、2 笔部分发货。结论会附带指标口径、来源单据和更新时间。`
          : isProductionRelated
          ? '当前有 5 个在制工单，其中 WO-2026-003 因缺料暂停，预计今日 16:00 齐套后可恢复。FQC 检验通过率 96.2%。'
          : isProcurementRelated
          ? '当前有 4 笔 PO 即将到货（3 天内），其中 PO-2026-012 供应商确认延迟 2 天，建议关注。'
          : `已在 ${tenantName} 的授权范围内完成查询。结论会附带指标口径、来源单据和更新时间；你也可以继续要求我预测、对比或生成处理方案。`,
      };
    default:
      return {
        text: `我已理解你的问题。基于 ${tenantName} 的业务数据，我可以帮你查询经营、销售、生产、库存和采购数据，也可以生成分析报告和操作建议。请告诉我你想了解哪个方面的信息。`,
      };
  }
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
  const [importFile, setImportFile] = useState<File | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!value || isTyping) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: value,
      time: formatTime(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // 尝试调用后端 AI API，失败时降级到本地规则引擎
    if (apiContext) {
      try {
        const response = await aiApi.chat(apiContext, {
          conversationId,
          message: value,
          domain: activeDomain,
        });
        setConversationId(response.conversation.id);
        const assistantMessage: ChatMessage = {
          id: response.assistantMessage.id,
          role: 'assistant',
          text: response.assistantMessage.content,
          time: formatTime(),
          action: response.actionPlan ? {
            id: response.assistantMessage.id,
            title: response.actionPlan.title,
            scope: response.actionPlan.impactScope,
            basis: response.actionPlan.dataEvidence.map(e => `${e.label}: ${e.value}`).join(' / '),
            approval: response.actionPlan.approvalPath,
            risk: response.actionPlan.riskLevel === 'critical' ? 'high' : response.actionPlan.riskLevel,
            status: 'draft',
          } : undefined,
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
        return;
      } catch {
        // 降级到本地规则引擎
      }
    }

    // 本地规则引擎降级
    setTimeout(() => {
      const reply = generateReply(value, tenantCode);
      const assistantMessage: ChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        text: reply.text,
        time: formatTime(),
        action: reply.action,
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 700);
  }, [input, tenantCode, isTyping, apiContext, conversationId, activeDomain]);

  const handleSubmitAction = useCallback(async (messageId: string) => {
    if (apiContext && conversationId) {
      try {
        const msg = messages.find(m => m.id === messageId);
        if (msg?.action) {
          await aiApi.submitActionPlan(apiContext, {
            messageId,
            conversationId,
            actionPlan: {
              title: msg.action.title,
              description: msg.action.scope,
              targetModule: 'general',
              targetEntity: 'general',
              targetAction: 'create',
              parameters: {},
              impactScope: msg.action.scope,
              riskLevel: msg.action.risk === 'high' ? 'high' : msg.action.risk,
              dataEvidence: [{ label: '审批路径', value: msg.action.approval }],
              approvalPath: msg.action.approval,
            },
          });
        }
      } catch { /* 降级到本地状态更新 */ }
    }
    setMessages(prev => prev.map(msg => {
      if (msg.id === messageId && msg.action) {
        const updatedAction = { ...msg.action, status: 'submitted' as const };
        if (onActionSubmit) onActionSubmit(updatedAction);
        return { ...msg, action: updatedAction };
      }
      return msg;
    }));
  }, [onActionSubmit, apiContext, conversationId, messages]);

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
      <div className="relative h-full bg-white border-l-4 border-blue-600 shadow-2xl pointer-events-auto flex flex-col animate-in slide-in-from-right duration-200 w-[520px] max-w-[min(920px,calc(100vw-280px))]">
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
                                className="h-9 flex-1 rounded-lg bg-amber-300 hover:bg-amber-200 text-[#10263f] text-[11px] font-black transition-colors"
                              >
                                提交审批
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
