import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { exigirPessoaNoPedido, respostaDeErro } from '#/lib/sessao-http'
import { chaveDeImagemValida } from '#/regras/arquivos-de-conteudo'
import { normalizarCampos } from '#/regras/certificados'

// Prévia do modelo em PDF de verdade, com dados de exemplo e o que está na tela (mesmo sem salvar).
export const Route = createFileRoute('/api/painel/certificados/previa')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const conferido = await exigirPessoaNoPedido(request, 'usar-estudio', {
          semCache: true,
        })
        if ('erro' in conferido) return conferido.erro
        const corpo = (await request.json().catch(() => null)) as {
          frente?: string
          verso?: string | null
          campos?: unknown
        } | null
        if (!corpo?.frente || !chaveDeImagemValida(corpo.frente)) {
          return respostaDeErro(400, 'Envie a imagem da frente.')
        }
        if (corpo.verso && !chaveDeImagemValida(corpo.verso)) {
          return respostaDeErro(400, 'Imagem do verso inválida.')
        }
        const ler = async (chave: string) => {
          const objeto = await env.BUCKET.get(chave)
          if (!objeto) throw new Error('Imagem não encontrada.')
          return new Uint8Array(await objeto.arrayBuffer())
        }
        try {
          // Carregado só aqui: a biblioteca de PDF pesa na partida do Worker.
          const { gerarPdfDoCertificado } = await import(
            '#/regras/certificado-pdf'
          )
          const pdf = await gerarPdfDoCertificado(
            {
              nome: 'Maria da Conceição Souza',
              cursoNome: 'Nome do curso',
              concluidoEm: new Date(),
              codigo: 'ABCD-2345',
              campos: normalizarCampos(corpo.campos),
            },
            {
              frente: await ler(corpo.frente),
              verso: corpo.verso ? await ler(corpo.verso) : null,
            },
            'https://exemplo.invalid/validar/ABCD-2345',
          )
          return new Response(pdf.slice().buffer as ArrayBuffer, {
            headers: {
              'content-type': 'application/pdf',
              'cache-control': 'no-store',
            },
          })
        } catch (erro) {
          return respostaDeErro(
            400,
            erro instanceof Error
              ? erro.message
              : 'Não deu para gerar a prévia.',
          )
        }
      },
    },
  },
})
