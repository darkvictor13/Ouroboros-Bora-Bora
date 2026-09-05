'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * A raiz só encaminha para `/planos`.
 *
 * Era um `redirect()` de Server Component. Sob `output: 'export'` não existe
 * servidor para responder o 307, e o Next reprova o build — o encaminhamento
 * passou para o cliente. Quem chega aqui sem sessão nem vê esta tela: o
 * `ClientLayoutWrapper` manda para `/login` antes.
 */
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // `replace` e não `push`: o "voltar" do navegador deve sair do app, não
    // cair de volta na raiz e ser reencaminhado num laço.
    router.replace('/planos');
  }, [router]);

  return null;
}
