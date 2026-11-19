ALTER TABLE `aula` ADD `origem_memberkit` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `aula_origem_idx` ON `aula` (`origem_memberkit`);--> statement-breakpoint
ALTER TABLE `categoria` ADD `origem_memberkit` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `categoria_origem_idx` ON `categoria` (`origem_memberkit`);--> statement-breakpoint
ALTER TABLE `curso` ADD `origem_memberkit` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `curso_origem_idx` ON `curso` (`origem_memberkit`);--> statement-breakpoint
ALTER TABLE `material_da_aula` ADD `origem_memberkit` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `material_origem_idx` ON `material_da_aula` (`origem_memberkit`);--> statement-breakpoint
ALTER TABLE `modulo` ADD `origem_memberkit` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `modulo_origem_idx` ON `modulo` (`origem_memberkit`);