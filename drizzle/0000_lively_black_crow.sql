CREATE TABLE `channels` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'GROUP' NOT NULL,
	`created_by_profile_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `channels_org_idx` ON `channels` (`organization_id`);--> statement-breakpoint
CREATE TABLE `meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`creator_profile_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'Reunião interna' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`mode` text DEFAULT 'Videoconferência' NOT NULL,
	`guest_email` text,
	`status` text DEFAULT 'CONFIRMED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meetings_org_start_idx` ON `meetings` (`organization_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`profile_id` text,
	`invite_email` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_email_unique` ON `memberships` (`organization_id`,`invite_email`);--> statement-breakpoint
CREATE INDEX `memberships_profile_idx` ON `memberships` (`profile_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`channel_id` text NOT NULL,
	`sender_profile_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_channel_time_idx` ON `messages` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_profile_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`job_title` text DEFAULT 'Colaborador' NOT NULL,
	`avatar_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE TABLE `statuses` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`author_profile_id` text NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`media_key` text,
	`media_type` text DEFAULT 'TEXT' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `statuses_org_expiry_idx` ON `statuses` (`organization_id`,`expires_at`);