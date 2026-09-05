'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * `warning` e `info` já eram usados pelo app desde a v1; o tipo só listava
 * `success` e `error` porque o compilador estava silenciado.
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface NotificationContextType {
  showNotification: (message: string, type: NotificationType) => void;
}

const NOTIFICATION_COLORS: Record<NotificationType, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  warning: 'bg-warning',
  info: 'bg-brand-500',
};

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const [notification, setNotification] = useState<{ message: string; type: NotificationType } | null>(null);

  const showNotification = useCallback((message: string, type: NotificationType) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000); // Notificação desaparece após 3 segundos
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <div className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg text-white z-50 transition-opacity duration-300 ease-out opacity-100
          ${NOTIFICATION_COLORS[notification.type]}`}>
          {notification.message}
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
