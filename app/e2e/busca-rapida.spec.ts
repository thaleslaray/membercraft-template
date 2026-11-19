import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Busca rápida ⌘K (#100): a janela nasce do campo do topo, acha o que a Helena falou e cai no minuto
// certo. Dados extremos: curso sem capa de título longo, 210 aulas, aulas com o mesmo termo no título.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test.use({ bypassCSP: true })

function sql(arquivo: string, linhas: string[]) {
  mkdirSync(path.dirname(arquivo), { recursive: true })
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

// `fala`: palavra única que só existe na transcrição (aos 95 s) da aula `a1`.
function semear(
  pasta: string,
  id: string,
  email: string,
  fala: string,
  palavra: string,
) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const nome = `Curso com um título bem comprido para testar a quebra de linha e o corte ${palavra} ${id}`
  const linhas = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', '${nome}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${palavra} com nome também bem comprido para cortar ${id}', 1)`,
  ]
  for (let n = 1; n <= 210; n++) {
    const vimeo = n === 1 ? `'v-${id}'` : 'NULL'
    linhas.push(
      `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('a${n}-${id}', 'm-${id}', 'Aula ${n} ${palavra} ${id}', '<p>Texto ${n}</p>', ${vimeo}, ${n})`,
    )
  }
  linhas.push(
    `INSERT INTO transcricao (vimeo_id, arquivo) VALUES ('v-${id}', 'a.vtt')`,
    `INSERT INTO trecho_da_transcricao (vimeo_id, inicio, texto, texto_busca) VALUES ('v-${id}', 12, 'Bem-vindas à aula', 'bem-vindas a aula')`,
    `INSERT INTO trecho_da_transcricao (vimeo_id, inicio, texto, texto_busca) VALUES ('v-${id}', 95, 'agora a ${fala} no comprimento', 'agora a ${fala} no comprimento')`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  )
  sql(path.join(pasta, `semente-${id}.sql`), linhas)
}

async function janela(page: Page) {
  return page.getByRole('dialog', { name: 'Busca rápida' })
}

async function abrirPeloGatilho(page: Page, celular: boolean) {
  const gatilho = page.getByRole('button', {
    name: celular ? 'Abrir a busca' : 'Pesquisar aulas e vídeos',
  })
  await esperarReact(gatilho)
  await expect(async () => {
    await gatilho.click()
    await expect(await janela(page)).toBeVisible({ timeout: 1500 })
  }).toPass()
  return gatilho
}

async function axe(page: Page, onde: string) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const r = await new AxeBuilder({ page }).disableRules(['region']).analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

test('o que a Helena falou: busca pela fala e cai no minuto certo', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `busca-${id}@exemplo.test`
  const fala = `hidratacao${id.replace(/\W/g, '')}`
  cadastrarUsuario({ email })
  semear(testInfo.outputDir, id, email, fala, 'Xilofone')
  await entrarPorCodigo(page, email)

  await page.goto('/')
  await abrirPeloGatilho(page, false)
  const caixa = page.getByRole('combobox', { name: 'Buscar nos seus cursos' })
  await expect(caixa).toBeFocused()

  // Menos de 2 letras não procura.
  await caixa.fill('h')
  await expect(page.getByRole('option')).toHaveCount(0)

  await caixa.fill(fala)
  const falado = page.getByRole('group', { name: 'Falado no vídeo' })
  await expect(falado.getByRole('option')).toHaveCount(1)
  await expect(falado.getByRole('option')).toContainText('aos 1:35')

  // Enter abre a aula já no minuto.
  await caixa.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/aulas/a1-${id}\\?t=95$`))
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(
    0,
  )
})

test('atalho, Esc devolve o foco, limite por grupo e ver todos', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `busca-teclado-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(
    testInfo.outputDir,
    id,
    email,
    `nada${id.replace(/\W/g, '')}`,
    'Girafa',
  )
  await entrarPorCodigo(page, email)

  await page.goto('/')
  const gatilho = page.getByRole('button', { name: 'Pesquisar aulas e vídeos' })
  await esperarReact(gatilho)
  await expect(async () => {
    await page.keyboard.press('Control+k')
    await expect(await janela(page)).toBeVisible({ timeout: 1500 })
  }).toPass()

  const caixa = page.getByRole('combobox', { name: 'Buscar nos seus cursos' })
  await caixa.fill('girafa')
  // 210 aulas batem, mas o grupo mostra no máximo 3.
  const aulas = page.getByRole('group', { name: 'Aulas', exact: true })
  await expect(aulas.getByRole('option')).toHaveCount(3)
  // ↓ muda a seleção na hora.
  await expect(page.getByRole('option').first()).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await caixa.press('ArrowDown')
  await expect(page.getByRole('option').nth(1)).toHaveAttribute(
    'aria-selected',
    'true',
  )

  // Esc fecha e o foco volta ao campo do topo.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(
    0,
  )
  await expect(gatilho).toBeFocused()

  // "Ver todos os resultados" leva à página de busca.
  await gatilho.click()
  await page.getByRole('combobox').fill('girafa')
  await expect(aulas.getByRole('option')).toHaveCount(3)
  await page.getByRole('button', { name: 'Ver todos os resultados' }).click()
  await expect(page).toHaveURL(/\/busca\?q=girafa/)

  // O atalho não dispara dentro de um campo de texto (a página de busca tem o seu).
  const campoDaPagina = page.getByRole('searchbox', {
    name: 'Buscar nos seus cursos',
  })
  await esperarReact(campoDaPagina)
  await campoDaPagina.focus()
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  await expect(page.getByRole('dialog', { name: 'Busca rápida' })).toHaveCount(
    0,
  )
})

