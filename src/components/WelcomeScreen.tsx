'use client';

import React from 'react';
import Link from 'next/link';
import { FaPlus, FaThList, FaUpload } from 'react-icons/fa';

interface WelcomeScreenProps {
  onOpenModal: () => void;
  /**
   * Abre o seletor de arquivo do RF-A1. Ausente quando não há sessão: sem
   * `auth.uid()` não há onde gravar o plano.
   */
  onImportFile?: () => void;
}

/**
 * A tela de quem ainda não tem plano nenhum.
 *
 * O botão principal é o **catálogo**, e não "criar do zero": é aqui que o
 * usuário está mais longe de ter o que digitar, e digitar 200 tópicos à mão era
 * o problema que o catálogo existe para resolver.
 */
const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onOpenModal, onImportFile }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-50 dark:bg-gray-900 p-8 rounded-lg">
      <div className="text-center max-w-2xl">
        <h2 className="text-4xl font-bold text-gray-800 dark:text-gray-100 mb-4">Bem-vindo ao seu Planejador de Estudos!</h2>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Comece por um plano pronto, montado a partir do conteúdo programático de
          um edital oficial - ou monte o seu do zero, se preferir.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {onImportFile ? (
            <Link
              href="/planos/catalogo"
              className="bg-teal-500 text-white font-bold py-3 px-8 rounded-lg hover:bg-teal-600 transition-all duration-300 transform hover:scale-105 shadow-lg dark:bg-teal-600 dark:hover:bg-teal-700"
            >
              <FaThList className="inline-block mr-3" />
              Escolher um plano pronto
            </Link>
          ) : null}
          <button
            onClick={onOpenModal}
            className="bg-white dark:bg-gray-800 text-teal-700 dark:text-teal-300 border border-teal-500 font-bold py-3 px-8 rounded-lg hover:bg-teal-50 dark:hover:bg-gray-700 transition-all duration-300 shadow"
          >
            <FaPlus className="inline-block mr-3" />
            Criar um plano do zero
          </button>
        </div>
        {onImportFile ? (
          <button
            onClick={onImportFile}
            className="mt-6 inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400"
          >
            <FaUpload />
            Já tenho um arquivo de plano ou um backup
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default WelcomeScreen;
