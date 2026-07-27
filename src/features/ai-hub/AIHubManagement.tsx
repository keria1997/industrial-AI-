import { useState } from 'react';
import {
  Sparkles, MessageCircle, UserCheck, Bot, Database, ShieldCheck,
  Activity, Settings, Cpu, BarChart3, Users,
} from 'lucide-react';
import {
  type AssistantSkill, type DigitalEmployee,
  defaultConfigCards, defaultSkills, defaultKnowledgeSources,
  defaultBasicSettings, defaultGatewayItems, defaultModelProviders,
  defaultDigitalEmployees, defaultAuditMetrics, defaultAuditLogs,
  toneMap, auditStatusMap,
} from './types';

type Props = {
  onOpenAssistant: () => void;
};

type TabId = 'copilot' | 'employee' | 'audit';

export const AIHubManagement = ({ onOpenAssistant }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('copilot');
  const [skills, setSkills] = useState<AssistantSkill[]>(defaultSkills);
  const [selectedEmployee, setSelectedEmployee] = useState<DigitalEmployee>(defaultDigitalEmployees[1]);

  const toggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const configCards = defaultConfigCards.map(card => {
    const iconMap: Record<string, typeof Bot> = {
      '助手身份': Bot,
      '知识范围': Database,
      '执行权限': ShieldCheck,
      '响应模式': Activity,
    };
    return { ...card, icon: iconMap[card.title] || Bot };
  });

  const enabledSkillCount = skills.filter(s => s.enabled).length;
  const employeeSkillLabels = (employee: DigitalEmployee) => {
    return employee.skills
      .map(sid => defaultSkills.find(s => s.id === sid))
      .filter(Boolean)
      .map(s => s!.label);
  };

  const employeeKnowledgeLabels = (employee: DigitalEmployee) => {
    return employee.knowledgeSources
      .map(kid => defaultKnowledgeSources.find(k => k.id === kid))
      .filter(Boolean)
      .map(k => k!.name);
  };

  return (
    <div className="w-full h-full font-sans flex flex-col">
      <main className="px-8 py-8 max-w-[1600px] mx-auto w-full flex-1 flex flex-col overflow-hidden">
        {/* 标题区 */}
        <div className="flex justify-between items-start mb-6 shrink-0">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center rounded-2xl mr-4 shadow-md">
              <Sparkles size={24} />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-[20px] font-bold text-slate-800 leading-tight tracking-wide">AI 智能中枢</h1>
              <div className="text-[13px] text-slate-500 mt-1 font-medium">工业 Copilot 助手与开发 AI 助手一体化管理平台</div>
            </div>
          </div>
        </div>

        {/* 标签切换 */}
        <div className="bg-white border border-slate-200 rounded-xl inline-flex p-1.5 shadow-sm mb-6 shrink-0 w-max relative z-10">
          <button
            onClick={() => setActiveTab('copilot')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'copilot' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
          >
            <MessageCircle size={15} className="mr-1.5" /> 工业 Copilot 助手
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
          <button
            onClick={() => setActiveTab('employee')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'employee' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
          >
            <UserCheck size={15} className="mr-1.5" /> AI 数字员工专员
          </button>
          <div className="w-px h-5 bg-slate-200 mx-1 self-center"></div>
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center px-5 py-2.5 rounded-lg text-[13px] font-bold transition-all duration-200 ${activeTab === 'audit' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50'}`}
          >
            <BarChart3 size={15} className="mr-1.5" /> 审计与监控
          </button>
        </div>

        <div className="w-full flex-1 overflow-y-auto custom-scrollbar pr-2 pb-6">
          {activeTab === 'copilot' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 核心功能卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                {configCards.map(item => {
                  const Icon = item.icon;
                  const tone = toneMap[item.tone] || toneMap.blue;
                  return (
                    <div key={item.title} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-blue-200 transition-colors">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${tone.shell}`}>
                          <Icon size={20} />
                        </div>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">已启用</span>
                      </div>
                      <div className="text-[12px] font-bold text-slate-400 mb-1">{item.title}</div>
                      <div className="text-[16px] font-bold text-slate-800 mb-2">{item.value}</div>
                      <div className="text-[12px] text-slate-500 leading-relaxed">{item.desc}</div>
                    </div>
                  );
                })}
              </div>

              {/* 双栏配置区 */}
              <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
                {/* 左栏：工业助手配置 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2">
                      <Settings className="w-4.5 h-4.5 text-blue-600" /> 工业助手配置
                    </h4>
                    <button
                      onClick={onOpenAssistant}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-[13px] font-bold shadow-sm flex items-center"
                    >
                      <MessageCircle size={15} className="mr-1.5" /> 打开助手
                    </button>
                  </div>
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* 基础设定 */}
                    <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                      <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                        <Bot size={15} className="text-blue-600" /> 助手基础设定
                      </div>
                      <div className="space-y-3">
                        {defaultBasicSettings.map(({ label, value }) => (
                          <div key={label} className="flex items-start justify-between gap-4 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                            <span className="text-[12px] text-slate-500 font-bold shrink-0">{label}</span>
                            <span className="text-[12px] text-slate-800 font-bold text-right leading-relaxed">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 可调用能力 */}
                    <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                      <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                        <Activity size={15} className="text-blue-600" /> 可调用能力
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {skills.map(skill => (
                          <button
                            key={skill.id}
                            onClick={() => toggleSkill(skill.id)}
                            className={`px-3 py-1.5 rounded-lg text-[12px] font-bold border transition-all ${
                              skill.enabled
                                ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
                                : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            {skill.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-3 text-[11px] text-slate-400">
                        已启用 {enabledSkillCount} / {skills.length} 项能力
                      </div>
                    </div>
                  </div>
                </div>

                {/* 右栏：知识库与数据源 */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                    <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2">
                      <Database className="w-4.5 h-4.5 text-blue-600" /> 知识库与数据源
                    </h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {defaultKnowledgeSources.map(source => (
                      <div key={source.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-bold text-slate-800 truncate">{source.name}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">可检索 {source.rows} 条 · {source.lastSync}</div>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ml-3 ${
                          source.status === 'realtime'
                            ? 'bg-blue-50 border-blue-200 text-blue-600'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-600'
                        }`}>
                          {source.status === 'realtime' ? '实时' : '已同步'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 模型网关配置 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                  <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2">
                    <Cpu className="w-4.5 h-4.5 text-blue-600" /> 模型网关配置
                  </h4>
                </div>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
                  {/* 模型提供商 */}
                  <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                    <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                      <Cpu size={15} className="text-blue-600" /> LLM 提供商
                    </div>
                    <div className="space-y-2">
                      {defaultModelProviders.map(provider => (
                        <div key={provider.id} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                          <div>
                            <div className="text-[12px] font-bold text-slate-800">{provider.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{provider.model}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-400 font-mono">{provider.apiKeyMasked}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              provider.status === 'active'
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                              {provider.status === 'active' ? '主模型' : '备用'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 网关参数 */}
                  <div className="border border-slate-100 bg-slate-50 rounded-xl p-4">
                    <div className="font-bold text-[13px] text-slate-800 mb-3 flex items-center gap-2">
                      <Settings size={15} className="text-blue-600" /> 网关参数
                    </div>
                    <div className="space-y-2">
                      {defaultGatewayItems.map(({ label, value, desc }) => (
                        <div key={label} className="flex items-start justify-between gap-4 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                          <div className="shrink-0">
                            <div className="text-[12px] text-slate-500 font-bold">{label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{desc}</div>
                          </div>
                          <span className="text-[12px] text-slate-800 font-bold text-right">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'employee' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 数字员工卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {defaultDigitalEmployees.map(emp => {
                  const tone = toneMap[emp.tone] || toneMap.blue;
                  const isSelected = selectedEmployee.id === emp.id;
                  return (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`bg-white rounded-2xl border-2 shadow-sm p-5 text-left transition-all hover:border-blue-300 ${isSelected ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'}`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${tone.shell}`}>
                          <UserCheck size={20} />
                        </div>
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
                          {emp.enabled ? '已启用' : '已禁用'}
                        </span>
                      </div>
                      <div className="text-[14px] font-bold text-slate-800">{emp.name}</div>
                      <div className="text-[12px] text-slate-500 mt-0.5">绑定角色：{emp.role}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {employeeSkillLabels(emp).map(label => (
                          <span key={label} className={`text-[10px] px-1.5 py-0.5 rounded ${tone.shell}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* 数字员工配置详情 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2">
                    <Users className="w-4.5 h-4.5 text-blue-600" /> 数字员工配置详情 · {selectedEmployee.name}
                  </h4>
                  <button className="text-[12px] text-blue-600 font-bold hover:text-blue-700">编辑配置</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* 基本配置 */}
                  <div className="space-y-2">
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      <span className="text-[12px] text-slate-400 font-bold">数字员工名称</span>
                      <span className="text-[12px] text-slate-700 font-bold">{selectedEmployee.name}</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      <span className="text-[12px] text-slate-400 font-bold">绑定角色</span>
                      <span className="text-[12px] text-slate-700 font-bold">{selectedEmployee.role}</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      <span className="text-[12px] text-slate-400 font-bold">操作权限</span>
                      <span className="text-[12px] text-slate-700 font-bold">{selectedEmployee.operationPermission}</span>
                    </div>
                    <div className="flex justify-between bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                      <span className="text-[12px] text-slate-400 font-bold">回复风格</span>
                      <span className="text-[12px] text-slate-700 font-bold text-right">{selectedEmployee.responseStyle}</span>
                    </div>
                  </div>

                  {/* 技能与知识范围 */}
                  <div className="space-y-3">
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="text-[11px] font-bold text-slate-400 mb-2">技能范围</div>
                      <div className="flex flex-wrap gap-1.5">
                        {employeeSkillLabels(selectedEmployee).map(label => {
                          const skill = defaultSkills.find(s => s.label === label);
                          const isEnabled = skill?.enabled ?? false;
                          return (
                            <span key={label} className={`text-[11px] px-2 py-1 rounded-lg border font-bold ${
                              isEnabled
                                ? 'bg-blue-50 border-blue-200 text-blue-600'
                                : 'bg-slate-50 border-slate-200 text-slate-400'
                            }`}>
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                      <div className="text-[11px] font-bold text-slate-400 mb-2">知识范围</div>
                      <div className="flex flex-wrap gap-1.5">
                        {employeeKnowledgeLabels(selectedEmployee).map(label => (
                          <span key={label} className="text-[11px] bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-lg font-bold">
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              {/* 审计指标卡片 */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="text-[11px] font-bold text-slate-400">今日对话</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">{defaultAuditMetrics.todayConversations.toLocaleString()}</div>
                  <div className="text-[11px] text-emerald-600 mt-0.5 font-bold">{defaultAuditMetrics.conversationTrend} vs 昨日</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="text-[11px] font-bold text-slate-400">操作提交</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">{defaultAuditMetrics.todayOperations}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{defaultAuditMetrics.approvedCount} 已审批 · {defaultAuditMetrics.pendingCount} 待审</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="text-[11px] font-bold text-slate-400">平均响应</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">
                    {defaultAuditMetrics.avgResponseTime}
                    <span className="text-[14px] text-slate-400 ml-1">s</span>
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5 font-bold">{defaultAuditMetrics.responseTimeTrend} vs 昨日</div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                  <div className="text-[11px] font-bold text-slate-400">降级触发</div>
                  <div className="text-[24px] font-black text-slate-800 mt-1">{defaultAuditMetrics.degradationCount}</div>
                  <div className="text-[11px] text-amber-600 mt-0.5 font-bold">{defaultAuditMetrics.degradationDetail}</div>
                </div>
              </div>

              {/* 审计日志表 */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                  <h4 className="font-bold text-[15px] text-slate-800 flex items-center gap-2">
                    <BarChart3 className="w-4.5 h-4.5 text-blue-600" /> 最近操作审计
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="text-left py-2.5 px-6 font-bold text-slate-500">时间</th>
                        <th className="text-left py-2.5 px-6 font-bold text-slate-500">用户</th>
                        <th className="text-left py-2.5 px-6 font-bold text-slate-500">操作</th>
                        <th className="text-left py-2.5 px-6 font-bold text-slate-500">金额</th>
                        <th className="text-left py-2.5 px-6 font-bold text-slate-500">状态</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {defaultAuditLogs.map(log => {
                        const statusInfo = auditStatusMap[log.status];
                        return (
                          <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-6 text-slate-500">{log.time}</td>
                            <td className="py-2.5 px-6 text-slate-700 font-bold">{log.user}</td>
                            <td className="py-2.5 px-6 text-slate-600">{log.action}</td>
                            <td className="py-2.5 px-6 text-slate-600">{log.amount || '—'}</td>
                            <td className="py-2.5 px-6">
                              <span className={statusInfo.className}>{statusInfo.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
