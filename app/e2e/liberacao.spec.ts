import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Regras de liberação: um módulo por linha com a regra por extenso, aulas recolhidas (só as com regra
// própria aparecem), um editor aberto por vez.
const aqui = path.dirname(fileURLToPath(import.meta.url))

function sql(id: string, linhas: string[]) {
  const pasta = path.join(aqui, '.tmp')
  mkdirSync(pasta, { recursive: true })
  const arquivo = path.join(pasta, `liberacao-${id}.sql`)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no SQL: ${r.stderr}`)
}

test('a equipe vê a regra de cada módulo por extenso e muda uma aula sem abrir a lista inteira', async ({
  page,
}) => {
  const id = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const email = `dono-lib-${id}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  sql(id, [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Acessórios ${id}', 9100)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m1-${id}', 'c-${id}', 'Começo', 1)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m2-${id}', 'c-${id}', 'Avançado', 2)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a1-${id}', 'm1-${id}', 'Já é bom', '', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a2-${id}', 'm1-${id}', 'Pedras pra que te quero', '', 2)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a3-${id}', 'm2-${id}', 'Beijinho no ombro', '', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma principal')`,
    `INSERT INTO regra_de_liberacao (id, turma_id, modulo_id, tipo, dias) VALUES ('r-${id}', 't-${id}', 'm2-${id}', 'dias_apos_compra', 7)`,
  ])
  await entrarPorCodigo(page, email)
  // O link antigo leva à aba Liberação do curso.
  await page.goto(`/painel/liberacao?turma=t-${id}`)
  await expect(page).toHaveURL(/aba=liberacao/)

  // Cada módulo numa linha, com a regra por extenso; nenhuma aula à mostra, nenhum Salvar.
  await esperarReact(
    page.getByRole('button', { name: 'Mudar a regra do módulo Começo' }),
  )
  await expect(
    page.getByText('2 módulos · 3 aulas · nenhuma aula com regra própria'),
  ).toBeVisible()
  await expect(page.getByText('Abre 7 dias após a compra')).toBeVisible()
  await expect(page.getByText('Pedras pra que te quero')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0)
  await page.screenshot({
    path: path.join(aqui, '.tmp', 'liberacao-fechada.png'),
    fullPage: true,
  })

  // Abre as aulas do módulo e dá regra própria a uma: só um editor aberto.
  await page
    .getByRole('button', { name: /Regra para uma aula · 2 aulas/ })
    .click()
  await page
    .getByRole('button', {
      name: 'Mudar a regra da aula Pedras pra que te quero',
    })
    .click()
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(1)
  await page
    .getByLabel('Regra da aula Pedras pra que te quero')
    .selectOption('bloqueado')
  await page.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByRole('button', { name: 'Salvar' })).toHaveCount(0)

  // Recolhida, a aula com regra própria continua à vista, com a regra por extenso.
  await page.getByRole('button', { name: 'Recolher as aulas' }).click()
  await expect(page.getByText('Pedras pra que te quero')).toBeVisible()
  await expect(page.getByText('Já é bom')).toHaveCount(0)
  await expect(page.getByText('1 aula com regra própria')).toBeVisible()
  await page.screenshot({
    path: path.join(aqui, '.tmp', 'liberacao-com-regra.png'),
    fullPage: true,
  })
})
