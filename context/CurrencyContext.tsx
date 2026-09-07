'use client'
import React, { createContext, useContext } from 'react';
import useCurrencyConverter from '@/hooks/useCurrencyConverter';

const CurrencyContext = createContext<any>(null);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const currencyConverter = useCurrencyConverter();

  return (
    <CurrencyContext.Provider value={currencyConverter}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}; 