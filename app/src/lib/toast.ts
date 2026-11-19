// `toast` do sonner sem puxar o sonner (~9 KB gzip) para o JavaScript inicial: a biblioteca
// só é baixada na primeira vez que alguém dispara um aviso. O `<Toaster />` (components/ui/sonner)
// já é carregado sob demanda no __root, e os dois dividem o mesmo chunk.
type Opcoes = { description?: string; duration?: number }

function avisar(tipo: 'error' | 'success') {
  return (mensagem: string, opcoes?: Opcoes) => {
    void import('sonner').then(({ toast }) => toast[tipo](mensagem, opcoes))
  }
}

/** Aviso com "Desfazer" por alguns segundos (a ação já valeu; desfazer a reverte). */
function comDesfazer(
  mensagem: string,
  aoDesfazer: () => void,
  opcoes: { duration?: number } = {},
) {
  void import('sonner').then(({ toast }) =>
    toast.success(mensagem, {
      duration: opcoes.duration ?? 6000,
      action: { label: 'Desfazer', onClick: aoDesfazer },
    }),
  )
}

export const toast = {
  error: avisar('error'),
  success: avisar('success'),
  comDesfazer,
}
