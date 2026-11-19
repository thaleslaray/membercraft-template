import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { expect, type Page, type TestInfo, test } from '@playwright/test'
import { CAMPOS_PADRAO } from '#/regras/certificado-modelo'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Certificados como prévias (#98): prévia com o nome, baixar, copiar link, abrir grande, "Preparando
// o PDF…", revogado, Formação com a linha do MEC. Prints e axe em celular e desktop, claro e escuro.
const aqui = path.dirname(fileURLToPath(import.meta.url))
// Código de validação único por rodada (o D1 local é reaproveitado e o código é único na tabela).
const codigoUnico = (letra: string) => {
  const sorteio = () =>
    Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0')
  return `${letra}${sorteio().slice(0, 3)}-${sorteio()}`
}
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const print = (testInfo: TestInfo, nome: string) =>
  process.env.PRINTS_DIR
    ? path.join(process.env.PRINTS_DIR, nome)
    : testInfo.outputPath(nome)

test.use({ bypassCSP: true })

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

// PNG liso (papel creme com uma moldura): serve de frente do certificado, sem arquivo no repositório.
function pngDoCertificado(largura = 1123, altura = 794): Buffer {
  const linha = (y: number) => {
    const l = Buffer.alloc(1 + largura * 3)
    for (let x = 0; x < largura; x++) {
      const moldura =
        x > 24 && x < largura - 24 && y > 24 && y < altura - 24
          ? !(x > 30 && x < largura - 30 && y > 30 && y < altura - 30)
          : false
      const cor = moldura ? [150, 120, 70] : [250, 246, 236]
      l.set(cor, 1 + x * 3)
    }
    return l
  }
  const cru = Buffer.concat(Array.from({ length: altura }, (_, y) => linha(y)))
  const parte = (tipo: string, dados: Buffer) => {
    const t = Buffer.concat([Buffer.from(tipo), dados])
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(t))
    return Buffer.concat([tam, t, crc])
  }
  const cab = Buffer.alloc(13)
  cab.writeUInt32BE(largura, 0)
  cab.writeUInt32BE(altura, 4)
  cab[8] = 8
  cab[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    parte('IHDR', cab),
    parte('IDAT', deflateSync(cru)),
    parte('IEND', Buffer.alloc(0)),
  ])
}

function d1(sql: string) {
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--command', sql],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha no D1: ${r.stderr}`)
}

// Curso com modelo ativo (todos apontam para a mesma imagem já enviada) e o certificado da aluna.
function semear(
  id: string,
  email: string,
  frente: string | null,
  c: {
    sufixo: string
    nome: string
    estado: 'pronto' | 'gerando' | 'revogado'
    mec?: 'na_fila' | 'liberado'
    codigo: string
  },
) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const k = `${c.sufixo}${id}`
  const campos = JSON.stringify(CAMPOS_PADRAO).replace(/'/g, "''")
  const agora = Date.now()
  const nome = c.nome.replace(/'/g, "''")
  const sql = [
    `INSERT INTO curso (id, nome, ordem, gera_pedido_do_mec) VALUES ('c-${k}', '${nome}', 9000, ${c.mec ? 1 : 0})`,
    ...(frente
      ? [
          `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${k}', 'c-${k}', 1, '${frente}', '${campos}')`,
        ]
      : []),
    `INSERT INTO certificado (id, user_id, curso_id, codigo, nome, curso_nome, concluido_em, emitido_em, pdf_estado, pdf_chave, revogado_em) VALUES ('ce-${k}', '${userId}', 'c-${k}', '${c.codigo}', 'Aluna das Prévias Souza', '${nome}', ${agora - 86_400_000 * 3}, ${agora - 86_400_000 * (c.sufixo.length + 1)}, '${c.estado === 'gerando' ? 'gerando' : 'pronto'}', ${c.estado === 'gerando' ? 'NULL' : `'certificados/${k}.pdf'`}, ${c.estado === 'revogado' ? agora : 'NULL'})`,
    ...(c.mec
      ? [
          `INSERT INTO pedido_do_mec (id, certificado_id, user_id, curso_id, estado, criado_em, na_fila_desde, liberado_em, link_da_voomp) VALUES ('pm-${k}', 'ce-${k}', '${userId}', 'c-${k}', '${c.mec}', ${agora}, ${agora}, ${c.mec === 'liberado' ? agora : 'NULL'}, ${c.mec === 'liberado' ? "'https://voomp.example.test/certificado'" : 'NULL'})`,
        ]
      : []),
  ].join('; ')
  d1(sql)
}

async function axe(page: Page, onde: string, semRegiao = false) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const construtor = new AxeBuilder({ page })
  if (semRegiao) construtor.disableRules(['region'])
  const r = await construtor.analyze()
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
    `axe em ${onde}`,
  ).toEqual([])
}