test('sem termo mostra as últimas aulas abertas, e termo sem resultado avisa', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `busca-ultimas-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(
    testInfo.outputDir,
    id,
    email,
    `nada${id.replace(/\W/g, '')}`,
    'Tucano',
  )
  await entrarPorCodigo(page, email)

  // Abre três aulas, a última por último.
  for (const n of [3, 2, 1]) {
    await page.goto(`/aulas/a${n}-${id}`)
    await esperarReact(
      page.getByRole('button', { name: 'Abrir menu da conta' }),
    )
    await page.waitForTimeout(300)
  }
  await page.goto('/')
  await abrirPeloGatilho(page, false)
  const ultimas = page.getByRole('group', { name: 'Últimas aulas abertas' })
  await expect(ultimas.getByRole('option')).toHaveCount(3)
  await expect(ultimas.getByRole('option').first()).toContainText(
    `Aula 1 Tucano ${id}`,
  )

  await page
    .getByRole('combobox', { name: 'Buscar nos seus cursos' })
    .fill('palavra-que-nao-existe-em-lugar-nenhum')
  await expect(page.getByText('Nada encontrado para')).toBeVisible()
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 }, celular: false },
  { nome: 'celular', viewport: { width: 390, height: 844 }, celular: true },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe: ${tela.nome} ${modo}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const id = unico()
      const email = `busca-prints-${id}@exemplo.test`
      const fala = `cronograma${id.replace(/\W/g, '')}`
      cadastrarUsuario({ email })
      semear(testInfo.outputDir, id, email, fala, 'Cronograma')
      await entrarPorCodigo(page, email)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputDir
      mkdirSync(pasta, { recursive: true })
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pasta, `${nome}-${tela.nome}-${modo}.png`),
        })

      await page.goto(`/aulas/a2-${id}`)
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(300)
      await page.goto('/')
      await abrirPeloGatilho(page, tela.celular)
      await page.waitForTimeout(500)
      await foto('busca-ultimas')
      await axe(page, `últimas ${tela.nome} ${modo}`)

      const caixa = page.getByRole('combobox', {
        name: 'Buscar nos seus cursos',
      })
      await caixa.fill('cronograma')
      await expect(
        page.getByRole('group', { name: 'Falado no vídeo' }),
      ).toBeVisible()
      // "Falado no vídeo" aparece sem rolar a lista.
      await expect(
        page.getByRole('group', { name: 'Falado no vídeo' }),
      ).toBeInViewport({ ratio: 1 })
      await page.waitForTimeout(500)
      await foto('busca-resultados')
      await axe(page, `resultados ${tela.nome} ${modo}`)

      await caixa.fill('zzzqqq')
      await expect(page.getByText('Nada encontrado para')).toBeVisible()
      await page.waitForTimeout(300)
      await foto('busca-vazia')
      await axe(page, `vazia ${tela.nome} ${modo}`)
    })
  }
}
