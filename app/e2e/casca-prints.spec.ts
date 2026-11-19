import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Prints e axe da casca nova (#93): desktop 1440×900 e celular 390×844, claro e escuro, com dados
// extremos (título longo, curso sem capa, 210 aulas). Os prints vão para a pasta de prints da fatia.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PRINTS =
  process.env.PRINTS_DIR ??
  path.join(aqui, '..', 'test-results', 'prints-casca')
mkdirSync(PRINTS, { recursive: true })

test.use({ bypassCSP: true })

function prepararCursoExtremo(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const nome = `Curso com um título bem comprido para testar a quebra de linha e o corte ${id}`
  const linhas = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', '${nome}', 9000)`,
  ]
  for (let m = 1; m <= 7; m++) {
    linhas.push(
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m${m}-${id}', 'c-${id}', 'Módulo ${m} ${id}', ${m})`,
    )
  }
  for (let n = 1; n <= 210; n++) {
    linhas.push(
      `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm${((n - 1) % 7) + 1}-${id}', 'Aula ${n} ${id}', '<p>Texto da aula ${n}</p>', ${n})`,
    )
  }
  linhas.push(
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  )
  const arquivo = path.join(os.tmpdir(), `semente-${id}.sql`)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o curso: ${r.stderr}`)
}

// `menuAberto`: o conteúdo de um menu do Radix mora num portal fora das regiões da página, o que
// dispara a regra `region` (de boa prática) sem ser um defeito do menu.
async function axe(
  page: import('@playwright/test').Page,
  onde: string,
  menuAberto = false,
) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const construtor = new AxeBuilder({ page })
  if (menuAberto) construtor.disableRules(['region'])
  const r = await construtor.analyze()
  const graves = r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)
  expect(graves, `axe em ${onde}`).toEqual([])
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe: ${tela.nome} ${modo}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const id = unico()
      const email = `casca-prints-${id}@exemplo.test`
      cadastrarUsuario({ email })
      prepararCursoExtremo(id, email)
      await entrarPorCodigo(page, email)
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(PRINTS, `${nome}-${tela.nome}-${modo}.png`),
        })

      await page.goto('/')
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(400)
      await foto('inicio')
      await axe(page, `início ${tela.nome} ${modo}`)

      await page.goto(`/cursos/c-${id}`)
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(400)
      await foto('curso')
      await axe(page, `curso ${tela.nome} ${modo}`)

      await page.goto(`/aulas/a1-${id}`)
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(400)
      await foto('aula')
      await axe(page, `aula ${tela.nome} ${modo}`)

      // Com conteúdo passando por baixo da barra (esmaecimento da borda).
      await page.goto(`/cursos/c-${id}`)
      await page.evaluate(() => window.scrollTo(0, 400))
      await page.waitForTimeout(400)
      await foto('curso-rolado')

      // Menu do avatar aberto.
      await page.goto('/')
      const avatar = page.getByRole('button', { name: 'Abrir menu da conta' })
      await esperarReact(avatar)
      await expect(async () => {
        await avatar.click()
        await expect(page.getByRole('menu')).toBeVisible({ timeout: 1000 })
      }).toPass()
      await page.waitForTimeout(400)
      await foto('menu-do-avatar')
      await axe(page, `menu do avatar ${tela.nome} ${modo}`, true)
      await page.keyboard.press('Escape')

      if (tela.nome === 'celular') {
        await expect(
          page.getByRole('navigation', { name: 'Abas' }),
        ).toBeVisible()
        await page.goto('/comunidades')
        await page.waitForTimeout(400)
        await foto('abas')
        await axe(page, `comunidade ${tela.nome} ${modo}`)
      } else {
        await page.goto('/comunidades')
        await page.waitForTimeout(400)
        await foto('comunidade')
        await axe(page, `comunidade ${tela.nome} ${modo}`)
      }
    })
  }
}
