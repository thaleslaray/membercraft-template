import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Curso com uma aula de quiz (escolha única, texto livre e envio de arquivo) e a aluna matriculada.
function prepararQuiz(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO quiz (id, aula_id, so_quiz, obrigatorio, minimo_de_acertos, maximo_de_tentativas, pontos, sem_correcao) VALUES ('q-${id}', 'a-${id}', 0, 1, 100, 2, 100, 0)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p1-${id}', 'q-${id}', 'unica', 'Qual é a cor primária?', 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1a-${id}', 'p1-${id}', 'Verde', 0, 1)`,
    `INSERT INTO alternativa_da_pergunta (id, pergunta_id, texto, correta, ordem) VALUES ('p1b-${id}', 'p1-${id}', 'Azul', 1, 2)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p2-${id}', 'q-${id}', 'texto_livre', 'Conte o que aprendeu.', 2)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, ordem) VALUES ('p3-${id}', 'q-${id}', 'arquivo', 'Envie a foto do resultado.', 3)`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o quiz: ${r.stderr}`)
}

test('a aluna entrega o quiz, a equipe corrige na fila e a aluna vê a aprovação', async ({
  browser,
}) => {
  const id = unico()
  const emailAluna = `quiz-aluna-${id}@exemplo.test`
  const emailEquipe = `quiz-equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: emailAluna, nome: 'Aluna da Entrega' })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  prepararQuiz(id, emailAluna)

  // A aluna responde as três perguntas e envia.
  const contextoAluna = await browser.newContext()
  const aluna = await contextoAluna.newPage()
  await entrarPorCodigo(aluna, emailAluna)
  await aluna.goto(`/aulas/a-${id}`)
  const quiz = aluna.getByLabel('Exercício da aula')
  await esperarReact(quiz.getByRole('radio', { name: 'Azul' }))
  await quiz.getByRole('radio', { name: 'Azul' }).check()
  await quiz
    .getByLabel('Resposta da pergunta 2')
    .fill('Aprendi a misturar as tintas.')
  await quiz.getByLabel('Arquivos da pergunta 3').setInputFiles({
    name: 'resultado.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('foto do resultado'),
  })
  await expect(quiz.getByText('resultado.txt')).toBeVisible()
  await quiz.getByRole('button', { name: 'Enviar respostas' }).click()

  // Fica "Aguardando correção" e a aluna não refaz.
  await expect(quiz.getByText('Aguardando correção').first()).toBeVisible()
  await expect(
    quiz.getByRole('button', { name: 'Enviar respostas' }),
  ).toHaveCount(0)

  // A equipe vê a entrega na fila, baixa o arquivo e marca cada resposta com comentário.
  const contextoEquipe = await browser.newContext()
  const equipe = await contextoEquipe.newPage()
  await entrarPorCodigo(equipe, emailEquipe)
  await equipe.goto('/painel/correcao')
  const entrega = equipe.getByRole('listitem').filter({ hasText: `Aula ${id}` })
  await expect(entrega.getByText('Aluna da Entrega')).toBeVisible()
  await expect(entrega.getByText('Aprendi a misturar as tintas.')).toBeVisible()
  const link = entrega.getByRole('link', { name: /resultado\.txt/ })
  const href = await link.getAttribute('href')
  const baixado = await equipe.request.get(href ?? '')
  expect(baixado.status()).toBe(200)
  expect(await baixado.text()).toBe('foto do resultado')
  // Quem não está logado não baixa.
  const anonimo = await browser.newContext()
  expect(
    (
      await anonimo.request.get(new URL(href ?? '', equipe.url()).href)
    ).status(),
  ).toBe(401)
  await anonimo.close()

  const texto = entrega.getByRole('region', { name: 'Conte o que aprendeu.' })
  await esperarReact(texto.getByRole('button', { name: 'Certa' }))
  await texto.getByLabel(/Comentário sobre/).fill('Muito bom, continue assim.')
  await texto.getByRole('button', { name: 'Certa' }).click()
  await expect(texto.getByText('Certa', { exact: true }).first()).toBeVisible()
  await entrega
    .getByRole('region', { name: 'Envie a foto do resultado.' })
    .getByRole('button', { name: 'Certa' })
    .click()
  // Corrigida a última resposta, a entrega sai da fila (o banco local pode ter outras).
  await expect(entrega).toHaveCount(0)
  await contextoEquipe.close()

  // A aluna vê a aprovação e o comentário.
  await aluna.reload()
  const depois = aluna.getByLabel('Exercício da aula')
  await expect(depois.getByText('Aprovado', { exact: true })).toBeVisible()
  await expect(
    depois.getByText('Comentário da equipe: Muito bom, continue assim.'),
  ).toBeVisible()
  await contextoAluna.close()
})
