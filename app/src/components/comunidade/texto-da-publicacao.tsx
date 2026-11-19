// O HTML já foi limpo por `limparTextoDaPublicacao` ao gravar; aqui só recebe estilo.
export function TextoDaPublicacao({ html }: { html: string }) {
  return (
    <div
      className="max-w-none text-[15px] leading-relaxed break-words text-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_img]:my-3 [&_img]:max-h-96 [&_img]:rounded-lg [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: texto limpo por limparTextoDaPublicacao antes de gravar
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
