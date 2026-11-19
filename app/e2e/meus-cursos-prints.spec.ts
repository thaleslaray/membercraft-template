import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { expect, test } from '@playwright/test'
import { cadastrarUsuario, entrarPorCodigo, esperarReact } from '#e2e/helpers'

// Prints e axe de Meus cursos (#102): desktop 1440×900 e celular 390×844, claro e escuro, com dados
// extremos (título longo, curso sem capa, 210 aulas, vários cursos, certificado, aulas salvas) e com
// a aluna sem nenhum curso. Prints em PRINTS_DIR (ou na pasta de saída do teste).
const aqui = path.dirname(fileURLToPath(import.meta.url))
const raiz = path.resolve(aqui, '..')
const unico = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`

test.use({ bypassCSP: true })

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return ~c >>> 0
}

function pedaco(tipo: string, dados: Buffer): Buffer {
  const cabeca = Buffer.alloc(4)
  cabeca.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo), dados])
  const fim = Buffer.alloc(4)
  fim.writeUInt32BE(crc32(corpo))
  return Buffer.concat([cabeca, corpo, fim])
}

/** PNG de uma cor só, com uma faixa mais escura embaixo (para a cartela ter o que ler). */
function pngSolido(
  w: number,
  h: number,
  cor: [number, number, number],
  faixa: [number, number, number],
): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const linhas: Buffer[] = []
  for (let y = 0; y < h; y++) {
    const c = y > h * 0.7 ? faixa : cor
    const linha = Buffer.alloc(1 + w * 3)
    for (let x = 0; x < w; x++) {
      linha[1 + x * 3] = c[0]
      linha[2 + x * 3] = c[1]
      linha[3 + x * 3] = c[2]
    }
    linhas.push(linha)
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pedaco('IHDR', ihdr),
    pedaco('IDAT', zlib.deflateSync(Buffer.concat(linhas))),
    pedaco('IEND', Buffer.alloc(0)),
  ])
}

function guardarImagemLocal(chave: string, png: Buffer) {
  const arquivo = path.join(os.tmpdir(), `img-${chave.replace(/\W/g, '-')}`)
  writeFileSync(arquivo, png)
  const r = spawnSync(
    'npx',
    [
      'wrangler',
      'r2',
      'object',
      'put',
      `escola-arquivos/${chave}`,
      '--file',
      arquivo,
      '--content-type',
      'image/png',
      '--local',
    ],
    { cwd: raiz, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao guardar a imagem: ${r.stderr}`)
}

function executar(sql: string[], nome: string) {
  const arquivo = path.join(os.tmpdir(), `${nome}.sql`)
  writeFileSync(arquivo, `${sql.join(';\n')};\n`)
  const r = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'escola', '--local', '--file', arquivo],
    { cwd: raiz, encoding: 'utf8' },
  )
  if (r.status !== 0) throw new Error(`Falha ao semear: ${r.stderr}`)
}

