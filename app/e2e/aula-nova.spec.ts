import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Aula nova (#95): vídeo em foco, lista única (botão e tecla L), conclusão silenciosa, aula de texto com
// "Concluir aula" no fim, materiais sem aba e moderação dos comentários no menu ⋯. Prints e axe nos
// quatro modos (celular e desktop, claro e escuro) com dados extremos.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test.use({ bypassCSP: true })

function prepararCurso(id: string, emails: string[], pasta: string) {
  const linhas = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso da aula nova ${id}', 9000)`,
  ]
  for (let m = 1; m <= 7; m++) {
    linhas.push(
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m${m}-${id}', 'c-${id}', 'Módulo ${m} ${id}', ${m})`,
    )
  }
  for (let n = 1; n <= 210; n++) {
    const titulo =
      n === 1
        ? `Uma aula com um título bem comprido para testar a quebra de linha e o corte da lista ${id}`
        : `Aula ${n} ${id}`
    linhas.push(
      `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm${((n - 1) % 7) + 1}-${id}', '${titulo}', ${n <= 3 || n === 8 ? "'<p>Texto da aula</p>'" : "''"}, ${n})`,
    )
  }
  linhas.push(
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('v-${id}', 'm1-${id}', 'Aula de vídeo com um título razoavelmente longo para conferir a quebra ${id}', '', '76979871', 500)`,
    `INSERT INTO material_da_aula (id, aula_id, nome, chave, tipo, tamanho, ordem) VALUES ('mat1-${id}', 'a1-${id}', 'Apostila com um nome de arquivo bem comprido para o corte ${id}.pdf', 'x/${id}.pdf', 'application/pdf', 2400000, 1)`,
    `INSERT INTO material_da_aula (id, aula_id, nome, chave, tipo, tamanho, ordem) VALUES ('mat2-${id}', 'a1-${id}', 'Planilha ${id}.xlsx', 'x/${id}b.xlsx', 'application/octet-stream', 52000, 2)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
  )
  for (const [i, email] of emails.entries()) {
    const userId = `e2e-${email.replace(/\W/g, '-')}`
    linhas.push(
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}-${i}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    )
  }
  const arquivo = path.join(pasta, `semente-${id}.sql`)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o curso: ${r.stderr}`)
}

async function axe(page: Page, onde: string, semRegiao = false) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const construtor = new AxeBuilder({ page })
  if (semRegiao) construtor.disableRules(['region'])
  const r = await construtor.analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

const botaoAulas = (page: Page) =>
  page.getByRole('button', { name: 'Aulas', exact: true })
const lista = (page: Page) =>
  page.getByRole('navigation', { name: 'Aulas do curso' })

test('aula de texto: sem aba nem cartão, lista no L, conclusão sem aviso e setas', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  const id = unico()
  const email = `aula-nova-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCurso(id, [email], testInfo.outputPath('.'))
  await entrarPorCodigo(page, email)

  await page.goto(`/aulas/a2-${id}`)
  await esperarReact(botaoAulas(page))

  // Só o que existe aparece: nada de aba, de "não tem texto" nem de barra do curso.
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByText('Esta aula não tem texto')).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  await expect(page.getByText('Texto da aula')).toBeVisible()
  await expect(
    page.getByText(/Módulo 2 .* · faltam 30 aulas para fechar o módulo/),
  ).toBeVisible()

  // L abre e fecha a lista; a aula atual vem marcada; o estado fica no aparelho.
  await expect(lista(page)).toBeHidden()
  await expect(async () => {
    await page.keyboard.press('l')
    await expect(lista(page)).toBeVisible({ timeout: 1000 })
  }).toPass()
  await expect(lista(page).locator('[aria-current="page"]')).toHaveText(
    new RegExp(`Aula 2 ${id}`),
  )
  await page.reload()
  await esperarReact(botaoAulas(page))
  await expect(lista(page)).toBeVisible()
  await botaoAulas(page).click()
  await expect(lista(page)).toBeHidden()
  await page.keyboard.press('l')
  await expect(lista(page)).toBeVisible()

  // Concluir: o botão e o ✓ da lista mudam, sem aviso por cima.
  const concluir = page.getByRole('button', { name: 'Concluir aula' })
  await expect(async () => {
    await concluir.click()
    await expect(page.getByRole('button', { name: 'Concluída' })).toBeVisible({
      timeout: 2000,
    })
  }).toPass()
  await expect(
    lista(page).getByRole('img', { name: 'Concluída' }),
  ).toBeVisible()
  await expect(page.getByText('Aula concluída.')).toHaveCount(0)

  // ← e → trocam de aula (a ordem é a do curso, módulo a módulo: depois da 2 vem a 9, do mesmo módulo).
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(new RegExp(`/aulas/a9-${id}$`))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `Aula 9 ${id}`,
  )
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(new RegExp(`/aulas/a2-${id}$`))

  // Clicar em "Concluída" desfaz a conclusão.
  await page.getByRole('button', { name: 'Concluída' }).click()
  await expect(
    page.getByRole('button', { name: 'Concluir aula' }),
  ).toBeVisible()
})

