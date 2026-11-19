import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, expect, type Page, test } from '@playwright/test'
import {
  cadastrarUsuario,
  entrarPorCodigo,
  esperarNoLog,
  esperarReact,
} from '#e2e/helpers'

// PNG de 2x1 pixel: serve de fundo do certificado.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAD0lEQVR4nGP8z8Dwn4EBAAkMAgH+Hnm0AAAAAElFTkSuQmCC',
  'base64',
)

const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const idDe = (email: string) => `e2e-${email.replace(/\W/g, '-')}`

function sqlLocal(sql: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no D1 local: ${r.stderr}`)
}

// Curso que gera Pedido do MEC, com uma aula de texto e as duas alunas
// matriculadas, com o nome já confirmado (a emissão não espera a confirmação).
function prepararCurso(id: string, emails: string[]) {
  const agora = Date.now()
  const sql = [
    `INSERT INTO curso (id, nome, ordem, gera_pedido_do_mec) VALUES ('c-${id}', 'Formação ${id}', 9000, 1)`,
    `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m-${id}', 'c-${id}', 'Módulo ${id}', 1)`,
    `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a-${id}', 'm-${id}', 'Aula ${id}', '<p>Texto</p>', 1)`,
    `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${id}', 'c-${id}', 'Turma ${id}')`,
    ...emails.flatMap((email, i) => [
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${id}-${i}', '${idDe(email)}', 't-${id}', 'ativa', ${agora - 86_400_000})`,
      `UPDATE user SET nome_no_certificado = name, nome_confirmado_em = ${agora} WHERE id = '${idDe(email)}'`,
    ]),
  ].join('; ')
  sqlLocal(sql)
}

async function entrar(browser: Browser, email: string): Promise<Page> {
  const contexto = await browser.newContext()
  const page = await contexto.newPage()
  await entrarPorCodigo(page, email)
  return page
}

async function concluirAula(aluna: Page, id: string) {
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
  // Na Formação, a conclusão lembra que o certificado do MEC vem depois, pela Voomp.
  await expect(
    aluna
      .getByRole('dialog', { name: 'Curso concluído' })
      .getByText('O certificado do MEC é emitido depois, pela Voomp.'),
  ).toBeVisible()
  await aluna.getByRole('button', { name: 'Ficar nesta aula' }).click()
  await expect(aluna.getByRole('button', { name: 'Concluída' })).toBeVisible()
}