function semear(id: string, email: string) {
  const userId = `e2e-${email.replace(/\W/g, '-')}`
  const agora = Date.now()
  const sql: string[] = []
  const matricular = (cursoId: string, sufixo: string) =>
    sql.push(
      `INSERT INTO turma (id, curso_id, nome) VALUES ('t-${sufixo}', '${cursoId}', 'Turma ${sufixo}')`,
      `INSERT INTO matricula (id, user_id, turma_id, situacao, inicia_em) VALUES ('mt-${sufixo}', '${userId}', 't-${sufixo}', 'ativa', ${agora - 86_400_000})`,
    )
  const progresso = (aulaId: string, concluida: boolean, quando: number) =>
    sql.push(
      `INSERT INTO progresso_da_aula (id, user_id, aula_id, aberta_em, concluida_em) VALUES ('pg-${aulaId}', '${userId}', '${aulaId}', ${quando}, ${concluida ? quando : 'NULL'})`,
    )

  // Extremo: título comprido, sem capa, 7 módulos, 210 aulas. As 3 primeiras concluídas, a 4ª aberta.
  const longo = `e-${id}`
  sql.push(
    `INSERT INTO curso (id, nome, ordem) VALUES ('${longo}', 'Curso com um título bem comprido para testar a quebra de linha e o corte nos cartões ${id}', 9000)`,
  )
  for (let m = 1; m <= 7; m++) {
    sql.push(
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('m${m}-${id}', '${longo}', 'Módulo ${m} com um nome razoavelmente longo', ${m})`,
    )
  }
  for (let n = 1; n <= 210; n++) {
    sql.push(
      `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('a${n}-${id}', 'm${((n - 1) % 7) + 1}-${id}', 'Aula ${n}: uma aula com título longo o bastante para quebrar em duas linhas no destaque', '<p>t</p>', ${n})`,
    )
  }
  matricular(longo, `e-${id}`)
  for (let n = 1; n <= 3; n++) progresso(`a${n}-${id}`, true, agora - 5000 + n)
  progresso(`a4-${id}`, false, agora)
  for (const n of [1, 2, 5]) {
    sql.push(
      `INSERT INTO favorito (user_id, aula_id) VALUES ('${userId}', 'a${n}-${id}')`,
    )
  }

  // Curtos: 1 concluído (com certificado), os outros por começar (um com capa).
  const capa = `conteudo/imagens/capa-${id}.png`
  for (const [i, nome] of [
    'Concluído',
    'Com capa',
    'Sem capa A',
    'Sem capa B',
    'Sem capa C',
  ].entries()) {
    const cid = `s${i}-${id}`
    sql.push(
      `INSERT INTO curso (id, nome, ordem, capa_horizontal) VALUES ('${cid}', '${nome} ${id}', ${9001 + i}, ${i === 1 ? `'${capa}'` : 'NULL'})`,
      `INSERT INTO modulo (id, curso_id, nome, ordem) VALUES ('sm${i}-${id}', '${cid}', 'Módulo único', 1)`,
      `INSERT INTO aula (id, modulo_id, titulo, texto_html, ordem) VALUES ('sa${i}-${id}', 'sm${i}-${id}', 'Primeira aula do ${nome}', '<p>t</p>', 1)`,
    )
    matricular(cid, `s${i}-${id}`)
  }
  progresso(`sa0-${id}`, true, agora - 9000)

  // Um curso que ela não tem, mas aparece para todos.
  sql.push(
    `INSERT INTO curso (id, nome, ordem, mostrar_a_todos) VALUES ('x-${id}', 'Curso que ela ainda não tem ${id}', 9100, 1)`,
  )

  // Certificado do curso concluído, com modelo e frente.
  const frente = `conteudo/imagens/frente-${id}.png`
  const campos = JSON.stringify([
    {
      campo: 'nome',
      lado: 'frente',
      x: 0.5,
      y: 0.5,
      tamanho: 40,
      fonte: 'times',
      negrito: true,
      cor: '#222222',
      alinhamento: 'centro',
    },
    {
      campo: 'curso',
      lado: 'frente',
      x: 0.5,
      y: 0.65,
      tamanho: 22,
      fonte: 'helvetica',
      negrito: false,
      cor: '#444444',
      alinhamento: 'centro',
    },
  ])
  sql.push(
    `INSERT INTO modelo_de_certificado (id, curso_id, ativo, frente, campos) VALUES ('mc-${id}', 's0-${id}', 1, '${frente}', '${campos}')`,
    `INSERT INTO certificado (id, user_id, curso_id, codigo, nome, curso_nome, concluido_em, emitido_em, pdf_estado) VALUES ('ce-${id}', '${userId}', 's0-${id}', 'COD${id.replace(/\W/g, '')}', 'Aluna de Prints', 'Concluído ${id}', ${agora - 9000}, ${agora - 8000}, 'pronto')`,
  )
  executar(sql, `meus-cursos-${id}`)
  guardarImagemLocal(capa, pngSolido(400, 200, [196, 120, 90], [60, 40, 30]))
  guardarImagemLocal(
    frente,
    pngSolido(842, 595, [250, 244, 230], [235, 225, 200]),
  )
}

async function axe(page: import('@playwright/test').Page, onde: string) {
  const { AxeBuilder } = await import('@axe-core/playwright')
  const r = await new AxeBuilder({ page }).analyze()
  const graves = r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)
  expect(graves, `axe em ${onde}`).toEqual([])
}

const TELAS = [
  { nome: 'desktop', viewport: { width: 1440, height: 900 } },
  { nome: 'celular', viewport: { width: 390, height: 844 } },
]

for (const tela of TELAS) {
  for (const modo of ['claro', 'escuro'] as const) {
    test(`prints e axe de Meus cursos: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(180_000)
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
      mkdirSync(pasta, { recursive: true })
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const id = unico()
      const email = `meus-cursos-${id}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna de Prints' })
      semear(id, email)
      await entrarPorCodigo(page, email)
      await page.goto('/')
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(800)
      await expect(
        page.getByRole('region', { name: 'Continuar de onde parou' }),
      ).toBeVisible()
      await expect(
        page.getByRole('region', { name: 'Certificados' }),
      ).toBeVisible()
      await page.screenshot({
        path: path.join(pasta, `meus-cursos-${tela.nome}-${modo}.png`),
        fullPage: true,
      })
      await axe(page, `Meus cursos ${tela.nome} ${modo}`)
    })

    test(`prints e axe de Meus cursos sem curso: ${tela.nome} ${modo}`, async ({
      page,
    }, testInfo) => {
      const pasta = process.env.PRINTS_DIR ?? testInfo.outputPath('prints')
      mkdirSync(pasta, { recursive: true })
      await page.setViewportSize(tela.viewport)
      await page.addInitScript((m) => {
        localStorage.setItem('theme', m === 'escuro' ? 'dark' : 'light')
      }, modo)
      const email = `sem-curso-prints-${unico()}@exemplo.test`
      cadastrarUsuario({ email, nome: 'Aluna Sem Curso' })
      await entrarPorCodigo(page, email)
      await page.goto('/')
      await esperarReact(
        page.getByRole('button', { name: 'Abrir menu da conta' }),
      )
      await page.waitForTimeout(500)
      await page.screenshot({
        path: path.join(pasta, `meus-cursos-vazio-${tela.nome}-${modo}.png`),
        fullPage: true,
      })
      await axe(page, `Meus cursos vazio ${tela.nome} ${modo}`)
    })
  }
}
