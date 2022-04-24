<?php
class SigManager {

	public static function Get(string $username, bool $mini, bool $generate, &$output_path, &$err_message, &$err_log) : bool {
		$db = MysqliDb::getInstance();
		$db->where("username", $username);
		$row = $db->getOne("signatures");

		if($row === null && !$generate) {
			$err_message = "Hey! To generate your own signature please visit ".URL." :)";
			$err_log = false;
			return false;
		}

		if(!SigManager::GetCached($username, $mini, $output_path)) {
			if(!Gen::Signature($username, $mini, $output_path, $err_message, $err_log)) {
				return false;
			}
			SigManager::MarkUpdated($username, $mini);
		}
		SigManager::MarkViewed($username);
		return true;
	}

	public static function GetCached(string $username, bool $mini, &$output_path) : bool {
		$db = MysqliDb::getInstance();
		$db->where("username", $username);
		$row = $db->getOne("signatures");

		if($row === null) {
			return false;
		}

		$update_time = $mini ? $row["mini_update_time"] : $row["update_time"];
		if($update_time + SIGNATURE_CACHE_TTL < time()) {
			return false;
		}

		if($mini) {
			$output_path = "img/signatures/__small_".md5($username).".png";
		}
		else {
			$output_path = "img/signatures/__normal_".md5($username).".png";
		}

		return file_exists($output_path);
	}

	public static function MarkUpdated(string $username, bool $mini) : bool {
		$db = MysqliDb::getInstance();
		$db->where("username", $username);
		$row = $db->getOne("signatures");

		if($row === null) {
			$db->insert("signatures", [
				"username" => $username,
				"views" => 0,
				"update_time" => 0,
				"mini_update_time" => 0,
				"is_supporter" => 0,
			]);
		}

		$db->where("username", $username);
		$db->update("signatures", [
			$mini ? "mini_update_time" : "update_time" => time(),
		]);

		return true;
	}

	public static function MarkViewed(string $username) : bool {
		$db = MysqliDb::getInstance();
		$db->where("username", $username);
		$db->update("signatures", [
			"views" => $db->inc(),
		]);

		$db->where("username", $username);
		$row = $db->getOne("signatures");
		$user_id = $row["id"];

		$time = time();
		$start_time = $time - ($time % STATISTICS_TIME);

		$redis_key = "signature_statistics:$user_id:$start_time";
		$redis = RedisInstance::get();
		$value = $redis->get($redis_key);

		if($value) {
			$redis->incr($redis_key);
		}
		else {
			$redis->setex($redis_key, STATISTICS_TIME * STATISTICS_COUNT, 1);
		}

		return true;
	}

}