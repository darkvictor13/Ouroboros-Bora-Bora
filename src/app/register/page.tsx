'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const nomeUsuario = username.trim();

    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    // Mesmo limite do check `profiles_username_length` na migration 0001.
    if (nomeUsuario.length < 3 || nomeUsuario.length > 50) {
      setError('O nome de usuário deve ter entre 3 e 50 caracteres.');
      return;
    }

    setSubmitting(true);

    const supabase = createClient();
    // O username viaja em `options.data` e o trigger `on_auth_user_created` o
    // copia para `profiles`. O Supabase Auth só conhece e-mail e senha.
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { username: nomeUsuario } },
    });

    setSubmitting(false);

    if (authError) {
      const mensagem = authError.message.toLowerCase();
      // O unique de `profiles.username` estoura dentro do trigger
      // `on_auth_user_created`. Dependendo da versão do GoTrue, isso chega aqui
      // como o erro cru do Postgres (23505) ou como "Database error saving new user".
      const usernameDuplicado =
        mensagem.includes('profiles_username_key') ||
        mensagem.includes('duplicate key') ||
        mensagem.includes('database error');

      if (usernameDuplicado) {
        setError('Este nome de usuário já está em uso. Escolha outro.');
      } else if (mensagem.includes('already registered')) {
        setError('Já existe uma conta com este e-mail.');
      } else {
        setError(authError.message);
      }
      return;
    }

    // Com a confirmação de e-mail ligada, o signUp não devolve sessão: o
    // usuário precisa clicar no link antes de entrar.
    if (data.session) {
      setSuccess('Registro bem-sucedido! Entrando...');
      router.push('/dashboard');
      return;
    }

    setSuccess('Registro bem-sucedido! Confirme seu e-mail para poder entrar.');
    setTimeout(() => router.push('/login'), 3000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-gray-100 mb-6">Registrar</h2>
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        {success && <p className="text-green-500 text-center mb-4">{success}</p>}
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="email" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">E-mail:</label>
            <input
              type="email"
              id="email"
              autoComplete="email"
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="username" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Nome de Usuário:</label>
            <input
              type="text"
              id="username"
              autoComplete="username"
              minLength={3}
              maxLength={50}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Senha:</label>
            <input
              type="password"
              id="password"
              autoComplete="new-password"
              minLength={6}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="mb-6">
            <label htmlFor="confirmPassword" className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">Confirmar Senha:</label>
            <input
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              minLength={6}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              type="submit"
              disabled={submitting}
              className="bg-amber-500 hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              {submitting ? 'Registrando...' : 'Registrar'}
            </button>
            <Link href="/login" className="inline-block align-baseline font-bold text-sm text-amber-500 hover:text-amber-800">
              Já tem uma conta? Faça login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
