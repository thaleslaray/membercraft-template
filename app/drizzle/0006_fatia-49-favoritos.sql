CREATE TABLE `favorito` (
	`user_id` text NOT NULL,
	`aula_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`aula_id`) REFERENCES `aula`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorito_aluno_aula_idx` ON `favorito` (`user_id`,`aula_id`);--> statement-breakpoint
CREATE INDEX `favorito_aula_idx` ON `favorito` (`aula_id`);