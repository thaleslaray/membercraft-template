DROP INDEX `quiz_aula_idx`;--> statement-breakpoint
ALTER TABLE `quiz` ADD `excluido_em` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `quiz_aula_idx` ON `quiz` (`aula_id`) WHERE excluido_em is null;--> statement-breakpoint
ALTER TABLE `anexo_da_publicacao` ADD `excluido_em` integer;--> statement-breakpoint
ALTER TABLE `banner` ADD `origem_memberkit` text;--> statement-breakpoint
CREATE UNIQUE INDEX `banner_origem_idx` ON `banner` (`origem_memberkit`);--> statement-breakpoint
ALTER TABLE `mensagem_de_atendimento` ADD `chave_de_envio` text;--> statement-breakpoint
CREATE UNIQUE INDEX `mensagem_envio_idx` ON `mensagem_de_atendimento` (`autor_id`,`chave_de_envio`);