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
        {activeModule === '工作台'
          ? <WorkbenchPage role={role} userName={userName} />
          : <ModulePage moduleId={activeModule} />}
      </AppShell>
      <AiAssistantDrawer open={aiOpen} onClose={() => setAiOpen(false)} />
    </>
  );
}
