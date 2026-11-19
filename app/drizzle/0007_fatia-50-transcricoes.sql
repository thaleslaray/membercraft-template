CREATE TABLE `transcricao` (
	`vimeo_id` text PRIMARY KEY NOT NULL,
	`arquivo` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trecho_da_transcricao` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vimeo_id` text NOT NULL,
	`inicio` integer NOT NULL,
	`texto` text NOT NULL,
	`texto_busca` text NOT NULL,
	FOREIGN KEY (`vimeo_id`) REFERENCES `transcricao`(`vimeo_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `trecho_transcricao_video_idx` ON `trecho_da_transcricao` (`vimeo_id`,`inicio`);