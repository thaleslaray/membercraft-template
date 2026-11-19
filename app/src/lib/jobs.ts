// Registro simples de jobs agendados. O cron (wrangler.jsonc) chama `runJobs` pelo
// `scheduled()` do src/server.ts. Cada job roda isolado: um erro não impede os demais.
import { getDb } from '#/db/index'
import { avisarTecnico } from '#/lib/alerta'
import { rodarAvisosDoDia, rodarAvisosDoQuartoDeHora } from '#/lib/avisos-cola'
import { enfileirarPdf } from '#/lib/certificados-cola'
import { rodarConferenciaHotmart } from '#/lib/conferencia-hotmart-cola'
import { baseDoApp, pedirEmail } from '#/lib/email-cola'
import { destacarPedidosAtrasadosDoMec } from '#/lib/pedido-do-mec-cola'
import { gravarFluxoEmPartes } from '#/lib/r2-partes'
import { certificadosParaReenfileirar } from '#/regras/certificados'
import { copiarBancoParaDeposito } from '#/regras/copia-diaria'
import { varrerEnviosSemResposta } from '#/regras/envio-de-email'
import { limparExclusoesVencidas } from '#/regras/exclusao-protegida'
import { expirarMatriculas } from '#/regras/matricula'
import { enviarResumosDiarios } from '#/regras/resumo-diario'
import { limparExpirados } from '#/regras/sessao'
import { TABELAS_COM_EXCLUSAO } from '#/regras/tabelas-com-exclusao'

export type Quando = 'diario' | 'resumo' | 'quarto-de-hora'

export interface Job {
  name: string
  /** Em qual cron roda: `diario` (padrão, 03:00 UTC), `resumo` (8h em Brasília) ou `quarto-de-hora`. */
  quando?: Quando
  /** Retorna um detalhe curto para o log, ex.: "sessions=2 verifications=0". */
  // biome-ignore lint/suspicious/noConfusingVoidType: o job pode não devolver detalhe nenhum
  run: (env: Env) => Promise<string | void>
}

const jobs: Job[] = []

export function registerJob(job: Job): void {
  jobs.push(job)
}

