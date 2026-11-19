CREATE TABLE `conferencia_de_vendas` (
	`id` text PRIMARY KEY NOT NULL,
	`autor_id` text,
	`arquivo_nome` text NOT NULL,
	`mapeamento` text DEFAULT '{}' NOT NULL,
	`total_linhas` integer NOT NULL,
	`total_pagas` integer NOT NULL,
	`total_matriculadas` integer NOT NULL,
	`total_sem_matricula` integer NOT NULL,
	`total_sem_turma` integer NOT NULL,
	`total_aplicadas` integer DEFAULT 0 NOT NULL,
	`pendentes` text DEFAULT '[]' NOT NULL,
	`criado_em` integer NOT NULL,
	FOREIGN KEY (`autor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `conferencia_vendas_criado_idx` ON `conferencia_de_vendas` (`criado_em`);