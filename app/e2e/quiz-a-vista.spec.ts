import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarReact,
  limparAparencia,
} from '#e2e/helpers'

// Aula com vídeo e quiz na casca Lume (Ateliê): a aba "Exercício" sozinha passava despercebida. A chamada
// abaixo das ações diz que a aula tem quiz e leva até ele; a aba ganha a marca de pendente.
const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

function semear(id: string, email: string, obrigatorio: boolean) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    'DELETE FROM aparencia',
    `INSERT INTO aparencia (id, tema, casca, mostrar_comunidade, atualizado_em) VALUES ('padrao', 'atelie', 'lume', 0, ${Date.now()})`,
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, vimeo_id, ordem) VALUES ('a-${id}', 'm-${id}', 'A101 - Elaborar o exercício de exemplo', '<p>Neste exercício você deverá criar um questionário de exemplo.</p><p>Você pode usar qualquer ferramenta para criar o seu questionário.</p>', '76979871', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO quiz (id, aula_id, so_quiz, obrigatorio, minimo_de_acertos, maximo_de_tentativas, pontos, sem_correcao) VALUES ('q-${id}', 'a-${id}', 0, ${obrigatorio ? 1 : 0}, 100, 2, 100, 0)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p1-${id}', 'q-${id}', 'unica', 'Qual é a cor primária?', 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1a-${id}', 'p1-${id}', 'Verde', 0, 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1b-${id}', 'p1-${id}', 'Azul', 1, 2)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p2-${id}', 'q-${id}', 'unica', 'E a secundária?', 2)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p2a-${id}', 'p2-${id}', 'Verde', 1, 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p2b-${id}', 'p2-${id}', 'Azul', 0, 2)`,
  ]
  const arquivo = path.join(os.tmpdir(), `quiz-a-vista-${id}.sql`)
  writeFileSync(arquivo, `${sql.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: raiz, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

test.afterAll(() => limparAparencia())

test('a aula avisa que tem quiz, leva até ele e mostra quando foi aprovado', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `quiz-a-vista-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(id, email, false)
  // O vídeo é do Vimeo; o teste não depende dele.
  await page.route('**player.vimeo.com/**', (rota) => rota.abort())
  await entrarPorCodigo(page, email)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`/aulas/a-${id}`)

  const principal = page.getByRole('main')
  const abaDoQuiz = principal.getByRole('tab', { name: /^Exercício/ })
  await expect(abaDoQuiz).toHaveAccessibleName(/Exercício.*para responder/)
  // O ponto de pendente pulsa de leve (um halo em volta dele).
  expect(
    await abaDoQuiz
      .locator('.ponto-pulsa')
      .evaluate((el) => getComputedStyle(el, '::after').animationName),
  ).toBe('ponto-halo')
  await expect(
    principal.getByText('Esta aula tem um exercício com 2 perguntas.').first(),
  ).toBeVisible()

  const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
  mkdirSync(pasta, { recursive: true })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(pasta, 'quiz-a-vista-computador.png'),
    fullPage: true,
  })

  // O botão abre a aba do quiz e põe o foco nela.
  const responder = principal
    .getByRole('button', { name: 'Responder o exercício' })
    .first()
  await esperarReact(responder)
  await responder.click()
  await expect(abaDoQuiz).toHaveAttribute('aria-selected', 'true')
  await expect(abaDoQuiz).toBeFocused()
  await expect(page).toHaveURL(/aba=quiz/)
  const quiz = principal.getByLabel('Exercício da aula')
  await expect(quiz.getByRole('radio', { name: 'Azul' }).first()).toBeVisible()
  // Já na aba do quiz, a chamada não oferece o botão de novo.
  await expect(
    principal.getByRole('button', { name: 'Responder o exercício' }),
  ).toHaveCount(0)

  // Aprovada: a chamada troca o texto e a marca de pendente sai da aba.
  await quiz.getByRole('radio', { name: 'Azul' }).first().check()
  await quiz.getByRole('radio', { name: 'Verde' }).nth(1).check()
  await quiz.getByRole('button', { name: 'Enviar respostas' }).click()
  await expect(principal.getByText('Exercício aprovado.')).toBeVisible()
  await expect(abaDoQuiz).toHaveAccessibleName('Exercício')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/aulas/a-${id}`)
  await expect(principal.getByText('Exercício aprovado.')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(pasta, 'quiz-a-vista-celular-aprovado.png'),
  })
})

test('quiz obrigatório: a chamada explica a trava e o botão vira a ação principal', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  const id = unico()
  const email = `quiz-a-vista-obrig-${id}@exemplo.test`
  cadastrarUsuario({ email })
  semear(id, email, true)
  await page.route('**player.vimeo.com/**', (rota) => rota.abort())
  await entrarPorCodigo(page, email)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/aulas/a-${id}`)

  const principal = page.getByRole('main')
  await expect(
    principal.getByText('Para concluir esta aula, seja aprovado no exercício.'),
  ).toBeVisible()
  await expect(
    principal.getByRole('button', { name: 'Concluir aula' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await expect(
    principal.getByRole('button', { name: 'Responder o exercício' }).first(),
  ).toBeVisible()

  const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
  mkdirSync(pasta, { recursive: true })
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(pasta, 'quiz-a-vista-celular-obrigatorio.png'),
    fullPage: true,
  })
})
