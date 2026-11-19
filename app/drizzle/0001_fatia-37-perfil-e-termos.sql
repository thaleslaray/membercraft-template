ALTER TABLE `user` ADD `perfil` text DEFAULT 'aluno' NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `termos_versao` text;--> statement-breakpoint
ALTER TABLE `user` ADD `termos_aceito_em` integer;