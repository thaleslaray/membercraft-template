import { expect, test } from '@playwright/test'
import {
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
  vencerMatriculasDe,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test('a equipe matricula em lote, o aluno vê o curso, o acesso expira e a equipe reativa', async ({
  page,
  browser,
}) => {
  const id = unico()
  const equipe = `equipe-${id}@exemplo.test`
  const ana = `ana-${id}@exemplo.test`
  const bia = `bia-${id}@exemplo.test`
  const novoEmail = `ana-nova-${id}@exemplo.test`
  cadastrarUsuario({ email: equipe, perfil: 'equipe' })
  await entrarPorCodigo(page, equipe)

  // Curso "para todos" (com página de vendas) e uma turma com prazo.
  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await page.getByLabel('Mostrar a todos na vitrine').click()
  await page
    .getByLabel('URL da página de vendas')
    .fill('https://loja.exemplo.test/curso')
  await page.getByRole('button', { name: 'Salvar curso' }).click()
  await expect(page.getByText('Curso salvo.').last()).toBeVisible()

  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`, 365)
  await expect(page.getByText('Acesso: 365 dias')).toBeVisible()

  // Matrícula manual em lote: dois e-mails (um com nome) e uma linha inválida.
  await page.goto('/painel/matricular')
  await esperarReact(page.getByLabel('E-mails dos alunos'))
  await page
    .getByLabel('Turma', { exact: true })
    .selectOption({ label: `Curso ${id} · Turma ${id}` })
  await page
    .getByLabel('E-mails dos alunos')
    .fill(`${ana}, Ana Souza\n${bia}\nisto-nao-e-email`)
  await page.getByRole('button', { name: 'Matricular' }).click()
  const resumo = page.getByLabel('Resumo da matrícula manual')
  await expect(resumo.getByText('Matriculados: 2')).toBeVisible()
  await expect(resumo.getByText('Contas criadas: 2')).toBeVisible()
  await expect(resumo.getByText('E-mails inválidos: 1')).toBeVisible()

  // De novo: já matriculados.
  await page.getByLabel('E-mails dos alunos').fill(ana)
  await page.getByRole('button', { name: 'Matricular' }).click()
  await expect(resumo.getByText('Já matriculados: 1')).toBeVisible()

  // A aluna entra, aceita os termos e vê o curso.
  const contexto = await browser.newContext()
  const aluna = await contexto.newPage()
  await entrarPorCodigo(aluna, ana)
  await expect(aluna).toHaveURL(/\/primeiro-acesso/)
  await expect(async () => {
    const caixa = aluna.getByRole('checkbox')
    if ((await caixa.getAttribute('data-state')) !== 'checked') {
      await caixa.click()
    }
    await expect(aluna.getByRole('button', { name: 'Continuar' })).toBeEnabled({
      timeout: 1000,
    })
  }).toPass()
  await aluna.getByRole('button', { name: 'Continuar' }).click()
  await expect(aluna).toHaveURL(/\/$/)
  await expect(
    aluna.getByRole('link', { name: new RegExp(`Curso ${id}`) }),
  ).toHaveAttribute('href', /\/cursos\//)

  // O acesso expira: ela continua entrando, vê o cadeado e o link de vendas.
  vencerMatriculasDe(ana)
  await aluna.goto('/')
  const cartao = aluna.getByRole('link', { name: new RegExp(`Curso ${id}`) })
  await expect(cartao).toContainText('Acesso expirado')
  await expect(cartao).toHaveAttribute(
    'href',
    'https://loja.exemplo.test/curso',
  )

  // A equipe abre o perfil dela, reativa e troca o e-mail.
  await page.goto('/painel/alunos')
  await esperarReact(page.getByLabel('Buscar aluno'))
  await page.getByLabel('Buscar aluno').fill(ana)
  await page.getByRole('button', { name: 'Buscar' }).click()
  await page.getByRole('link', { name: new RegExp(ana) }).click()
  const matricula = page.getByLabel(`Matrícula em Curso ${id} · Turma ${id}`)
  await expect(matricula.getByText('Expirada')).toBeVisible()
  await expect(matricula.getByText(/Matrícula manual por/)).toBeVisible()
  await matricula.getByRole('button', { name: 'Reativar' }).click()
  await expect(page.getByText('Matrícula reativada.')).toBeVisible()
  await expect(matricula.getByText('Ativa')).toBeVisible()

  await aluna.goto('/')
  await expect(
    aluna.getByRole('link', { name: new RegExp(`Curso ${id}`) }),
  ).toHaveAttribute('href', /\/cursos\//)

  await page.getByLabel('Novo e-mail do aluno').fill(novoEmail)
  await page.getByRole('button', { name: 'Trocar e-mail' }).click()
  await expect(page.getByRole('dialog')).toContainText(novoEmail)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Trocar e-mail' })
    .click()
  await expect(page.getByText(/E-mail trocado/)).toBeVisible()
  await expect(page.getByText(novoEmail).first()).toBeVisible()
  await contexto.close()

  // Encerrar deixa a matrícula inativa.
  await matricula.getByRole('button', { name: 'Encerrar' }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Encerrar' })
    .click()
  await expect(matricula.getByText('Inativa')).toBeVisible()
})