export async function runJobs(
  env: Env,
  quando: Quando = 'diario',
): Promise<Record<string, 'ok' | 'erro'>> {
  const result: Record<string, 'ok' | 'erro'> = {}
  for (const job of jobs.filter((j) => (j.quando ?? 'diario') === quando)) {
    try {
      const detail = await job.run(env)
      console.log(`[jobs] ${job.name}: ${detail ?? 'ok'}`)
      result[job.name] = 'ok'
    } catch (error) {
      console.error(`[jobs] ${job.name}: falhou`, error)
      result[job.name] = 'erro'
      await avisarTecnico({
        origem: 'tarefa',
        detalhe: `${job.name}: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  return result
}

// Apaga sessões e códigos de verificação (OTP, links) já expirados.
registerJob({
  name: 'auth.limpar-expirados',
  async run(env) {
    const { sessoes, verificacoes } = await limparExpirados(
      getDb(env.DB),
      () => new Date(),
    )
    return `sessions=${sessoes} verifications=${verificacoes}`
  },
})

// Cópia diária do D1 para o R2 (90 dias de histórico, além do Time Travel de 30 dias).
registerJob({
  name: 'operacao.copia-diaria',
  async run(env) {
    const bucket = env.BUCKET
    const chave = await copiarBancoParaDeposito(
      getDb(env.DB),
      {
        put: (k, corpo) => gravarFluxoEmPartes(bucket, k, corpo),
        list: async ({ prefix }) => {
          const chaves: string[] = []
          let cursor: string | undefined
          do {
            const pagina = await bucket.list({ prefix, cursor })
            chaves.push(...pagina.objects.map((o) => o.key))
            cursor = pagina.truncated ? pagina.cursor : undefined
          } while (cursor)
          return chaves
        },
        delete: (chaves) => bucket.delete(chaves),
      },
      () => new Date(),
    )
    return `copia=${chave}`
  },
})

// Apaga de vez o que foi excluído há mais de 30 dias (exclusão protegida): as linhas e os arquivos do R2
// ligados a elas. Cada tabela é isolada; se alguma falhar, o técnico recebe UM alerta por execução.
registerJob({
  name: 'operacao.limpar-exclusoes',
  async run(env) {
    const resultado = await limparExclusoesVencidas(
      getDb(env.DB),
      () => new Date(),
      TABELAS_COM_EXCLUSAO,
      async (chaves) => {
        // O R2 apaga até 1.000 chaves por chamada.
        for (let i = 0; i < chaves.length; i += 1000) {
          await env.BUCKET.delete(chaves.slice(i, i + 1000))
        }
      },
    )
    if (resultado.falhas.length > 0) {
      await avisarTecnico({
        origem: 'tarefa',
        detalhe: `operacao.limpar-exclusoes: ${resultado.falhas
          .map((f) => `${f.tabela} (${f.erro})`)
          .join('; ')}`,
      })
    }
    return JSON.stringify(resultado)
  },
})

// Marca como expiradas as matrículas ativas que passaram da data. A leitura já trata a vencida como
// expirada; a rotina deixa o banco em dia para relatórios e avisos.
registerJob({
  name: 'matriculas.expirar',
  async run(env) {
    return `expiradas=${await expirarMatriculas(getDb(env.DB), () => new Date())}`
  },
})

// E-mails que ficaram na-fila ou enviando há mais de 1 h (fila que falhou, consumidor que caiu, código
// de login interrompido) viram "falhou". Roda a cada quarto de hora.
registerJob({
  name: 'email.varrer-sem-resposta',
  quando: 'quarto-de-hora',
  async run(env) {
    return `falhos=${await varrerEnviosSemResposta(getDb(env.DB), () => new Date())}`
  },
})

// Resumo diário da equipe (8h em Brasília): um e-mail com as filas que têm pendência.
registerJob({
  name: 'equipe.resumo-diario',
  quando: 'resumo',
  async run(env) {
    const pedidos = await enviarResumosDiarios(
      getDb(env.DB),
      () => new Date(),
      {
        link: `${baseDoApp(env)}/painel`,
        pedir: (pedido) => pedirEmail(env, pedido),
      },
    )
    return `resumos=${pedidos}`
  },
})

// Avisos do aluno no sininho e por e-mail: conteúdo liberado (por data), acesso expirando, acesso
// pronto e "sentimos sua falta" (#46). Os dias são ajustáveis no Estúdio.
registerJob({
  name: 'avisos.agendados',
  async run(env) {
    return JSON.stringify(await rodarAvisosDoDia(env))
  },
})

// Coleta do agrupamento de 15 minutos (#45) e sininho da equipe para itens novos das filas (#46).
registerJob({
  name: 'avisos.quarto-de-hora',
  quando: 'quarto-de-hora',
  async run(env) {
    return JSON.stringify(await rodarAvisosDoQuartoDeHora(env))
  },
})

// Destaque dos Pedidos do MEC que passaram de 5 dias úteis na fila: avisa a equipe no sininho, uma
// vez por espera (#56). Roda às 8h em Brasília, junto do resumo diário.
registerJob({
  name: 'mec.destacar-atrasados',
  quando: 'resumo',
  async run(env) {
    return `destacados=${await destacarPedidosAtrasadosDoMec(env)}`
  },
})

// Conferência diária da Hotmart (#134): consulta o histórico de vendas dos últimos dias e aplica, pelo
// caminho do webhook, as compras e os estornos que o aviso não trouxe. Sem credencial não faz nada e
// não alerta; se a API falhar, o erro sobe e o `runJobs` avisa o técnico.
registerJob({
  name: 'hotmart.conferencia-diaria',
  async run(env) {
    const r = await rodarConferenciaHotmart(env, 'cron')
    if (!r) return 'sem credencial'
    return `consultadas=${r.consultadas} recuperadas=${r.recuperadas} ja=${r.jaProcessadas} sem_turma=${r.semTurma} erro=${r.comErro}`
  },
})

// Varredura dos certificados que ficaram "gerando" porque a fila do PDF falhou depois da emissão:
// reenfileira os que passaram de 30 minutos sem PDF e sem revogação.
registerJob({
  name: 'certificados.reenfileirar-pdfs',
  async run(env) {
    const ids = await certificadosParaReenfileirar(
      getDb(env.DB),
      () => new Date(),
    )
    let reenfileirados = 0
    for (const id of ids) {
      try {
        await enfileirarPdf(env, id)
        reenfileirados++
      } catch (erro) {
        console.error(`[jobs] certificado ${id}: reenfileirar falhou`, erro)
      }
    }
    return `reenfileirados=${reenfileirados}/${ids.length}`
  },
})
