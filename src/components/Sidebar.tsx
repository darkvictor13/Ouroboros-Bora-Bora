'use client';

import React from 'react';
import { useSidebar } from '../context/SidebarContext';
import { FaHome, FaClipboardList, FaBook, FaFileAlt, FaDatabase, FaRedoAlt, FaHistory, FaChartBar, FaCalendarAlt, FaGraduationCap } from 'react-icons/fa';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BsList } from 'react-icons/bs';
import ThemeToggleButton from './ThemeToggleButton';
import PlanSelector from './PlanSelector';
import { useAuth } from '../context/AuthContext';
import { FaSignOutAlt } from 'react-icons/fa';

const Sidebar = () => {
  const { isSidebarExpanded, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const { status, username, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div
      className={`fixed inset-y-0 left-0 transform ${isSidebarExpanded ? 'translate-x-0' : '-translate-x-full'}
      bg-brand-500 text-white w-72 p-4 transition-transform duration-300 ease-in-out z-50 flex flex-col dark:bg-gray-800 dark:text-gray-100`}>
      
      <div className="flex-grow">
        {/* Sidebar Header */}
        <div className="flex items-center">
          <button onClick={toggleSidebar} className="text-white p-2 rounded-md hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-white dark:hover:bg-gray-700 dark:focus:ring-gray-500">
            <BsList size={24} />
          </button>
          <div className="flex-grow flex items-center justify-center gap-3">
            <img src="/logo-be.png" alt="Bora Estudar Concursos" className="h-14 w-auto rounded-xl" />
            <div className="font-mono leading-tight">
              <div className="text-sm font-bold tracking-[0.105em]">BORA ESTUDAR</div>
              <div className="text-xs font-bold tracking-[0.17em] text-brand-100 dark:text-brand-300">CONCURSOS</div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-8">
          <ul>
            <li className="mb-2">
              <Link href="/dashboard" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/dashboard' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaHome className="mr-2" />Home</Link>
            </li>
            <li className="mb-2">
              <Link href="/planos" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/planos' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaClipboardList className="mr-2" />Planos</Link>
            </li>
            <li className="mb-2">
              <Link href="/materias" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/materias' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaBook className="mr-2" />Matérias</Link>
            </li>
            
            <li className="mb-2">
              <Link href="/edital" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/edital' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaFileAlt className="mr-2" />Edital</Link>
            </li>
            
            <li className="mb-2">
              <Link href="/planejamento" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/planejamento' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaCalendarAlt className="mr-2" />Planejamento</Link>
            </li>
            <li className="mb-2">
              <Link href="/historico" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/historico' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaHistory className="mr-2" />Histórico</Link>
            </li>
            <li className="mb-2">
              <Link href="/revisoes" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/revisoes' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaRedoAlt className="mr-2" />Revisões</Link>
            </li>
            <li className="mb-2">
              <Link href="/estatisticas" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/estatisticas' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaChartBar className="mr-2" />Estatísticas</Link>
            </li>
            <li className="mb-2">
              <Link href="/simulados" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/simulados' ? 'bg-brand-600' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaGraduationCap className="mr-2" />Simulados</Link>
            </li>
            <li className="mb-2">
              <Link href="/backup" className={`flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 ${pathname === '/backup' ? 'bg-brand-600 dark:bg-gray-700' : ''} dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100`}><FaDatabase className="mr-2" />Backup</Link>
            </li>
            {status === 'authenticated' && (
              <li className="mb-2">
                <button
                  onClick={handleSignOut}
                  className="flex items-center p-2 rounded-md hover:bg-brand-600 transition-colors duration-200 w-full text-left dark:hover:bg-gray-700 dark:focus:ring-gray-500 dark:text-gray-100"
                >
                  <FaSignOutAlt className="mr-2" />Sair ({username ?? 'conta'})
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
      <div className="p-4 border-t border-brand-400 dark:border-gray-700">
        <div className="flex items-center justify-between space-x-2">
          <ThemeToggleButton />
          <div className="flex-grow">
            <PlanSelector />
          </div>
        </div>
      </div>
      
    </div>
  );
};

export default Sidebar;
