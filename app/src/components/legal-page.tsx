/** Artigo simples das páginas legais (termos e privacidade). O texto vem da configuração da área. */
export function LegalPage({ title, texto }: { title: string; texto: string }) {
  // Parágrafos separados por linha em branco; quebra simples vira <br>. Sem HTML do texto.
  const paragrafos = texto.split(/\n{2,}/).filter((p) => p.trim())
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
        {title}
      </h1>
      <div className="prose mt-10">
        {paragrafos.map((paragrafo) => (
          <p key={paragrafo} className="whitespace-pre-line">
            {paragrafo}
          </p>
        ))}
      </div>
    </main>
  )
}
