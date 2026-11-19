import { expect, test } from '@playwright/test'
import {
  abrirQuemCompra,
  cadastrarUsuario,
  criarEdicaoDoCurso,
  entrarPorCodigo,
  esperarReact,
  marcarCursoNoProduto,
} from '#e2e/helpers'

const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

// A API da Hotmart é o servidor falso de e2e/hotmart-falsa.mjs (HOTMART_URL_DE_TESTE no .dev.vars).
test('o Proprietário liga produto e oferta da Hotmart a turmas, com a lista vinda da API', async ({
  page,
}) => {
  const id = unico()
  const email = `dono-${id}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'proprietario' })
  await entrarPorCodigo(page, email)

  // Credenciais (valores quaisquer: quem responde é o servidor falso).
  await page.goto('/painel/vendas/plataformas')
  await esperarReact(page.getByLabel('Client ID'))
  await page.getByLabel('Client ID').fill('cid-e2e')
  await page.getByLabel('Client Secret').fill('csecret-e2e')
  await page.getByLabel('Client Token').fill('basic-e2e')
  await page.getByLabel('Hottok (assinatura do webhook)').fill('hottok-e2e')
  await page.getByRole('button', { name: 'Salvar credenciais' }).click()
  await expect(page.getByText('Credenciais salvas.')).toBeVisible()

  // Uma turma para ligar.
  await page.goto('/painel/conteudo')
  await esperarReact(page.getByLabel('Nome do novo curso'))
  await page.getByLabel('Nome do novo curso').fill(`Curso ${id}`)
  await page.getByRole('button', { name: 'Criar curso' }).click()
  await expect(page).toHaveURL(/\/painel\/conteudo\/[\w-]+$/)
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Turma ${id}`)

  // A aba Quem compra é só leitura: sem "Adicionar produto" e com o aviso de turma sem compra.
  await expect(
    page.getByText('Nenhuma compra libera esta edição.'),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Adicionar produto' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Mudar em Vendas → Produtos' }),
  ).toBeVisible()

  // Vendas › Produtos: a lista vem da API (2 páginas); assinatura não aparece.
  const nomeDoCurso = `Curso ${id}`
  await marcarCursoNoProduto(page, nomeDoCurso, '698441', 'bf2026x')
  await expect(page.getByText('Combo Falso')).toBeVisible()
  await expect(page.getByText('Assinatura Falsa')).toHaveCount(0)
  await expect(page.getByText('Black Friday falsa')).toBeVisible()

  // Recarregando, a oferta ligada já aparece com o nome, sem clicar em "Ver ofertas".
  await page.reload()
  await expect(
    page.getByText('Black Friday falsa', { exact: false }).first(),
  ).toBeVisible()
  await expect(page.getByText('Oferta · bf2026x')).toHaveCount(0)

  // Combo (qualquer oferta do produto inteiro) e desmarcar.
  await marcarCursoNoProduto(page, nomeDoCurso, '4319408')
  const combo = page.getByRole('region', { name: /· 4319408$/ })
  const caixaDoCombo = combo
    .getByRole('list', { name: 'Cursos de qualquer oferta' })
    .getByRole('checkbox', { name: nomeDoCurso })
  await caixaDoCombo.click()
  await expect(caixaDoCombo).not.toBeChecked()
  await expect(caixaDoCombo).toBeEnabled()

  // Marcar em "Qualquer oferta" deixa a caixinha da oferta marcada e travada.
  await marcarCursoNoProduto(page, nomeDoCurso, '698441')
  const produto = page.getByRole('region', { name: /· 698441$/ })
  const daOferta = produto
    .getByRole('list', { name: 'Cursos da oferta bf2026x' })
    .getByRole('checkbox', { name: nomeDoCurso })
  await expect(daOferta).toBeChecked()
  await expect(daOferta).toBeDisabled()
  await expect(daOferta).toHaveAccessibleName(/já vem em qualquer oferta/)

  // A aba do curso mostra o que libera, em leitura.
  await abrirQuemCompra(page, nomeDoCurso)
  await expect(
    page.getByText(/Liberado por: Curso Falso A \(698441\) · Todas as ofertas/),
  ).toBeVisible()
  await expect(
    page.getByText(/Liberado por: Curso Falso A \(698441\) · Oferta bf2026x/),
  ).toBeVisible()
  await expect(
    page.getByText('Nenhuma compra libera esta edição.'),
  ).toHaveCount(0)

  // Segunda edição (nome e prazo): com duas, a aba mostra um bloco por edição; editar e voltar a vitalício.
  await criarEdicaoDoCurso(page, `Curso ${id}`, `Segunda ${id}`, 15)
  await expect(page.getByText('Acesso: 15 dias')).toBeVisible()
  await page
    .getByRole('button', { name: `Editar a edição Segunda ${id}` })
    .click()
  const edicao = page.getByRole('form', { name: 'Editar edição' })
  await edicao.getByLabel('Nome da edição').fill(`Segunda ${id} editada`)
  await edicao.getByLabel('Acesso (dias)').fill('')
  await edicao.getByRole('button', { name: 'Salvar' }).click()
  await expect(page.getByText('Edição atualizada.')).toBeVisible()
  await expect(page.getByText(`Segunda ${id} editada`)).toBeVisible()
})

test('quem não é Proprietário é barrado da tela de ligações da Hotmart', async ({
  page,
}) => {
  const email = `equipe-${unico()}@exemplo.test`
  cadastrarUsuario({ email, perfil: 'equipe' })
  await entrarPorCodigo(page, email)
  await page.goto('/painel/vendas/produtos')
  await expect(page).not.toHaveURL(/produtos/)
})
