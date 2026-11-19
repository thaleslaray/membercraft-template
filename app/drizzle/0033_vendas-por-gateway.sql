ALTER TABLE `aviso_voomp` RENAME TO `aviso_de_venda`;--> statement-breakpoint
ALTER TABLE `ligacao_da_voomp` RENAME TO `ligacao_de_venda`;--> statement-breakpoint
DROP INDEX `aviso_voomp_chave_idx`;--> statement-breakpoint
DROP INDEX `aviso_voomp_recebido_idx`;--> statement-breakpoint
DROP INDEX `aviso_voomp_venda_idx`;--> statement-breakpoint
DROP INDEX `aviso_voomp_produto_idx`;--> statement-breakpoint
ALTER TABLE `aviso_de_venda` ADD `gateway` text DEFAULT 'voomp' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `aviso_de_venda_chave_idx` ON `aviso_de_venda` (`gateway`,`chave`);--> statement-breakpoint
CREATE INDEX `aviso_de_venda_recebido_idx` ON `aviso_de_venda` (`recebido_em`);--> statement-breakpoint
CREATE INDEX `aviso_de_venda_venda_idx` ON `aviso_de_venda` (`gateway`,`venda_id`);--> statement-breakpoint
CREATE INDEX `aviso_de_venda_produto_idx` ON `aviso_de_venda` (`gateway`,`produto_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ligacao_de_venda` (
	`id` text PRIMARY KEY NOT NULL,
	`gateway` text DEFAULT 'voomp' NOT NULL,
	`produto_id` text NOT NULL,
	`oferta_hash` text DEFAULT '' NOT NULL,
	`turma_id` text NOT NULL,
	`prazo_em_dias` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`turma_id`) REFERENCES `turma`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_ligacao_de_venda`("id", "gateway", "produto_id", "oferta_hash", "turma_id", "prazo_em_dias", "created_at") SELECT "id", 'voomp', "produto_id", "oferta_hash", "turma_id", "prazo_em_dias", "created_at" FROM `ligacao_de_venda`;--> statement-breakpoint
DROP TABLE `ligacao_de_venda`;--> statement-breakpoint
ALTER TABLE `__new_ligacao_de_venda` RENAME TO `ligacao_de_venda`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `ligacao_de_venda_unica_idx` ON `ligacao_de_venda` (`gateway`,`produto_id`,`oferta_hash`,`turma_id`);--> statement-breakpoint
CREATE INDEX `ligacao_de_venda_produto_idx` ON `ligacao_de_venda` (`gateway`,`produto_id`);--> statement-breakpoint
UPDATE `origem_da_matricula` SET `venda_id` = 'voomp:' || `venda_id` WHERE `tipo` = 'venda' AND `venda_id` IS NOT NULL AND `venda_id` NOT LIKE 'voomp:%' AND `venda_id` NOT LIKE 'hotmart:%';
