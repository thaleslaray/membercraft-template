CREATE TABLE `aparencia` (
	`id` text PRIMARY KEY NOT NULL,
	`tema` text NOT NULL,
	`cor_da_marca` text,
	`logo_url` text,
	`favicon_url` text,
	`fundo_do_menu_url` text,
	`fundo_do_login_url` text,
	`atualizado_em` integer NOT NULL,
	`atualizado_por` text,
	FOREIGN KEY (`atualizado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