test('materiais são itens sem aba; a equipe modera os comentários pelo menu ⋯', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `aula-nova-equipe-${id}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'equipe' })
  prepararCurso(id, [email], testInfo.outputPath('.'))
  await entrarPorCodigo(page, email)

  await page.goto(`/aulas/a1-${id}`)
  await esperarReact(botaoAulas(page))
  await expect(page.getByRole('tab')).toHaveCount(0)
  const materiais = page.getByRole('region', { name: 'Materiais da aula' })
  await expect(materiais.getByRole('listitem')).toHaveCount(2)
  await expect(
    materiais.getByRole('link', { name: /Baixar Planilha/ }),
  ).toBeVisible()

  // Sem barra de moderação no meio da página: ela mora no menu ⋯ dos comentários.
  await expect(page.getByText('Moderação:')).toHaveCount(0)
  await page.getByRole('button', { name: 'Moderação dos comentários' }).click()
  await expect(
    page.getByRole('menuitem', { name: 'Desligar comentários desta aula' }),
  ).toBeVisible()
  await expect(
    page.getByRole('menuitem', { name: 'Desligar comentários do módulo' }),
  ).toBeVisible()
})

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe da aula: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('.')
      const id = unico()
      const email = `aula-nova-prints-${id}@exemplo.test`
      cadastrarUsuario({ email })
      prepararCurso(id, [email], testInfo.outputPath('.'))
      await entrarPorCodigo(page, email)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(pasta, `${nome}-${tela.nome}-${modo}.png`),
        })

      // Título longo, materiais, 210 aulas.
      await page.goto(`/aulas/a1-${id}`)
      await esperarReact(botaoAulas(page))
      await page.waitForTimeout(500)
      await foto('aula-fechada')
      await axe(page, `aula ${tela.nome} ${modo}`)

      await botaoAulas(page).click()
      await expect(lista(page)).toBeVisible()
      await page.waitForTimeout(700)
      await foto('aula-com-lista')
      await axe(page, `aula com lista ${tela.nome} ${modo}`, true)

      // Aula de vídeo (vídeo público do Vimeo; sem rede, fica o espaço 16:9).
      await page.goto(`/aulas/v-${id}`)
      await esperarReact(botaoAulas(page))
      await page.waitForTimeout(1500)
      if (!(await lista(page).isVisible())) {
        // O estado da lista fica no aparelho: o print "fechada" parte dela fechada.
      } else {
        await botaoAulas(page).click()
        await expect(lista(page)).toBeHidden()
      }
      await foto('aula-video')
      await axe(page, `aula de vídeo ${tela.nome} ${modo}`, true)
      if (tela.nome === 'desktop' && modo === 'claro') {
        await botaoAulas(page).click()
        await expect(lista(page)).toBeVisible()
        await page.waitForTimeout(700)
        await foto('aula-video-com-lista')
      }
    })
  }
}
