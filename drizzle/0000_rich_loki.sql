CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`input_hash` text NOT NULL,
	`schema_version` integer NOT NULL,
	`score_version` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`anchor_date` text NOT NULL,
	`discovery_url` text NOT NULL,
	`discovery_complete` integer NOT NULL,
	`selection` text NOT NULL,
	`collector` text NOT NULL,
	`procedure` text NOT NULL,
	`limitations` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dinner_observations` (
	`collection_id` text NOT NULL,
	`resy_url` text NOT NULL,
	`dining_date` text NOT NULL,
	`observed_at` text NOT NULL,
	`status` text NOT NULL,
	`detail` text NOT NULL,
	PRIMARY KEY(`collection_id`, `resy_url`, `dining_date`),
	FOREIGN KEY (`collection_id`,`resy_url`) REFERENCES `restaurant_snapshots`(`collection_id`,`resy_url`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `restaurant_snapshots` (
	`collection_id` text NOT NULL,
	`resy_url` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`geography` text NOT NULL,
	`eligibility` text NOT NULL,
	`reason` text NOT NULL,
	`booking_policy` text,
	`evidence` text NOT NULL,
	PRIMARY KEY(`collection_id`, `resy_url`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scarcity_scores` (
	`collection_id` text NOT NULL,
	`resy_url` text NOT NULL,
	`start_day` integer NOT NULL,
	`end_day` integer NOT NULL,
	`available` integer NOT NULL,
	`unavailable` integer NOT NULL,
	`non_service` integer NOT NULL,
	`unreleased` integer NOT NULL,
	`unknown` integer NOT NULL,
	`collection_error` integer NOT NULL,
	`missing` integer NOT NULL,
	`assessed` integer NOT NULL,
	`score` real,
	`reason` text,
	PRIMARY KEY(`collection_id`, `resy_url`, `start_day`),
	FOREIGN KEY (`collection_id`,`resy_url`) REFERENCES `restaurant_snapshots`(`collection_id`,`resy_url`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "score_range" CHECK("scarcity_scores"."score" is null or "scarcity_scores"."score" between 0 and 100),
	CONSTRAINT "seven_dates" CHECK("scarcity_scores"."available" + "scarcity_scores"."unavailable" + "scarcity_scores"."non_service" + "scarcity_scores"."unreleased" + "scarcity_scores"."unknown" + "scarcity_scores"."collection_error" + "scarcity_scores"."missing" = 7)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE VIEW `restaurant_ranking` AS
  with latest as (
    select r.*, c.started_at, c.finished_at, c.anchor_date,
      row_number() over (
        partition by r.resy_url order by c.finished_at desc, c.started_at desc, c.id desc
      ) as recency
    from restaurant_snapshots r
    join collections c on c.id = r.collection_id
  )
  select r.resy_url, r.name, r.address, r.collection_id,
    r.started_at as observed_from, r.finished_at as observed_through,
    r.anchor_date, r.geography, r.eligibility, r.reason as eligibility_reason,
    r.booking_policy, s.score, s.reason as score_reason,
    s.assessed, s.available, s.unavailable, s.non_service,
    s.unreleased, s.unknown, s.collection_error, s.missing,
    (select min(o.dining_date) from dinner_observations o
      where o.collection_id = r.collection_id and o.resy_url = r.resy_url
        and o.status = 'available') as earliest_available_date,
    (select count(*) from dinner_observations o
      where o.collection_id = r.collection_id and o.resy_url = r.resy_url
        and o.status = 'available'
        and strftime('%w', o.dining_date) in ('5', '6')) as weekend_available_dates
  from latest r
  join scarcity_scores s on s.collection_id = r.collection_id
    and s.resy_url = r.resy_url and s.start_day = 1
  where r.recency = 1
;