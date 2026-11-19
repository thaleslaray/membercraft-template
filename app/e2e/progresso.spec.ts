import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Curso com duas aulas só de texto (sem Vimeo, que não existe no e2e) e a aluna matriculada.
function prepararCursoMatriculado(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a1-${id}', 'm-${id}', 'Primeira ${id}', '<p>Texto um</p>', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a2-${id}', 'm-${id}', 'Segunda ${id}', '<p>Texto dois</p>', 2)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o curso: ${r.stderr}`)
}

test('a aluna conclui aulas, vê o percentual, continua de onde parou e desmarca', async ({
  page,
}) => {
  const id = unico()
  const email = `progresso-${id}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCursoMatriculado(id, email)
  await entrarPorCodigo(page, email)

  // Curso novo: botão "Começar", 0%.
  await page.goto(`/cursos/c-${id}`)
  await expect(
    page
      .getByRole('main')
      .getByRole('img', { name: /^Progresso do curso: 0%/ }),
  ).toBeVisible()
  const botao = page.getByRole('link', { name: 'Começar' })
  await expect(botao).toHaveAttribute('href', `/aulas/a1-${id}`)
  await botao.click()

  // Conclui a primeira aula pelo botão.
  await expect(page).toHaveURL(new RegExp(`/aulas/a1-${id}$`))
  const concluir = page.getByRole('button', { name: 'Concluir aula' })
  await expect(concluir).toBeVisible()
  await expect(async () => {
    await concluir.click()
    await expect(page.getByRole('button', { name: 'Concluída' })).toBeVisible({
      timeout: 2000,
    })
  }).toPass()

  // O curso mostra 50% e o botão passa a "Continuar", na segunda aula.
  await page.goto(`/cursos/c-${id}`)
  await expect(
    page
      .getByRole('main')
      .getByRole('img', { name: /^Progresso do curso: 50%/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    `/aulas/a2-${id}`,
  )

  // A segunda aula só foi aberta: o destaque de Meus cursos a abre ("Continuar"), com a barra em 50%
  // e o que falta para fechar o módulo.
  await page.goto(`/aulas/a2-${id}`)
  // Espera hidratar: é aí que a abertura da aula é registrada.
  await esperarReact(page.getByRole('button', { name: 'Concluir aula' }))
  await page.waitForTimeout(1500)
  const destaque = page.getByRole('region', { name: 'Continuar de onde parou' })
  await expect(async () => {
    await page.goto('/')
    await expect(destaque.getByRole('link')).toHaveAttribute(
      'href',
      `/aulas/a2-${id}`,
    )
  }).toPass()
  await expect(destaque).toContainText(`Curso ${id}`)
  await expect(destaque).toContainText(`Segunda ${id}`)
  await expect(destaque).toContainText('Falta 1 aula para fechar o módulo')
  await expect(destaque.getByText('Continuar', { exact: true })).toBeVisible()
  await expect(
    destaque.getByRole('progressbar', { name: 'Progresso do curso' }),
  ).toHaveAttribute('aria-valuenow', '50')
  // O curso do destaque não se repete em "Em andamento".
  await expect(
    page
      .getByRole('region', { name: 'Em andamento' })
      .getByRole('link', { name: new RegExp(`Curso ${id}`) }),
  ).toHaveCount(0)

  // Desmarca a primeira (aberta por último): volta a 0 de 2 e o botão retoma nela.
  await page.goto(`/aulas/a1-${id}`)
  const desmarcar = page.getByRole('button', { name: 'Concluída' })
  await expect(desmarcar).toBeVisible()
  await expect(async () => {
    await desmarcar.click()
    await expect(
      page.getByRole('button', { name: 'Concluir aula' }),
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  await page.goto(`/cursos/c-${id}`)
  await expect(
    page
      .getByRole('main')
      .getByRole('img', { name: /^Progresso do curso: 0%/ }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Continuar' })).toHaveAttribute(
    'href',
    `/aulas/a1-${id}`,
  )
})

test('Meus cursos agrupa por situação na ordem certa e o destaque some sem aula aberta', async ({
  page,
}) => {
  const a = unico()
  const b = unico()
  const email = `grupos-${a}@exemplo.test`
  cadastrarUsuario({ email })
  prepararCursoMatriculado(a, email)
  prepararCursoMatriculado(b, email)
  await entrarPorCodigo(page, email)

  // Nada aberto: sem destaque, os dois cursos em "Para começar".
  await page.goto('/')
  await expect(
    page.getByRole('region', { name: 'Continuar de onde parou' }),
  ).toHaveCount(0)
  const paraComecar = page.getByRole('region', { name: 'Para começar' })
  await expect(paraComecar.getByRole('link')).toHaveCount(2)
  await expect(paraComecar).toContainText(`Começar: Primeira ${a}`)

  // Conclui as duas aulas do primeiro curso: ele vai para "Concluídos"; o outro segue em "Para começar".
  const sql = [
    `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('pg-${a}-${Math.random()}', 'e2e-${email.replace(/\W/g, '-')}', 'a1-${a}', ${Date.now()}, ${Date.now()})`,
    `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('pg-${a}-${Math.random()}', 'e2e-${email.replace(/\W/g, '-')}', 'a2-${a}', ${Date.now()}, ${Date.now()})`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao concluir: ${r.stderr}`)
  await page.goto('/')
  await expect(
    page
      .getByRole('region', { name: 'Concluídos' })
      .getByRole('link', { name: new RegExp(`Curso ${a}`) }),
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Para começar' })
      .getByRole('link', { name: new RegExp(`Curso ${b}`) }),
  ).toBeVisible()
  // As regiões aparecem nesta ordem na página.
  const ordem = await page
    .locator('main section[aria-label]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(ordem.indexOf('Para começar')).toBeLessThan(
    ordem.indexOf('Concluídos'),
  )
})

test('a aluna sem nenhum curso vê o caminho para falar com a equipe', async ({
  page,
}) => {
  const email = `sem-curso-${unico()}@exemplo.test`
  cadastrarUsuario({ email })
  await entrarPorCodigo(page, email)
  await page.goto('/')
  await expect(page.getByText('Seus cursos aparecem aqui')).toBeVisible()
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Falar com a equipe' }),
  ).toHaveAttribute('href', '/atendimento')
  await expect(
    page.getByRole('region', { name: 'Continuar de onde parou' }),
  ).toHaveCount(0)
})

test('o ranking mostra o nome do colega, mas nunca o e-mail dele', async ({
  page,
}) => {
  const id = unico()
  const email = `ranking-eu-${id}@exemplo.test`
  const emailColega = `ranking-colega-${id}@exemplo.test`
  const colegaId = `e2e-${emailColega.replace(/\W/g, '-')}`
  cadastrarUsuario({ email, nome: 'Aluna Atual' })
  // Pontos altos de propósito: o ranking geral mostra só os 10 primeiros e o banco local acumula
  // pontos de outras rodadas.
  const nomeColega = `Colega do Ranking ${id}`
  cadastrarUsuario({ email: emailColega, nome: nomeColega })
  prepararCursoMatriculado(id, email)
  const sql = [
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mc-${id}', '${colegaId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO lancamento_de_pontos (id, user_id, curso_id, origem_tipo, pontos, motivo) VALUES ('l-${id}', '${colegaId}', 'c-${id}', 'avulso', 999999, 'Teste')`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao dar pontos: ${r.stderr}`)
  await entrarPorCodigo(page, email)

  for (const caminho of ['/ranking', `/ranking?curso=c-${id}`]) {
    const resposta = await page.goto(caminho)
    await expect(page.getByText(nomeColega).first()).toBeVisible()
    const html = (await resposta?.text()) ?? ''
    expect(html).not.toContain(emailColega)
    expect(await page.content()).not.toContain(emailColega)
  }
})
