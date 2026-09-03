CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`sequence` integer NOT NULL,
	`source` text NOT NULL,
	`type` text NOT NULL,
	`signature` text NOT NULL,
	`tool_name` text,
	`tool_command` text,
	`result_status` text,
	`result_confidence` text,
	`exit_code` integer,
	`duration_ms` integer,
	`tokens_input` integer,
	`tokens_output` integer,
	`tokens_cached` integer,
	`file_path` text,
	`payload` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_session_idx` ON `events` (`session_id`);--> statement-breakpoint
CREATE INDEX `events_session_order_idx` ON `events` (`session_id`,`timestamp`,`sequence`);--> statement-breakpoint
CREATE INDEX `events_session_sequence_idx` ON `events` (`session_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `events_timestamp_idx` ON `events` (`timestamp`);--> statement-breakpoint
CREATE INDEX `events_session_signature_idx` ON `events` (`session_id`,`signature`);--> statement-breakpoint
CREATE INDEX `events_session_type_idx` ON `events` (`session_id`,`type`);--> statement-breakpoint
CREATE TABLE `metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`health_score` real,
	`learning_score` real,
	`degradation_score` real,
	`success_rate` real,
	`error_rate` real,
	`recovery_rate` real,
	`repetition_rate` real,
	`correction_loop_rate` real,
	`tool_efficiency` real,
	`context_pressure` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `metrics_session_idx` ON `metrics` (`session_id`);--> statement-breakpoint
CREATE INDEX `metrics_session_timestamp_idx` ON `metrics` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`model` text,
	`goal` text,
	`goal_keywords` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`status` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_started_at_idx` ON `sessions` (`started_at`);--> statement-breakpoint
CREATE INDEX `sessions_status_idx` ON `sessions` (`status`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`timestamp` text NOT NULL,
	`type` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`metadata` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `signals_session_idx` ON `signals` (`session_id`);--> statement-breakpoint
CREATE INDEX `signals_session_timestamp_idx` ON `signals` (`session_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `signals_severity_idx` ON `signals` (`severity`);