import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Prints e axe do fio do Atendimento (#103): desktop 1440×900 e celular 390×844, claro e escuro, com
// dados extremos (fio longo, mensagem longa, anexo, conversa Resolvida no meio do fio).
const aqui = path.dirname(fileURLToPath(import.meta.url))
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
const PRINTS =
  process.env.PRINTS_DIR ??
  path.join(aqui, '..', 'test-results', 'prints-atendimento')
mkdirSync(PRINTS, { recursive: true })

test.use({ bypassCSP: true })

// Uma imagem de verdade (320×200, degradê), gerada aqui para o anexo ter tamanho visível.
function criarPng(largura: number, altura: number): Buffer {
  const tabela = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b: Buffer) => {
    let c = 0xffffffff
    for (const x of b) c = tabela[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo), dados])
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const sel = Buffer.alloc(4)
    sel.writeUInt32BE(crc(corpo))
    return Buffer.concat([tam, corpo, sel])
  }
  const cab = Buffer.alloc(13)
  cab.writeUInt32BE(largura, 0)
  cab.writeUInt32BE(altura, 4)
  cab.set([8, 2, 0, 0, 0], 8)
  const linha = Buffer.alloc(1 + largura * 3)
  for (let x = 0; x < largura; x++) {
    linha[1 + x * 3] = 40 + Math.floor((x * 200) / largura)
    linha[2 + x * 3] = 120
    linha[3 + x * 3] = 200 - Math.floor((x * 150) / largura)
  }
  const bruto = Buffer.concat(Array.from({ length: altura }, () => linha))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cab),
    bloco('IDAT', deflateSync(bruto)),
    bloco('IEND', Buffer.alloc(0)),
  ])
}
const PNG = criarPng(320, 200)

