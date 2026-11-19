CREATE TABLE `configuracao_da_area` (
	`id` text PRIMARY KEY NOT NULL,
	`termos_versao` text NOT NULL,
	`termos_texto` text NOT NULL,
	`privacidade_texto` text NOT NULL,
	`suporte_email` text NOT NULL,
	`atualizado_em` integer NOT NULL,
	`atualizado_por` text,
	FOREIGN KEY (`atualizado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `user` ADD `telefone` text;--> statement-breakpoint
ALTER TABLE `user` ADD `fuso_horario` text;--> statement-breakpoint
ALTER TABLE `user` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `user` ADD `tour_visto_em` integer;