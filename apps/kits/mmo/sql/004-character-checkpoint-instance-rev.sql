-- 004（MK1-B4）：角色检查点 rev 改为按角色单调分配（角色跨分线后各分线的信封 rev 会撞），信封里的分线 rev 落独立列 instance_rev，
-- 重放去重键 = (instance_id, instance_rev, state_hash)；只追加列与索引（账本保证只跑一次）。
ALTER TABLE k_mmo_character_checkpoint ADD COLUMN instance_rev BIGINT UNSIGNED NOT NULL DEFAULT 0;
ALTER TABLE k_mmo_character_checkpoint ADD INDEX ix_mmo_character_checkpoint_instance (server_id, character_id, instance_id, instance_rev);
