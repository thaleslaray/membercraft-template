DROP INDEX `material_origem_idx`;--> statement-breakpoint
ALTER TABLE `material_da_aula` ADD `tamanho_origem` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `material_aula_origem_idx` ON `material_da_aula` (`aula_id`,`origem_memberkit`);