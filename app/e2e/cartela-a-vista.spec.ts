import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
// PNG 64x64 em cinco faixas de cor (vermelho, azul, amarelo, verde, roxo): a cartela sai dele.
const CAPA = 'conteudo/imagens/e2e-cartela-a-vista.png'
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAZElEQVR4nO3PMRUAEBQAQEnMZrMkQpjFkcQsjggi+AHuvStw6eQWkfuJuLtElDUiZl1fSUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDg5wHYcYS8iN58dgAAAABJRU5ErkJggg=='

function rodar(args: string[]) {
  const r = spawnSync('npx', args, { cwd: app, encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`Falha: ${args.join(' ')}\n${r.stderr}`)
}

function d1(sql: string) {
  rodar(['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql])
}

/** Grava uma capa colorida no R2 local, pelo mesmo caminho que o servidor lê. */
function gravarCapa() {
  const arquivo = path.join(app, 'e2e', '.capa-cartela.png')
  fs.writeFileSync(arquivo, Buffer.from(PNG, 'base64'))
  rodar([
    'wrangler',
    'r2',
    'object',
    'put',
    `escola-arquivos/${CAPA}`,
    '--file',
    arquivo,
    '--content-type',
    'image/png',
    '--local',
  ])
  fs.rmSync(arquivo, { force: true })
}

function preparar(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const curso = (sufixo: string, capa: string | null, ordem: number) => [
    `INSERT INTO curso (id, nome, ordem, capa_horizontal) VALUES ('c${sufixo}-${id}', 'Curso${sufixo} ${id}', ${ordem}, ${capa ? `'${capa}'` : 'NULL'})`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m${sufixo}-${id}', 'c${sufixo}-${id}', 'Módulo${sufixo} ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${sufixo}1-${id}', 'm${sufixo}-${id}', 'Primeira${sufixo} ${id}', '<p>Um</p>', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${sufixo}2-${id}', 'm${sufixo}-${id}', 'Segunda${sufixo} ${id}', '<p>Dois</p>', 2)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t${sufixo}-${id}', 'c${sufixo}-${id}', 'Turma${sufixo} ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt${sufixo}-${id}', '${userId}', 't${sufixo}-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  ]
  d1(
    [
      ...curso('', CAPA, 9001),
      ...curso('s', null, 9002),
      // Uma aula concluída no curso com capa, para a barra ter o que mostrar.
      `INSERT INTO progresso_da_aula (id, user_id, aula_id, concluida_em, aberta_em) VALUES ('p-${id}', '${userId}', 'a1-${id}', ${Date.now()}, ${Date.now()})`,
    ].join('; '),
  )
}

const pasta = process.env.PRINTS_DIR

test.describe('cartela à vista', () => {
  test.use({ bypassCSP: true })

  test('curso com capa mostra faixa, bolinhas e barras; sem capa fica como hoje', async ({
    page,
  }) => {
    const id = unico()
    const email = `cartela-${id}@exemplo.test`
    cadastrarUsuario({ email })
    gravarCapa()
    preparar(id, email)
    await entrarPorCodigo(page, email)

    // Página do curso com capa: faixa de 5 blocos, escondida do leitor de tela.
    await page.goto(`/cursos/c-${id}`)
    const faixa = page.getByTestId('cartela-faixa')
    await expect(faixa).toBeVisible()
    await expect(faixa).toHaveAttribute('aria-hidden', 'true')
    expect(await faixa.locator('span').count()).toBeGreaterThanOrEqual(3)

    // Sem capa: nem faixa.
    await page.goto(`/cursos/cs-${id}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByTestId('cartela-faixa')).toHaveCount(0)

    // Lista ao lado da aula: a barra usa a cor da marca, não a da capa (sem variáveis da cartela).
    await page.goto(`/aulas/a2-${id}`)
    await esperarReact(page.getByRole('button', { name: 'Aulas', exact: true }))
    await page.getByRole('button', { name: 'Aulas', exact: true }).click()
    const barra = page
      .getByRole('navigation', { name: 'Aulas do curso' })
      .getByRole('progressbar')
    await expect(barra).toBeVisible()
    await expect(barra).not.toHaveAttribute('style', /--barra-claro/)

    // Vitrine: sem bolinhas nos cartões (a cartela só aparece onde pinta algo).
    await page.goto('/')
    const cartao = page
      .getByRole('link', { name: new RegExp(`Curso ${id}`) })
      .first()
    await expect(cartao).toBeVisible()
    await expect(page.getByTestId('cartela-bolinhas')).toHaveCount(0)

    if (pasta) {
      const tamanhos = {
        celular: { width: 390, height: 844 },
        desktop: { width: 1440, height: 900 },
      }
      for (const [dispositivo, viewport] of Object.entries(tamanhos)) {
        for (const modo of ['claro', 'escuro'] as const) {
          await page.setViewportSize(viewport)
          await page.emulateMedia({
            colorScheme: modo === 'escuro' ? 'dark' : 'light',
          })
          await page.evaluate(
            (escuro) =>
              document.documentElement.classList.toggle('dark', escuro),
            modo === 'escuro',
          )
          for (const [nome, url] of [
            ['curso', `/cursos/c-${id}`],
            ['aula-com-indice', `/aulas/a2-${id}`],
            ['vitrine', '/'],
          ] as const) {
            await page.goto(url)
            await page.evaluate(
              (escuro) =>
                document.documentElement.classList.toggle('dark', escuro),
              modo === 'escuro',
            )
            await page.waitForTimeout(900)
            await page.screenshot({
              path: path.join(pasta, `${nome}-${dispositivo}-${modo}.png`),
              fullPage: false,
            })
          }
        }
      }
    }
  })
})
