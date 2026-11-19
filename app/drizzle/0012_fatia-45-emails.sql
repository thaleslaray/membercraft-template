CREATE TABLE `aviso_agrupado` (
	`id` text PRIMARY KEY NOT NULL,
	`chave` text NOT NULL,
	`dados` text DEFAULT '{}' NOT NULL,
	`criado_em` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aviso_agrupado_chave_idx` ON `aviso_agrupado` (`chave`,`criado_em`);--> statement-breakpoint
CREATE TABLE `email_desligado` (
	`user_id` text NOT NULL,
	`tipo` text NOT NULL,
	`desligado_em` integer NOT NULL,
	PRIMARY KEY(`user_id`, `tipo`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `envio_de_email` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`para` text NOT NULL,
	`tipo` text NOT NULL,
	`variaveis` text DEFAULT '{}' NOT NULL,
	`assunto` text,
	`status` text DEFAULT 'na-fila' NOT NULL,
	`provedor` text,
	`id_do_provedor` text,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`erro` text,
	`retorno` text,
	`criado_em` integer NOT NULL,
	`enviado_em` integer,
	`retorno_em` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `envio_email_user_idx` ON `envio_de_email` (`user_id`,`criado_em`);--> statement-breakpoint
CREATE INDEX `envio_email_provedor_idx` ON `envio_de_email` (`id_do_provedor`);--> statement-breakpoint
CREATE TABLE `texto_de_email` (
	`tipo` text PRIMARY KEY NOT NULL,
	`assunto` text NOT NULL,
	`corpo` text NOT NULL,
	`atualizado_por` text,
	`atualizado_em` integer NOT NULL,
	FOREIGN KEY (`atualizado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
