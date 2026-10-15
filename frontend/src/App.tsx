/**
 * 根组件
 *
 * 管理登录状态、当前模块、AI 抽屉开关。
 * 调用链路: main.tsx -> App -> LoginPage / AppShell -> (WorkbenchPage | ModulePage) + AiAssistantDrawer
 */

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from './app/AppShell';
import { resolveModule } from './app/routing';
import type { RoleName } from './app/moduleRegistry';
import { LoginPage } from './pages/LoginPage';
import { WorkbenchPage } from './pages/WorkbenchPage';
import { ModulePage } from './pages/ModulePage';
import { SalesPage } from './pages/modules/SalesPage';
import { InventoryPage } from './pages/modules/InventoryPage';
import { ProductionPage } from './pages/modules/ProductionPage';
import { ProcurementPage } from './pages/modules/ProcurementPage';
import { FinancePage } from './pages/modules/FinancePage';
import {
  PersonnelPage, SupplyChainPage, AiHubPage, AnalyticsPage,
  MessagesPage, PlatformPage, FeedbackPage,
} from './pages/modules/AuxiliaryPages';
import { AiAssistantDrawer } from './components/AiAssistantDrawer';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [activeModule, setActiveModule] = useState<string>(() => resolveModule(window.location.search));
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem('token');
    const name = sessionStorage.getItem('userName');
    if (token && name) {
      setIsLoggedIn(true);
      setUserName(name);
    }
  }, []);

  const handleNavigate = useCallback((moduleId: string) => {
    const params = new URLSearchParams();
    if (moduleId !== 'workbench') params.set('module', moduleId);
    window.history.pushState(null, '', params.toString() ? `/?${params}` : '/');
    setActiveModule(moduleId === 'workbench' ? '工作台' : moduleId);
  }, []);

  useEffect(() => {
    const onPop = () => setActiveModule(resolveModule(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleLogin = (name: string) => {
    setIsLoggedIn(true);
    setUserName(name);
  };

  const handleLogout = () => {
    sessionStorage.clear();
    setIsLoggedIn(false);
    setUserName('');
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // 开发阶段默认角色：后续从后端会话接口获取
  const role: RoleName = '超级管理员';

  return (
    <>
      <AppShell
        role={role}
        userName={userName}
        activeModule={activeModule}
        onNavigate={handleNavigate}
        onOpenAi={() => setAiOpen(true)}
        onLogout={handleLogout}
      >
        {activeModule === '工作台' && <WorkbenchPage role={role} userName={userName} />}
        {activeModule === '销售管理' && <SalesPage />}
        {activeModule === '库存管理' && <InventoryPage />}
        {activeModule === '生产管理' && <ProductionPage />}
        {activeModule === '采购管理' && <ProcurementPage />}
        {activeModule === '财务管理' && <FinancePage />}
        {activeModule === '人员管理' && <PersonnelPage />}
        {activeModule === '产业链管理' && <SupplyChainPage />}
        {activeModule === 'AI智能中枢' && <AiHubPage />}
        {activeModule === 'AI数据分析' && <AnalyticsPage />}
        {activeModule === '消息管理' && <MessagesPage />}
        {activeModule === '平台管理' && <PlatformPage />}
        {activeModule === '问题反馈' && <FeedbackPage />}
        {!['工作台','销售管理','库存管理','生产管理','采购管理','财务管理','人员管理','产业链管理','AI智能中枢','AI数据分析','消息管理','平台管理','问题反馈'].includes(activeModule) && <ModulePage moduleId={activeModule} />}
      </AppShell>
      <AiAssistantDrawer open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
