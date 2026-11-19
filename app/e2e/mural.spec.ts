import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Comunidade como mural (#96): publicações de todas as comunidades visíveis, "Carregar mais" sozinho,
// filtros, voltar de uma publicação na mesma rolagem, e prints com axe (celular e desktop, claro e escuro).
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test.use({ bypassCSP: true })

const TITULO_LONGO =
  'Uma pergunta com um título realmente muito comprido para provar que a quebra de linha funciona no celular e no desktop sem estourar o cartão'

const semeados: string[] = []

// O D1 local é reaproveitado entre rodadas: as publicações semeadas sairiam enchendo a fila
// "Aguardando resposta" de outros testes. Apaga as comunidades (as publicações vão junto).
test.afterAll(() => {
  if (semeados.length === 0) return
  const ids = semeados.flatMap((id) => [`'g-${id}'`, `'a-${id}'`]).join(', ')
  spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--command',
      `DELETE FROM publicacao WHERE comunidade_id IN (${ids}); DELETE FROM comunidade WHERE id IN (${ids})`,
    ],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
})

function semear(id: string, email: string, pasta: string) {
  semeados.push(id)
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const agora = Date.now()
  const linhas = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso mural ${id}', 9000)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${agora - 86_400_000})`,
    `INSERT INTO comunidade (id, nome, icone, cor, so_equipe_publica) VALUES ('g-${id}', 'Geral ${id}', 'livro', '#2563eb', 0)`,
    `INSERT INTO comunidade (id, nome, icone, cor, so_equipe_publica) VALUES ('a-${id}', 'Avisos ${id}', 'avisos', '#dc2626', 1)`,
  ]
  for (let n = 1; n <= 45; n++) {
    const titulo = n === 3 ? `${TITULO_LONGO} ${id}` : `Pergunta ${n} ${id}`
    linhas.push(
      `INSERT INTO publicacao (id, comunidade_id, autor_id, titulo, texto_html, chave_de_envio, ultima_atividade_em, created_at, fixada) VALUES ('p${n}-${id}', 'g-${id}', '${userId}', '${titulo}', '<p>Texto da pergunta ${n}</p>', 'k${n}-${id}', ${agora - n * 60_000}, ${agora - n * 60_000}, ${n === 40 ? 1 : 0})`,
    )
  }
  for (let n = 1; n <= 3; n++) {
    linhas.push(
      `INSERT INTO publicacao (id, comunidade_id, autor_id, titulo, texto_html, chave_de_envio, ultima_atividade_em, created_at) VALUES ('av${n}-${id}', 'a-${id}', '${userId}', 'Aviso ${n} ${id}', '<p>Aviso</p>', 'kav${n}-${id}', ${agora - n * 1000}, ${agora - n * 1000})`,
    )
  }
  mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `semente-mural-${id}.sql`)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear o mural: ${r.stderr}`)
}

async function axe(page: Page, onde: string) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const r = await new AxeBuilder({ page }).analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

const titulos = (page: Page) => page.locator('main ul > li h3')

test('o mural carrega mais sozinho, filtra por comunidade e volta de uma publicação na mesma rolagem', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `mural-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(id, email, testInfo.outputPath(''))
  await entrarPorCodigo(page, email)

  await page.goto(`/comunidades?q=${id}`)
  await esperarReact(page.getByRole('button', { name: 'Carregar mais' }))
  // A fixada vem primeiro, mesmo sendo a 40ª em atividade.
  await expect(titulos(page).first()).toHaveText(`Pergunta 40 ${id}`)
  await expect(titulos(page)).toHaveCount(20)

  // Perto do fim, a próxima página chega sozinha (sem clicar), e sem número de página.
  await page
    .getByRole('button', { name: 'Carregar mais' })
    .scrollIntoViewIfNeeded()
  await expect(titulos(page)).toHaveCount(40)
  await page
    .getByRole('button', { name: 'Carregar mais' })
    .scrollIntoViewIfNeeded()
  await expect(titulos(page)).toHaveCount(48)
  await expect(page.getByRole('button', { name: 'Carregar mais' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('navigation', { name: 'Páginas' })).toHaveCount(0)

  // Voltar de uma publicação devolve o mural na mesma rolagem, com a lista toda.
  const alvo = page.getByRole('link', { name: new RegExp(`Pergunta 35 ${id}`) })
  await alvo.scrollIntoViewIfNeeded()
  const antes = await page.evaluate(() => window.scrollY)
  expect(antes).toBeGreaterThan(500)
  await alvo.click()
  await expect(page).toHaveURL(/\/comunidades\/publicacoes\//)
  await page
    .getByRole('main')
    .getByRole('link', { name: 'Comunidade', exact: true })
    .first()
    .click()
  await expect(page).toHaveURL(/\/comunidades\?q=/)
  await expect(titulos(page)).toHaveCount(48)
  await expect(alvo).toBeInViewport()
  const depois = await page.evaluate(() => window.scrollY)
  expect(Math.abs(depois - antes)).toBeLessThan(200)

  // Filtro por comunidade (seletor, na URL), e "Sem resposta".
  await page.goto(`/comunidades?q=${id}`)
  const seletor = page.getByLabel('Comunidade', { exact: true }).first()
  await esperarReact(seletor)
  await seletor.selectOption({ label: `Avisos ${id}` })
  await expect(page).toHaveURL(/comunidade=a-/)
  await expect(titulos(page)).toHaveCount(3)
  await seletor.selectOption({ label: 'Todas as comunidades' })
  await page.getByRole('button', { name: 'Sem resposta' }).click()
  await expect(page).toHaveURL(/status=sem-resposta/)
  await expect(titulos(page).first()).toBeVisible()

  // Nada encontrado.
  await page.goto(`/comunidades?q=inexistente-${id}`)
  await expect(
    page.getByText('Nenhuma conversa com esses filtros'),
  ).toBeVisible()
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe do mural: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('')
      mkdirSync(pasta, { recursive: true })
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const id = unico()
      const email = `mural-prints-${id}@exemplo.test`
      cadastrarUsuario({ email })
      semear(id, email, pasta)
      await entrarPorCodigo(page, email)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pasta, `${nome}-${tela.nome}-${modo}.png`),
        })

      await page.goto(`/comunidades?q=${id}`)
      await esperarReact(page.getByRole('button', { name: 'Carregar mais' }))
      await page.waitForTimeout(400)
      await foto('mural')
      await axe(page, `mural ${tela.nome} ${modo}`)

      // Compositor aberto.
      await page
        .getByRole('button', { name: 'Pergunte ou compartilhe algo' })
        .click()
      await expect(page.getByLabel('Título')).toBeFocused()
      await page.waitForTimeout(500)
      await foto('mural-compositor')
      await axe(page, `compositor ${tela.nome} ${modo}`)

      // Lista vazia.
      await page.goto(`/comunidades?q=nada-${id}`)
      await expect(
        page.getByText('Nenhuma conversa com esses filtros'),
      ).toBeVisible()
      await page.waitForTimeout(400)
      await foto('mural-vazio')
      await axe(page, `mural vazio ${tela.nome} ${modo}`)
    })
  }
}
