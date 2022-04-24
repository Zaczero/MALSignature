<?php
class RedisInstance {

	private static $_instance = null;

	public static function get() : Redis {
		if (RedisInstance::$_instance === null) {
			RedisInstance::$_instance = RedisInstance::initialize();
		}

		return RedisInstance::$_instance;
	}

	private static function initialize() : Redis {
		$redis = new Redis();
		if (empty(REDIS_SOCKET))
			$redis->pconnect(REDIS_HOST, REDIS_PORT);
		else
			$redis->pconnect(REDIS_SOCKET);
		if (!empty(REDIS_PASSWORD))
			$redis->auth(REDIS_PASSWORD);
		$redis->setOption(Redis::OPT_PREFIX, REDIS_PREFIX);
		$redis->select(REDIS_DBINDEX);
		return $redis;
	}

	public static function getKey(...$sections) : string {
		$key = "";
		$sections_count = count($sections);

		for ($i = 0; $i < $sections_count; $i++) {
			if ($i + 1 < $sections_count) {
				$key .= $sections[$i] . ":";
			}
			else {
				$key .= $sections[$i];
			}
		}

		return $key;
	}

}