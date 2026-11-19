CREATE TABLE `certificado` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`curso_id` text NOT NULL,
	`codigo` text NOT NULL,
	`nome` text NOT NULL,
	`curso_nome` text NOT NULL,
	`concluido_em` integer NOT NULL,
	`emitido_em` integer NOT NULL,
	`pdf_estado` text DEFAULT 'gerando' NOT NULL,
	`pdf_chave` text,
	`pdf_gerado_em` integer,
	`avisado_em` integer,
	`revogado_em` integer,
	`revogado_motivo` text,
	`revogado_por_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`revogado_por_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `certificado_codigo_idx` ON `certificado` (`codigo`);--> statement-breakpoint
CREATE UNIQUE INDEX `certificado_aluno_curso_idx` ON `certificado` (`user_id`,`curso_id`);--> statement-breakpoint
CREATE INDEX `certificado_curso_idx` ON `certificado` (`curso_id`);--> statement-breakpoint
CREATE TABLE `modelo_de_certificado` (
	`id` text PRIMARY KEY NOT NULL,
	`curso_id` text NOT NULL,
	`ativo` integer DEFAULT false NOT NULL,
	`frente` text,
	`verso` text,
	`campos` text DEFAULT '[]' NOT NULL,
	`atualizado_em` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `modelo_certificado_curso_idx` ON `modelo_de_certificado` (`curso_id`);--> statement-breakpoint
ALTER TABLE `curso` ADD `certificado_todas_as_aulas` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `curso` ADD `certificado_pontos_minimos` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `nome_no_certificado` text;--> statement-breakpoint
ALTER TABLE `user` ADD `nome_confirmado_em` integer;