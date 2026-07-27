import React from 'react';
import ApplicationModules from '../App';
import { AppRuntimeProvider } from './AppRuntimeProvider';

export default function App() {
  return (
    <AppRuntimeProvider>
      <ApplicationModules />
    </AppRuntimeProvider>
  );
}
