import { env } from 'cloudflare:workers'
import { createFileRoute } from '@tanstack/react-router'
import { tipoDoArquivo } from '#/regras/aparencia-imagem'

// Serve as imagens da aparência (logo, favicon, fundos) guardadas no R2 em `aparencia/<nome>`.
// Pública: a tela de entrar precisa delas sem sessão. O nome é gerado pela área
// (campo-instante.extensão), então nada fora desse formato é procurado.
const NOME = /^arquivo\/([a-z]+-\d+\.[a-z0-9]+)$/

export const Route = createFileRoute('/api/aparencia/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const nome = NOME.exec(params._splat ?? '')?.[1]
        if (!nome) return new Response('Não encontrado.', { status: 404 })
        const objeto = await env.BUCKET.get(`aparencia/${nome}`)
        if (!objeto) return new Response('Não encontrado.', { status: 404 })
        return new Response(objeto.body, {
          headers: {
            'Content-Type':
              objeto.httpMetadata?.contentType ?? tipoDoArquivo(nome),
            // Um SVG aberto direto não pode rodar script.
            'Content-Security-Policy': "script-src 'none'",
            'Content-Disposition': 'inline',
            // O nome muda a cada envio: pode ficar em cache para sempre.
            'Cache-Control': 'public, max-age=31536000, immutable',
            ETag: objeto.httpEtag,
          },
        })
      },
    },
  },
})
