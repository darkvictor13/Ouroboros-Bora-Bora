'use client';

import React from 'react';
import { AuthProvider } from '@/context/AuthContext';
import { DonationModalProvider } from '@/context/DonationModalContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DonationModalProvider>{children}</DonationModalProvider>
    </AuthProvider>
  );
}
