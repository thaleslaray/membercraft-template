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

function tentativasGravadas(id: string): number {
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'd1',
      'execute',
      'escola',
      '--local',
      '--json',
      '--command',
      `SELECT COUNT(*) AS n FROM tentativa_do_quiz WHERE quiz_id = 'q-${id}'`,
    ],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao consultar: ${r.stderr}`)
  return JSON.parse(r.stdout)[0].results[0].n
}

test('enviar em branco mostra o aviso e não grava; preenchido, envia', async ({
  page,
}) => {
  const id = unico()
  const email = `quiz-obrig-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna Obrigatória' })
  prepararQuiz(id, email)
  await entrarPorCodigo(page, email)
  await page.goto(`/aulas/a-${id}`)
  const quiz = page.getByLabel('Exercício da aula')
  await esperarReact(quiz.getByRole('radio', { name: 'Azul' }))

  const enviar = quiz.getByRole('button', { name: 'Enviar respostas' })
  await enviar.click()
  await expect(quiz.getByText('Faltam 3 perguntas')).toBeVisible()
  await expect(quiz.getByText('Responda esta pergunta.')).toHaveCount(2)
  await expect(quiz.getByText('Envie o arquivo.')).toBeVisible()
  await expect(quiz.getByRole('radio', { name: 'Verde' })).toBeFocused()
  expect(tentativasGravadas(id)).toBe(0)
  await page.screenshot({
    path: '/tmp/quiz-obrigatorio.png',
    fullPage: true,
  })

  // Texto só com espaços continua pendente; o erro some quando a pergunta é respondida.
  await quiz.getByLabel('Resposta da pergunta 2').fill('   ')
  await quiz.getByRole('radio', { name: 'Azul' }).check()
  await expect(quiz.getByText('Faltam 2 perguntas')).toBeVisible()
  await enviar.click()
  await expect(quiz.getByText('Faltam 2 perguntas')).toBeVisible()

  await quiz.getByLabel('Resposta da pergunta 2').fill('Aprendi bastante.')
  await quiz.getByLabel('Arquivos da pergunta 3').setInputFiles({
    name: 'resultado.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('foto'),
  })
  await expect(quiz.getByText('resultado.txt')).toBeVisible()
  await expect(quiz.getByText(/Falta/)).toHaveCount(0)
  await enviar.click()
  await expect(quiz.getByText('Aguardando correção').first()).toBeVisible()
  expect(tentativasGravadas(id)).toBe(1)
})