/** A equipe envia a imagem pelo editor (a imagem vai para o R2 local) e devolve a chave dela. */
async function enviarFrente(page: Page, cursoId: string): Promise<string> {
  await page.goto(`/painel/certificado/${cursoId}`)
  const envio = page.getByLabel(
    'Escolher arquivo: Imagem da frente (PNG ou JPEG)',
  )
  await esperarReact(envio)
  await envio.setInputFiles({
    name: 'frente.png',
    mimeType: 'image/png',
    buffer: pngDoCertificado(),
  })
  const img = page.getByAltText('Modelo do certificado, frente')
  await expect(img).toBeVisible()
  const chave = (await img.getAttribute('src'))?.replace('/api/imagens/', '')
  if (!chave) throw new Error('imagem da frente sem chave')
  return chave
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prévias de certificados: ${tela.nome} ${modo}`, async ({
      browser,
    }, testInfo) => {
      test.setTimeout(120_000)
      const id = unico()
      const emailAluna = `previas-${id}@exemplo.test`
      const emailEquipe = `previas-eq-${id}@exemplo.test`
      cadastrarUsuario({ email: emailAluna, nome: 'Aluna das Prévias' })
      cadastrarUsuario({ email: emailEquipe, perfil: 'equipe' })
      const userId = `e2e-${emailAluna.replace(/\W/g, '-')}`
      d1(
        `UPDATE user SET nome_no_certificado = 'Aluna das Prévias Souza', nome_confirmado_em = ${Date.now()} WHERE id = '${userId}'`,
      )

      // Modelo-base: o curso de apoio recebe a imagem pelo editor da equipe.
      d1(
        `INSERT INTO curso (id, nome, ordem) VALUES ('c-base${id}', 'Base ${id}', 9001)`,
      )
      const contextoEquipe = await browser.newContext()
      const equipe = await contextoEquipe.newPage()
      await entrarPorCodigo(equipe, emailEquipe)
      const frente = await enviarFrente(equipe, `c-base${id}`)
      await contextoEquipe.close()

      const codigos = {
        A: codigoUnico('A'),
        B: codigoUnico('B'),
        C: codigoUnico('C'),
        D: codigoUnico('D'),
      }
      const longo = `Formação completa em coloração avançada, mechas e técnicas de platinado para salões de alto padrão ${id}`
      semear(id, emailAluna, frente, {
        sufixo: 'a',
        nome: longo,
        estado: 'pronto',
        mec: 'na_fila',
        codigo: codigos.A,
      })
      semear(id, emailAluna, frente, {
        sufixo: 'bb',
        nome: `Mechas ${id}`,
        estado: 'gerando',
        codigo: codigos.B,
      })
      semear(id, emailAluna, frente, {
        sufixo: 'ccc',
        nome: `Curso revogado ${id}`,
        estado: 'revogado',
        codigo: codigos.C,
      })
      // Sem modelo ativo com imagem: sem prévia, só os dados e o botão.
      semear(id, emailAluna, null, {
        sufixo: 'dddd',
        nome: `Curso sem arte ${id}`,
        estado: 'pronto',
        codigo: codigos.D,
      })

      const contexto = await browser.newContext({
        viewport: tela.viewport,
        permissions: ['clipboard-read', 'clipboard-write'],
        bypassCSP: true,
      })
      const aluna = await contexto.newPage()
      await aluna.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      await entrarPorCodigo(aluna, emailAluna)
      await aluna.goto('/certificados')
      const botao = aluna.getByRole('button', {
        name: /Copiar link de validação de Formação completa/,
      })
      await esperarReact(botao)

      // Uma prévia com o nome por certificado com arte (3), e a Formação mostra a linha do MEC.
      const previas = aluna.getByTestId('previa-do-certificado')
      await expect(previas).toHaveCount(3)
      await expect(previas.first()).toContainText('Aluna das Prévias Souza')
      const formacao = aluna.getByRole('article', {
        name: /Certificado de Formação completa/,
      })
      await expect(
        formacao.getByText('Certificado do MEC', { exact: true }),
      ).toBeVisible()
      await expect(
        formacao.getByText(/emitido depois, pela Voomp/),
      ).toBeVisible()

      // PDF ainda não pronto: o botão diz "Preparando o PDF…" e a revogada não tem ações.
      const gerando = aluna.getByRole('article', {
        name: /Certificado de Mechas/,
      })
      await expect(
        gerando.getByRole('button', { name: 'Preparando o PDF…' }),
      ).toHaveAttribute('aria-disabled', 'true')
      const revogada = aluna.getByRole('article', {
        name: /Certificado de Curso revogado/,
      })
      await expect(revogada.getByRole('button')).toHaveCount(1) // só a prévia
      await expect(revogada.getByRole('link')).toHaveCount(0)
      const semArte = aluna.getByRole('article', {
        name: /Certificado de Curso sem arte/,
      })
      await expect(semArte.getByTestId('previa-do-certificado')).toHaveCount(0)
      await expect(semArte.getByRole('link', { name: /Baixar/ })).toBeVisible()

      // Baixar abre o PDF do certificado pronto (link direto, o mesmo da fatia anterior).
      await expect(
        formacao.getByRole('link', { name: /Baixar/ }),
      ).toHaveAttribute('href', /\/api\/certificados\/ce-a/)

      await aluna.waitForTimeout(400)
      await aluna.screenshot({
        path: print(testInfo, `certificados-${tela.nome}-${modo}.png`),
        fullPage: true,
      })
      await axe(aluna, `certificados ${tela.nome} ${modo}`)

      // Copiar link: copia a URL pública de validação, vira "Copiado" e volta.
      await botao.click()
      await expect(
        formacao.getByRole('button', { name: 'Copiado' }),
      ).toBeVisible()
      const copiado = await aluna.evaluate(() => navigator.clipboard.readText())
      expect(copiado.endsWith(`/validar/${codigos.A}`)).toBe(true)
      await expect(
        formacao.getByRole('button', {
          name: /Copiar link de validação de Formação/,
        }),
      ).toBeVisible({ timeout: 4000 })

      // Tocar na prévia abre o certificado grande; Esc fecha e devolve o foco à prévia.
      const abrir = formacao.getByRole('button', {
        name: /em tamanho grande/,
      })
      await abrir.click()
      const grande = aluna.getByRole('dialog')
      await expect(grande).toBeVisible()
      await expect(grande.getByTestId('previa-do-certificado')).toContainText(
        'Aluna das Prévias Souza',
      )
      await aluna.waitForTimeout(500)
      await aluna.screenshot({
        path: print(testInfo, `certificado-grande-${tela.nome}-${modo}.png`),
      })
      await axe(aluna, `certificado grande ${tela.nome} ${modo}`, true)
      await aluna.keyboard.press('Escape')
      await expect(grande).toHaveCount(0)
      await expect(abrir).toBeFocused()
      await contexto.close()
    })
  }
}

test('lista vazia e confirmação do nome antes das prévias', async ({
  browser,
}, testInfo) => {
  const id = unico()
  const email = `previas-vazio-${id}@exemplo.test`
  cadastrarUsuario({ email, nome: 'Aluna Vazia' })
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
  })
  const aluna = await contexto.newPage()
  await entrarPorCodigo(aluna, email)
  await aluna.goto('/certificados')
  await expect(aluna.getByText('Você ainda não tem certificados')).toBeVisible()
  // Nome ainda não confirmado: o campo aparece ali mesmo, acima da lista.
  const nome = aluna.getByLabel('Nome no certificado')
  await esperarReact(nome)
  await expect(nome).toBeVisible()
  await aluna.screenshot({
    path: print(testInfo, 'certificados-vazio-celular-claro.png'),
    fullPage: true,
  })
  await axe(aluna, 'certificados vazio')
  await contexto.close()
})