const idDoUsuario = (email: string) => `e2e-${email.replace(/\W/g, '-')}`
const aspas = (t: string) => t.replace(/'/g, "''")

function semearFio(id: string, aluna: string, equipe: string) {
  const ana = idDoUsuario(aluna)
  const carla = idDoUsuario(equipe)
  const dia = 86_400_000
  const agora = Date.now()
  const longa = `Boa tarde! ${'Estou com um problema que começou depois da última atualização da plataforma e que acontece em mais de um aparelho, mesmo trocando de rede. '.repeat(6)}Consegue me ajudar?`
  const linhas: string[] = []
  const conversa = (
    cid: string,
    codigo: string,
    assunto: string,
    estado: string,
    quando: number,
    resolvida: number | null,
  ) =>
    linhas.push(
      `INSERT INTO conversa_de_atendimento (id, codigo, user_id, assunto, estado, canal, ultima_mensagem_em, resolvida_em, created_at) VALUES ('${cid}', '${codigo}', '${ana}', '${aspas(assunto)}', '${estado}', 'area', ${quando}, ${resolvida ?? 'NULL'}, ${quando})`,
    )
  const msg = (
    n: string,
    cid: string,
    autor: 'aluno' | 'equipe',
    texto: string,
    quando: number,
  ) =>
    linhas.push(
      `INSERT INTO mensagem_de_atendimento (id, conversa_id, autor, autor_id, texto, anexos, origem, criado_em) VALUES ('${n}', '${cid}', '${autor}', '${autor === 'aluno' ? ana : carla}', '${aspas(texto)}', '[]', 'area', ${quando})`,
    )

  const c1 = `c1-${id}`
  const c2 = `c2-${id}`
  const t1 = agora - 6 * dia
  conversa(
    c1,
    `A${id.slice(-5).replace(/\W/g, 'X').toUpperCase()}1`,
    'Boa tarde',
    'resolvida',
    t1 + 40 * 60_000,
    t1 + 40 * 60_000,
  )
  msg(`m1-${id}`, c1, 'aluno', longa, t1)
  for (let i = 0; i < 8; i++) {
    msg(
      `m1e${i}-${id}`,
      c1,
      i % 2 === 0 ? 'equipe' : 'aluno',
      i % 2 === 0
        ? `Resposta ${i + 1} da equipe: vamos olhar isso com calma e já te aviso.`
        : `Entendi, obrigada! (${i + 1})`,
      t1 + (i + 1) * 4 * 60_000,
    )
  }
  const t2 = agora - 1 * dia
  conversa(
    c2,
    `B${id.slice(-5).replace(/\W/g, 'X').toUpperCase()}2`,
    'Certificado',
    'respondida',
    agora - 3_600_000,
    null,
  )
  for (let i = 0; i < 22; i++) {
    msg(
      `m2-${i}-${id}`,
      c2,
      i % 3 === 0 ? 'equipe' : 'aluno',
      i % 3 === 0
        ? 'Já enviamos o certificado por e-mail e ele também fica em Certificados.'
        : `Mensagem ${i} sobre o certificado do curso.`,
      t2 + i * 20 * 60_000,
    )
  }
  const arquivo = path.join(os.tmpdir(), `semente-fio-${id}.sql`)
  writeFileSync(arquivo, `${linhas.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: path.resolve(aqui, '..'), encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear o fio: ${r.stderr}`)
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe do fio: ${tela.nome} ${modo}`, async ({ page }) => {
      test.setTimeout(120_000)
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const id = unico()
      const aluna = `fio-aluna-${id}@exemplo.test`
      const equipe = `fio-equipe-${id}@exemplo.test`
      cadastrarUsuario({ email: aluna, nome: 'Ana Souza' })
      cadastrarUsuario({
        email: equipe,
        perfil: 'equipe',
        nome: 'Carla Equipe',
      })
      const foto = (nome: string) =>
        page.screenshot({
          path: path.join(PRINTS, `${nome}-${tela.nome}-${modo}.png`),
        })
      const axe = async (onde: string) => {
        const { AxeBuilder } = await import('@axe-core/playwright')
        const r = await new AxeBuilder({ page }).analyze()
        expect(
          r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`),
          `axe em ${onde}`,
        ).toEqual([])
      }

      await entrarPorCodigo(page, aluna)

      // Vazio.
      await page.goto('/atendimento')
      const campo = page.getByRole('textbox', { name: 'Mensagem' })
      await esperarReact(campo)
      await page.waitForTimeout(400)
      await foto('fio-vazio')
      await axe(`fio vazio ${tela.nome} ${modo}`)

      // Manda uma mensagem com imagem pelo próprio campo (anexo real).
      await campo.fill('Segue a imagem da tela com o erro.')
      await page.getByLabel('Anexar imagens').setInputFiles({
        name: 'tela.png',
        mimeType: 'image/png',
        buffer: PNG,
      })
      await expect(page.getByAltText('Imagem para anexar')).toBeVisible()
      await campo.press('Control+Enter')
      const miniatura = page.getByAltText('Imagem anexada')
      await expect(miniatura).toBeVisible()
      // A imagem carregou do R2 local e aparece com tamanho de miniatura.
      await expect
        .poll(() => miniatura.evaluate((i: HTMLImageElement) => i.naturalWidth))
        .toBeGreaterThan(0)
      expect((await miniatura.boundingBox())?.width).toBeGreaterThan(100)
      await page.waitForTimeout(400)
      await foto('fio-com-anexo')

      // Fio longo: conversa Resolvida no meio, mensagem longa, equipe.
      semearFio(id, aluna, equipe)
      await page.goto('/atendimento')
      await esperarReact(campo)
      await page.waitForTimeout(500)
      await foto('fio-longo-fim')
      await axe(`fio longo ${tela.nome} ${modo}`)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(300)
      await foto('fio-longo-topo')

      // Campo crescendo com texto de várias linhas.
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight),
      )
      await campo.fill(
        Array.from({ length: 9 }, (_, i) => `Linha ${i + 1} do texto`).join(
          '\n',
        ),
      )
      await page.waitForTimeout(300)
      await foto('fio-campo-grande')
      const altura = await campo.evaluate((el) => el.clientHeight)
      expect(altura).toBeLessThanOrEqual(150)
    })
  }
}
