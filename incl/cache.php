<?php
class Cache {

	public static function get(string $key, &$value) : bool {
		$redis_key = CACHE_REDIS_PREFIX.":".$key;
		$redis = RedisInstance::get();
		$value = $redis->get($redis_key);
		return $value !== false;
	}

	public static function set(string $key, int $ttl, $value) {
		$redis_key = CACHE_REDIS_PREFIX.":".$key;
		$redis = RedisInstance::get();
		return $redis->setex($redis_key, $ttl, $value);
	}

}