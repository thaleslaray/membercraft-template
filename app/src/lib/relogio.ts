import type { Relogio } from '#/regras/tipos'

// O relógio real, um só para as server functions e as colas: as regras recebem `Relogio` por
// parâmetro (nos testes, fixo) e nunca chamam `new Date()` direto.
export const agora: Relogio = () => new Date()
