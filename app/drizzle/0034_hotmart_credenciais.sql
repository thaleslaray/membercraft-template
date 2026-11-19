CREATE TABLE `credencial_hotmart` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id_cifrado` text NOT NULL,
	`client_secret_cifrado` text NOT NULL,
	`basic_cifrado` text NOT NULL,
	`hottok_cifrado` text NOT NULL,
	`sandbox` integer DEFAULT false NOT NULL,
	`token_cifrado` text,
	`token_expira_em` integer,
	`atualizado_em` integer NOT NULL,
	`atualizado_por` text,
	FOREIGN KEY (`atualizado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
