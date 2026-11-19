import {
  CaminhoDoCertificado,
  MARCADOR_DO_CAMINHO,
} from '#/components/certificados/caminho-do-certificado'

// Botão do texto da aula (`<a class="botao">`); o editor do painel usa o mesmo estilo.
export const ESTILO_DO_BOTAO =
  // Alinhado à esquerda, como o texto (régua única). Cor e raio vêm de `--botao-do-texto*` (café no
  // Ateliê, testado o vinho e preferido o café pelo dono em 17/11/2026).
  '[&_a.botao]:no-underline [&_a.botao]:mt-4 [&_a.botao]:mb-5 [&_a.botao]:flex [&_a.botao]:w-full [&_a.botao]:items-center [&_a.botao]:justify-center [&_a.botao]:rounded-(--botao-do-texto-raio) [&_a.botao]:bg-(--botao-do-texto) [&_a.botao]:px-6 [&_a.botao]:py-3.5 [&_a.botao]:text-base [&_a.botao]:font-semibold [&_a.botao]:text-(--botao-do-texto-tinta) [&_a.botao]:transition-colors [&_a.botao]:hover:bg-(--botao-do-texto-hover) [&_a.botao]:focus-visible:ring-[3px] [&_a.botao]:focus-visible:ring-ring/50 [&_a.botao]:focus-visible:outline-none [&_a.botao]:sm:w-fit [&_a.botao]:sm:min-w-72'

// O HTML já foi limpo por `limparHtml` ao gravar a aula; aqui só recebe estilo. Com `cursoId`, o
// parágrafo `[caminho-do-certificado]` vira o painel ao vivo do certificado daquele curso.
export function TextoDaAula({
  html,
  cursoId,
}: {
  html: string
  cursoId?: string
}) {
  const marcador = new RegExp(
    `<p>\\s*${MARCADOR_DO_CAMINHO.replace(/[[\]]/g, '\\$&')}\\s*</p>`,
  )
  if (cursoId && marcador.test(html)) {
    const [antes, depois] = html.split(marcador)
    return (
      <>
        {antes.trim() && <TextoDaAula html={antes} />}
        <CaminhoDoCertificado
          cursoId={cursoId}
          className="my-6 max-w-[50rem]"
        />
        {depois?.trim() && <TextoDaAula html={depois} />}
      </>
    )
  }
  return (
    <div
      className={`max-w-[50rem] text-[15px] leading-relaxed text-foreground [&_a:not(.botao)]:text-primary [&_a:not(.botao)]:underline ${ESTILO_DO_BOTAO} [&_blockquote]:mb-3 [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_iframe]:my-4 [&_iframe]:w-full [&_iframe]:rounded-lg [&_iframe]:border-0 [&_.embed-youtube]:aspect-video [&_.embed-ted]:aspect-video [&_.embed-typebot]:h-[600px] [&_img]:my-4 [&_img]:rounded-lg [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: texto limpo por limparHtml antes de gravar
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
