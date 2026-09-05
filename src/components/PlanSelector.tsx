'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useData } from '../context/DataContext';

export default function PlanSelector() {
  // O rótulo vem de `plan.name`. Na v1 vinha do nome do arquivo, que era a
  // própria chave do plano; com o id em uuid, a chave não é mais legível.
  const { selectedPlanId, setSelectedPlanId, studyPlans, selectedPlan } = useData();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="bg-white dark:bg-gray-800 border border-gold-500 dark:border-gold-600 rounded-full py-2 px-4 text-gold-500 dark:text-gold-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-md text-base font-medium appearance-none pr-8 w-full flex justify-between items-center"
      >
        <span className="block truncate">
          {selectedPlan ? selectedPlan.name.toUpperCase() : 'Selecione o Plano'}
        </span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
          <svg className="h-5 w-5 text-gray-400 dark:text-gray-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M10 3a.75.75 0 01.53.22l3.5 3.5a.75.75 0 01-1.06 1.06L10 4.81 6.53 8.28a.75.75 0 01-1.06-1.06l3.5-3.5A.75.75 0 0110 3zm-3.72 9.53a.75.75 0 011.06 0L10 15.19l2.67-2.66a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
        </span>
      </button>
      {isDropdownOpen && (
        <div className="absolute z-20 bottom-full mb-2 w-full bg-white dark:bg-gray-800 shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {studyPlans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => {
                setSelectedPlanId(plan.id);
                setIsDropdownOpen(false);
              }}
              className="text-gray-900 dark:text-gray-100 cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gold-100 dark:hover:bg-gray-700 flex items-center justify-between"
            >
              <span className="block whitespace-normal">
                {plan.name.toUpperCase()}
                {plan.id === selectedPlanId && <span className="ml-2 text-gold-500 dark:text-gold-400 font-semibold">(Ativo)</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      </div>
  );
}
