import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// Curso com uma aula de quiz (escolha única, texto livre e envio de arquivo) e a aluna matriculada.
// Aula de quiz com uma única pergunta de arquivo que só aceita foto, e a aluna matriculada.
function prepararQuiz(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO quiz (id, aula_id, so_quiz, obrigatorio, minimo_de_acertos, maximo_de_tentativas, pontos, sem_correcao) VALUES ('q-${id}', 'a-${id}', 0, 1, 100, 2, 100, 0)`,
    `INSERT INTO pergunta_do_quiz (id, quiz_id, tipo, enunciado, aceita, ordem) VALUES ('p1-${id}', 'q-${id}', 'arquivo', 'Envie a foto do resultado.', 'imagem', 1)`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o quiz: ${r.stderr}`)
}

// 1x1 PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test('pergunta de foto recusa PDF e aceita PNG', async ({ page }) => {
  const id = unico()
  const email = `quiz-tipo-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna do Tipo' })
  prepararQuiz(id, email)

  await entrarPorCodigo(page, email)
  await page.goto(`/aulas/a-${id}`)
  const quiz = page.getByLabel('Exercício da aula')
  const campo = quiz.getByLabel('Arquivos da pergunta 1')
  await esperarReact(campo)
  await expect(quiz.getByText('Envie de 1 a 3 fotos.')).toBeVisible()
  await expect(campo).toHaveAttribute('accept', /image\/\*/)

  await campo.setInputFiles({
    name: 'resultado.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 teste'),
  })
  await expect(
    quiz.getByText('Esta pergunta pede foto. Envie uma imagem (JPG, PNG…)'),
  ).toBeVisible()
  await expect(quiz.getByText('resultado.pdf')).toHaveCount(0)
  await page.screenshot({
    path: '/tmp/quiz-tipo-arquivo.png',
  })

  await campo.setInputFiles({
    name: 'resultado.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(quiz.getByText('resultado.png')).toBeVisible()
  await expect(quiz.getByText('Esta pergunta pede foto.')).toHaveCount(0)
})
