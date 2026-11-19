import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const script = fs.readFileSync(
  path.resolve(aqui, '../scripts/medir-painel.navegador.js'),
  'utf8',
)

interface Tela {
  caminho: string
  nPedidos: number
  rodadas: number
  quieta: boolean
  erro?: string
  pedidos: {
    nome: string
    metodo: string
    ms: number | null
    periodico: boolean
  }[]
}

// Abre o painel como Proprietário e roda o script de medição do navegador: ele clica em cada item do
// menu e anota os pedidos de cada tela. Por enquanto só imprime a tabela (sem limite por tela).
test('pedidos ao abrir cada tela do painel', async ({ page }) => {
  test.setTimeout(300_000)
  const email = `pedidos-${Date.now()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)
  await page.goto('/painel')
  await esperarReact(
    page.locator('nav[aria-label="Painel da equipe"] a').first(),
  )
  // Ponteiro longe do menu: nada de pré-carregamento por hover.
  await page.mouse.move(2, 2)
  await page.waitForTimeout(2000)

  // `PASSADAS=2 npx playwright test ...` visita tudo duas vezes (a segunda mostra o efeito do cache).
  await page.evaluate((n) => {
    ;(window as unknown as { PASSADAS: number }).PASSADAS = n
  }, Number(process.env.PASSADAS) || 1)
  await page.evaluate(script)
  const medida = await page.evaluate(
    () =>
      (
        window as unknown as {
          __medidaDoPainel: { passadas: { telas: Tela[] }[]; erros: string[] }
        }
      ).__medidaDoPainel,
  )
  const telas = medida.passadas[0].telas
  if (medida.erros.length)
    console.log(`ERROS DA PÁGINA: ${medida.erros.join(' | ')}`)
  for (const [i, passada] of medida.passadas.entries()) {
    const linhas = passada.telas.map(
      (t) =>
        `${t.caminho.padEnd(34)} ${String(t.nPedidos).padStart(2)} pedido(s) ${String(t.rodadas).padStart(2)} rodada(s)${t.erro ? ` [ERRO: ${t.erro}]` : t.quieta ? '' : ' [NÃO AQUIETOU]'}  ${t.pedidos.map((p) => `${p.nome}${p.periodico ? '*' : ''} ${p.metodo} ${p.ms ?? '?'}ms`).join(' | ')}`,
    )
    console.log(
      `\nPEDIDOS POR TELA DO PAINEL, passada ${i + 1} (* = periódico, fora da contagem)\n${linhas.join('\n')}`,
    )
  }

  expect(telas.length).toBeGreaterThanOrEqual(10)
})

// A viagem ao servidor custa uns 200 ms em produção e 1 ms aqui. Com um atraso artificial de 1,5 s em
// toda server function, a tela só aparece rápido se NÃO esperar o pedido: ou porque já tem o dado da
// visita anterior (e revalida em segundo plano), ou porque o hover no menu buscou antes do clique.
test('tela já visitada e tela pré-carregada abrem sem esperar o servidor', async ({
  page,
}) => {
  const ATRASO = 1500
  const RAPIDO = 700
  const email = `memoria-${Date.now()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)
  await page.goto('/painel')
  const menu = page.locator('nav[aria-label="Painel da equipe"]')
  const item = (href: string) => menu.locator(`a[href="${href}"]`)
  const titulo = (nome: string) =>
    page.getByRole('heading', { level: 1, name: nome })
  await esperarReact(item('/painel/alunos'))

  // Primeira visita a Alunos (sem atraso), e volta para Cursos.
  await item('/painel/alunos').click()
  await expect(titulo('Alunos')).toBeVisible()
  await item('/painel/conteudo').click()
  await expect(titulo('Cursos')).toBeVisible()
  await page.mouse.move(2, 2)
  // Passa o prazo do pré-carregamento (30 s não cabem no teste): o que vale aqui é o dado da visita.
  await page.waitForTimeout(500)

  await page.route('**/_serverFn/**', async (rota) => {
    await new Promise((r) => setTimeout(r, ATRASO))
    await rota.continue()
  })

  // Contraprova: tela nunca visitada espera o servidor (o atraso está valendo).
  const t0 = Date.now()
  await item('/painel/vendas').click()
  // O título "Vendas" é da casca das abas e aparece junto do esqueleto; o dado chega com a lista.
  await expect(
    page.getByRole('heading', { level: 2, name: /Avisos recebidos/ }),
  ).toBeVisible()
  expect(Date.now() - t0).toBeGreaterThanOrEqual(ATRASO)
  await page.mouse.move(2, 2)

  // Tela já visitada: aparece com o dado guardado, sem esperar.
  await item('/painel/alunos').click()
  await expect(titulo('Alunos')).toBeVisible({ timeout: RAPIDO })
  await page.mouse.move(2, 2)

  // Tela nunca visitada, mas com o ponteiro parado no item do menu antes do clique.
  await item('/painel/banners').hover()
  await page.waitForTimeout(ATRASO + 1000)
  await item('/painel/banners').click()
  await expect(titulo('Banners')).toBeVisible({ timeout: RAPIDO })
})
