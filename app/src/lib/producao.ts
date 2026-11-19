// Produção de verdade: `AMBIENTE=producao` no Worker publicado. O `wrangler.jsonc` também define
// `AMBIENTE=producao` no `npm run dev` local, onde o código de login precisa continuar saindo no
// terminal (o e2e o lê de `e2e/.dev.log`); o dev server do Vite tem `DEV=true`, o build não.
export function emProducaoDeVerdade(
  ambiente: string | undefined,
  dev: boolean,
): boolean {
  return ambiente === 'producao' && !dev
}
