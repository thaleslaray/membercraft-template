CREATE TABLE `regra_de_liberacao` (
	`id` text PRIMARY KEY NOT NULL,
	`turma_id` text NOT NULL,
	`modulo_id` text,
	`aula_id` text,
	`tipo` text NOT NULL,
	`libera_em` integer,
	`fecha_em` integer,
	`dias` integer,
	`pontos` integer,
	`alvo_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`turma_id`) REFERENCES `turma`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`modulo_id`) REFERENCES `modulo`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `regra_turma_modulo_idx` ON `regra_de_liberacao` (`turma_id`,`modulo_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `regra_turma_aula_idx` ON `regra_de_liberacao` (`turma_id`,`aula_id`);