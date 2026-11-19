CREATE TABLE `aviso_voomp` (
	`id` text PRIMARY KEY NOT NULL,
	`chave` text NOT NULL,
	`tipo` text NOT NULL,
	`gatilho` text NOT NULL,
	`venda_id` text,
	`produto_id` text,
	`produto_nome` text,
	`oferta_hash` text,
	`email` text,
	`nome` text,
	`corpo` text NOT NULL,
	`situacao` text DEFAULT 'recebida' NOT NULL,
	`motivo` text,
	`turma_ids` text,
	`repeticoes` integer DEFAULT 0 NOT NULL,
	`recebido_em` integer NOT NULL,
	`processado_em` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aviso_voomp_chave_idx` ON `aviso_voomp` (`chave`);--> statement-breakpoint
CREATE INDEX `aviso_voomp_recebido_idx` ON `aviso_voomp` (`recebido_em`);--> statement-breakpoint
CREATE INDEX `aviso_voomp_venda_idx` ON `aviso_voomp` (`venda_id`);--> statement-breakpoint
CREATE INDEX `aviso_voomp_produto_idx` ON `aviso_voomp` (`produto_id`);--> statement-breakpoint
CREATE TABLE `ligacao_da_voomp` (
	`id` text PRIMARY KEY NOT NULL,
	`produto_id` text NOT NULL,
	`oferta_hash` text DEFAULT '' NOT NULL,
	`turma_id` text NOT NULL,
	`prazo_em_dias` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`turma_id`) REFERENCES `turma`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ligacao_voomp_unica_idx` ON `ligacao_da_voomp` (`produto_id`,`oferta_hash`,`turma_id`);--> statement-breakpoint
CREATE INDEX `ligacao_voomp_produto_idx` ON `ligacao_da_voomp` (`produto_id`);