test('a emissão abre o pedido do MEC; a equipe libera com o link, marca problema (com Atendimento) e tenta de novo', async ({
  browser,
}) => {
  const id = unico()
  const emailAna = `mec-ana-${id}@exemplo.test`
  const emailBia = `mec-bia-${id}@exemplo.test`
  const emailEquipe = `mec-equipe-${id}@exemplo.test`
  cadastrarUsuario({ email: emailAna, nome: `Ana Mec ${id}` })
  cadastrarUsuario({ email: emailBia, nome: `Bia Mec ${id}` })
  cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
  prepararCurso(id, [emailAna, emailBia])

  const equipe = await entrar(browser, emailEquipe)

  // A equipe envia a imagem da frente e ativa o modelo do curso (sem ele não há certificado).
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
  await equipe.getByLabel(/Modelo ativo/).check()
  await equipe.getByRole('button', { name: 'Salvar' }).click()
  await expect(equipe.getByText(/Certificado salvo/)).toBeVisible()

  const ana = await entrar(browser, emailAna)
  const bia = await entrar(browser, emailBia)

  // 1. Concluir a única aula emite o certificado: o pedido nasce Na fila e a aluna vê "Em liberação".
  await concluirAula(ana, id)
  await concluirAula(bia, id)
  const cartaoDe = (aluna: Page) =>
    aluna.getByRole('listitem').filter({ hasText: `Formação ${id}` })
  for (const aluna of [ana, bia]) {
    await expect(async () => {
      await aluna.goto('/certificados')
      await expect(
        cartaoDe(aluna).getByText('Em liberação', { exact: true }),
      ).toBeVisible({ timeout: 1500 })
    }).toPass({ timeout: 40_000 })
  }

  const pedidoDe = (nome: string) =>
    equipe.getByRole('listitem').filter({ hasText: nome })
  // A fila pagina e o banco local acumula pedidos de outras rodadas: procura o pedido página a página.
  const abrirPedido = async (estado: string, nome: string) => {
    for (let pagina = 1; pagina <= 30; pagina++) {
      const busca = new URLSearchParams()
      if (estado !== 'na_fila') busca.set('estado', estado)
      if (pagina > 1) busca.set('pagina', String(pagina))
      const q = busca.toString()
      await equipe.goto(`/painel/certificado-do-mec${q ? `?${q}` : ''}`)
      await expect(
        equipe.getByRole('heading', { name: 'Certificado do MEC' }),
      ).toBeVisible()
      if ((await pedidoDe(nome).count()) > 0) return true
      // Página sem nenhum pedido: acabou a lista.
      if ((await pedidoDe('· certificado').count()) === 0) return false
    }
    return false
  }
  expect(await abrirPedido('na_fila', `Bia Mec ${id}`)).toBe(true)
  await expect(pedidoDe(`Bia Mec ${id}`)).toContainText('na fila desde')
  expect(await abrirPedido('na_fila', `Ana Mec ${id}`)).toBe(true)
  await expect(pedidoDe(`Ana Mec ${id}`)).toContainText(
    `Formação ${id} · certificado`,
  )
  await expect(pedidoDe(`Ana Mec ${id}`)).toContainText('na fila desde')

  // 2. A equipe marca liberado com o link da Voomp.
  const link = `https://voomp.example.test/certificado/${id}`
  const pedidoAna = pedidoDe(`Ana Mec ${id}`)
  const campoLink = pedidoAna.getByLabel('Link da Voomp')
  await esperarReact(campoLink)
  await campoLink.fill(link)
  await pedidoAna.getByRole('button', { name: 'Marcar liberado' }).click()
  await expect(
    equipe.getByText('Pedido liberado. A aluna foi avisada.'),
  ).toBeVisible()

  expect(await abrirPedido('liberado', `Ana Mec ${id}`)).toBe(true)
  await expect(pedidoDe(`Ana Mec ${id}`)).toContainText('liberado em')
  await expect(
    pedidoDe(`Ana Mec ${id}`).getByRole('link', { name: 'Link na Voomp' }),
  ).toHaveAttribute('href', link)

  // A aluna vê "liberado em dd/mm" e o botão aponta para o link.
  await ana.goto('/certificados')
  await expect(
    cartaoDe(ana).getByText(/Liberado em \d{2}\/\d{2}/),
  ).toBeVisible()
  await expect(
    cartaoDe(ana).getByRole('link', { name: 'Abrir na Voomp' }),
  ).toHaveAttribute('href', link)
  await expect(cartaoDe(ana).getByText('Em liberação')).toHaveCount(0)

  // O e-mail "Certificado do MEC liberado" saiu pela fila (log do dev) e está no histórico da aluna.
  await esperarNoLog(
    new RegExp(
      `para: ${emailAna} \\| assunto: Seu certificado do MEC foi liberado`,
    ),
    30_000,
  )
  await equipe.goto(`/painel/alunos/${idDe(emailAna)}`)
  await expect(
    equipe
      .getByLabel('E-mails enviados')
      .getByText('Certificado do MEC liberado'),
  ).toBeVisible()

  // 3. Na outra aluna, a equipe marca problema com motivo: abre o Atendimento.
  expect(await abrirPedido('na_fila', `Ana Mec ${id}`)).toBe(false)
  expect(await abrirPedido('na_fila', `Bia Mec ${id}`)).toBe(true)
  const pedidoBia = pedidoDe(`Bia Mec ${id}`)
  await esperarReact(pedidoBia.getByLabel('Link da Voomp'))
  await pedidoBia.getByRole('button', { name: 'Marcar problema' }).click()
  const motivo = `Falta o CPF no cadastro ${id}`
  await pedidoBia.getByLabel(/^Motivo/).fill(motivo)
  await pedidoBia
    .getByRole('button', { name: 'Registrar problema e abrir Atendimento' })
    .click()
  await expect(
    equipe.getByText(
      'Problema registrado. Abrimos um Atendimento com a aluna.',
    ),
  ).toBeVisible()

  expect(await abrirPedido('problema', `Bia Mec ${id}`)).toBe(true)
  await expect(pedidoDe(`Bia Mec ${id}`)).toContainText(motivo)
  await expect(
    pedidoDe(`Bia Mec ${id}`).getByRole('link', {
      name: 'Abrir o Atendimento',
    }),
  ).toBeVisible()

  // A aluna tem a conversa aberta no Atendimento, com o motivo.
  await bia.goto('/atendimento')
  await expect(bia.getByText('Seu certificado do MEC')).toBeVisible()
  await bia.getByText('Seu certificado do MEC').click()
  await expect(bia.getByText(motivo, { exact: false })).toBeVisible()
  // Com problema, a aluna segue vendo "Em liberação".
  await bia.goto('/certificados')
  await expect(
    cartaoDe(bia).getByText('Em liberação', { exact: true }),
  ).toBeVisible()

  // "Tentar de novo" devolve o pedido para a fila.
  expect(await abrirPedido('problema', `Bia Mec ${id}`)).toBe(true)
  const botao = pedidoDe(`Bia Mec ${id}`).getByRole('button', {
    name: 'Tentar de novo',
  })
  await esperarReact(botao)
  await botao.click()
  await expect(equipe.getByText('O pedido voltou para a fila.')).toBeVisible()
  expect(await abrirPedido('na_fila', `Bia Mec ${id}`)).toBe(true)
  await expect(pedidoDe(`Bia Mec ${id}`)).toContainText('na fila desde')
  await expect(pedidoDe(`Bia Mec ${id}`)).not.toContainText(motivo)

  for (const p of [ana, bia, equipe]) await p.context().close()
})
