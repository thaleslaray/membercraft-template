import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// PNG de 2x1 pixel: serve de fundo do certificado.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkMAgH+Hnm0AAAAAElFTkSuQmCC',
  'base64',
)

// Curso com uma aula só de texto e a aluna matriculada (sem modelo de certificado ainda).
function prepararCurso(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem) VALUES ('c-${id}', 'Curso ${id}', 9000)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
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

test('a equipe ativa o modelo, a aluna confirma o nome e conclui, e o certificado é validado na página pública', async ({
  browser,
}) => {
  const id = unico()
  const emailAluna = `cert-aluna-${id}@exemplo.test`
  const emailEquipe = `cert-equipe-${id}@exemplo.test`
  const emailDona = `cert-dona-${id}@exemplo.test`
  cadastrarUsuario({ email: emailAluna, nome: 'Aluna do Certificado' })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  cadastrarUsuario({ email: emailDona, perfil: 'proprietario' })
  prepararCurso(id, emailAluna)

  // A equipe envia a imagem da frente, ativa o modelo e confere a prévia em PDF.
  const contextoEquipe = await browser.newContext()
  const equipe = await contextoEquipe.newPage()
  await entrarPorCodigo(equipe, emailEquipe)
  await equipe.goto(`/painel/certificado/c-${id}`)
  const envio = equipe.getByLabel(
    'Escolher arquivo: Imagem da frente (PNG ou JPEG)',
  )
  await esperarReact(envio)
  await envio.setInputFiles({
    name: 'frente.png',
    mimeType: 'image/png',
    buffer: PNG,
  })
  await expect(
    equipe.getByAltText('Modelo do certificado, frente'),
  ).toBeVisible()
  await expect(
    equipe.getByRole('button', { name: 'Arrastar Nome do aluno' }),
  ).toBeVisible()
  await equipe.getByLabel('Horizontal (%)').fill('40')
  await equipe.getByLabel(/Modelo ativo/).check()
  await equipe.getByRole('button', { name: 'Salvar' }).click()
  await expect(equipe.getByText(/Certificado salvo/)).toBeVisible()

  // O modelo foi salvo e a prévia sai como PDF de verdade.
  const recarregado = await equipe.reload()
  expect(recarregado?.status()).toBe(200)
  await expect(equipe.getByLabel(/Modelo ativo/)).toBeChecked()
  await expect(equipe.getByLabel('Horizontal (%)')).toHaveValue('40')
  const chave = (
    await equipe
      .getByAltText('Modelo do certificado, frente')
      .getAttribute('src')
  )?.replace('/api/imagens/', '')
  const previa = await equipe.request.post('/api/painel/certificados/previa', {
    data: { frente: chave, verso: null, campos: [] },
  })
  expect(previa.status()).toBe(200)
  expect(previa.headers()['content-type']).toContain('application/pdf')
  expect((await previa.body()).subarray(0, 5).toString()).toBe('%PDF-')

  // A aluna ainda não cumpriu: a página do curso diz o que falta e o nome é confirmado antes.
  const contextoAluna = await browser.newContext()
  const aluna = await contextoAluna.newPage()
  await entrarPorCodigo(aluna, emailAluna)
  await aluna.goto(`/cursos/c-${id}`)
  await expect(
    aluna.getByText('Falta 1 aula para o seu certificado.'),
  ).toBeVisible()
  await aluna.goto('/certificados')
  const nome = aluna.getByLabel('Nome no certificado')
  await esperarReact(nome)
  await nome.fill('Aluna do Certificado Souza')
  await aluna.getByRole('button', { name: 'Confirmar nome' }).click()
  await expect(aluna.getByLabel('Nome no certificado')).toHaveCount(0)

  // Concluir a única aula cumpre a exigência: o certificado sai na hora.
  await aluna.goto(`/aulas/a-${id}`)
  const concluir = aluna.getByRole('button', { name: 'Concluir aula' })
  await esperarReact(concluir)
  // A única aula fecha o curso: abre a tela de conclusão, que a aluna fecha para ficar na aula.
  await expect(async () => {
    await concluir.click()
    await expect(
      aluna.getByRole('dialog', { name: 'Curso concluído' }),
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  // A conclusão mostra a prévia com o nome confirmado e, quando o PDF sai da fila, o botão de baixar.
  const conclusao = aluna.getByRole('dialog', { name: 'Curso concluído' })
  const previaDaConclusao = conclusao.getByTestId('previa-do-certificado')
  await expect(previaDaConclusao).toBeVisible()
  await expect(previaDaConclusao).toContainText('Aluna do Certificado Souza')
  await expect(
    conclusao.getByRole('link', { name: 'Baixar certificado' }),
  ).toBeVisible({ timeout: 40_000 })
  await expect(conclusao.getByText(/certificado do MEC/)).toHaveCount(0)
  await aluna.getByRole('button', { name: 'Ficar nesta aula' }).click()
  await expect(aluna.getByRole('button', { name: 'Concluída' })).toBeVisible()

  // "Gerando" até a fila produzir o PDF; depois o aluno baixa.
  const cartao = aluna.getByRole('listitem').filter({ hasText: `Curso ${id}` })
  await expect(async () => {
    await aluna.goto('/certificados')
    await expect(cartao.getByText('Pronto', { exact: true })).toBeVisible({
      timeout: 1500,
    })
  }).toPass({ timeout: 40_000 })
  const href = await cartao
    .getByRole('link', { name: 'Baixar PDF' })
    .getAttribute('href')
  const pdf = await aluna.request.get(href ?? '')
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()['content-type']).toContain('application/pdf')
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-')
  const codigo = (await cartao.textContent())?.match(
    /código ([A-Z0-9]{4}-[A-Z0-9]{4})/,
  )?.[1]
  expect(codigo).toBeTruthy()
  // Baixar o PDF exige estar logado e ser o dono.
  const anonimo = await browser.newContext()
  expect(
    (await anonimo.request.get(new URL(href ?? '', aluna.url()).href)).status(),
  ).toBe(401)

  // Página pública: qualquer pessoa vê nome, curso, data e "válido".
  const publica = await anonimo.newPage()
  await publica.goto(`/validar/${codigo}`)
  await expect(
    publica.getByRole('heading', { name: 'Certificado válido' }),
  ).toBeVisible()
  await expect(publica.getByText('Aluna do Certificado Souza')).toBeVisible()
  await expect(publica.getByText(`Curso ${id}`)).toBeVisible()
  await publica.goto('/validar/ZZZZ-9999')
  await expect(
    publica.getByRole('heading', { name: 'Certificado não encontrado' }),
  ).toBeVisible()

  // Só o Proprietário revoga: a equipe não vê o botão; a Proprietária revoga com motivo.
  const aqui2 = `/painel/alunos/e2e-${emailAluna.replace(/\W/g, '-')}`
  await equipe.goto(aqui2)
  await expect(equipe.getByText('Certificados', { exact: true })).toBeVisible()
  await expect(equipe.getByRole('button', { name: 'Revogar' })).toHaveCount(0)
  await contextoEquipe.close()

  const contextoDona = await browser.newContext()
  const dona = await contextoDona.newPage()
  await entrarPorCodigo(dona, emailDona)
  await dona.goto(aqui2)
  const motivo = dona.getByLabel('Motivo da revogação')
  await esperarReact(motivo)
  await motivo.fill('Emitido por engano')
  await dona.getByRole('button', { name: 'Revogar' }).click()
  await dona
    .getByRole('dialog')
    .getByRole('button', { name: 'Revogar' })
    .click()
  await expect(
    dona.getByText('Emitido por engano', { exact: false }).first(),
  ).toBeVisible()
  await contextoDona.close()

  await publica.goto(`/validar/${codigo}`)
  await expect(
    publica.getByRole('heading', { name: 'Certificado revogado' }),
  ).toBeVisible()
  await anonimo.close()
  await contextoAluna.close()
})

// Curso com modelo ativo já pronto (sem passar pelo editor), com a aula única e a aluna matriculada.
// `pontosMinimos` acima de zero deixa uma exigência que a aula sozinha não cumpre.
// A aula concluída dá 50 pontos: com 5.000 de mínimo, faltam 4.950.
function prepararCursoComModelo(
  id: string,
  email: string,
  pontosMinimos: number,
) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const sql = [
    `INSERT INTO curso (id, nome, ordem, certificado_pontos_minimos) VALUES ('c-${id}', 'Curso ${id}', 9000, ${pontosMinimos})`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}', '${userId}', 't-${id}', 'ativa', ${Date.now() - 86_400_000})`,
    `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${id}', 'c-${id}', 1, 'conteudo/imagens/modelo/${id}.png', '[]')`,
  ].join('; ')
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao preparar o curso: ${r.stderr}`)
}

async function concluirOCursoUnico(aluna: Page, id: string) {
  await aluna.goto(`/aulas/a-${id}`)
  const concluir = aluna.getByRole('button', { name: 'Concluir aula' })
  await esperarReact(concluir)
  await expect(async () => {
    await concluir.click()
    await expect(
      aluna.getByRole('dialog', { name: 'Curso concluído' }),
    ).toBeVisible({ timeout: 2000 })
  }).toPass()
  return aluna.getByRole('dialog', { name: 'Curso concluído' })
}

test('a conclusão leva à confirmação do nome, sem prévia, e diz o que falta, sem prévia', async ({
  browser,
}) => {
  const id = unico()
  const emailNome = `cert-nome-${id}@exemplo.test`
  const emailFalta = `cert-falta-${id}@exemplo.test`
  cadastrarUsuario({ email: emailNome, nome: 'Aluna Sem Nome' })
  cadastrarUsuario({ email: emailFalta, nome: 'Aluna Com Falta' })
  prepararCursoComModelo(`n${id}`, emailNome, 0)
  prepararCursoComModelo(`f${id}`, emailFalta, 5000)

  const contextoNome = await browser.newContext()
  const semNome = await contextoNome.newPage()
  await entrarPorCodigo(semNome, emailNome)
  const dialogoDoNome = await concluirOCursoUnico(semNome, `n${id}`)
  await expect(
    dialogoDoNome.getByText('Falta confirmar como o seu nome sai'),
  ).toBeVisible()
  await expect(dialogoDoNome.getByTestId('previa-do-certificado')).toHaveCount(
    0,
  )
  await dialogoDoNome.getByRole('link', { name: 'Confirmar nome' }).click()
  await expect(semNome).toHaveURL(/\/certificados/)
  await expect(semNome.getByLabel('Nome no certificado')).toBeVisible()

  const contextoFalta = await browser.newContext()
  const comFalta = await contextoFalta.newPage()
  await entrarPorCodigo(comFalta, emailFalta)
  const dialogoDaFalta = await concluirOCursoUnico(comFalta, `f${id}`)
  await expect(
    dialogoDaFalta.getByText('Faltam 4.950 pontos para o seu certificado.'),
  ).toBeVisible()
  await expect(dialogoDaFalta.getByTestId('previa-do-certificado')).toHaveCount(
    0,
  )
  await contextoNome.close()
  await contextoFalta.close()
})
