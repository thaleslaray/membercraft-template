CREATE TABLE `pedido_do_mec` (
	`id` text PRIMARY KEY NOT NULL,
	`certificado_id` text NOT NULL,
	`user_id` text NOT NULL,
	`curso_id` text NOT NULL,
	`estado` text DEFAULT 'na_fila' NOT NULL,
	`criado_em` integer NOT NULL,
	`na_fila_desde` integer NOT NULL,
	`destacado_em` integer,
	`liberado_em` integer,
	`link_da_voomp` text,
	`problema_motivo` text,
	`problema_em` integer,
	`conversa_id` text,
	FOREIGN KEY (`certificado_id`) REFERENCES `certificado`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`curso_id`) REFERENCES `curso`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pedido_do_mec_certificado_idx` ON `pedido_do_mec` (`certificado_id`);--> statement-breakpoint
CREATE INDEX `pedido_do_mec_estado_idx` ON `pedido_do_mec` (`estado`,`na_fila_desde`);--> statement-breakpoint
CREATE INDEX `pedido_do_mec_aluno_idx` ON `pedido_do_mec` (`user_id`);--> statement-breakpoint
ALTER TABLE `curso` ADD `gera_pedido_do_mec` integer DEFAULT false NOT NULL;