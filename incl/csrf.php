<?php
class Csrf {

	public static function getCookieKey() : string {
		$key = COOKIE("csrf_id", false);

		if(strlen($key) !== CSRF_KEY_LEN * 2) {
			$key = bin2hex(random_bytes(CSRF_KEY_LEN));
			setcookie("csrf_id", $key, time() + CSRF_KEY_TTL, "/", URL_DOMAIN, URL_IS_SECURE, true);
			$_COOKIE["csrf_id"] = $key;
		}

		return $key;
	}

	public static function createField(string $action = "") : void {
		echo Csrf::getField($action);
	}

	public static function getField(string $action = "") : string {
		$token = guidv4();
		$value = hash(CSRF_CHALLENGE_ALGO, Csrf::getCookieKey().";$token;$action");

		$redis = RedisInstance::get();
		$redis_key = RedisInstance::getKey(CSRF_REDIS_PREFIX, $token);
		$redis->setex($redis_key, CSRF_TTL, $value);

		return '<input name="csrf" type="hidden" value="'.$token.'">';
	}

	public static function validate(string $action = "") : bool {
		$token = POST("csrf", false);

		if(strlen($token) !== 36) {
			trigger_error("Missing CSRF token: '$action'");
			return false;
		}

		$redis_key = CSRF_REDIS_PREFIX.":".$token;
		$redis = RedisInstance::get();
		$value = $redis->get($redis_key);

		if($value === false) {
			return false;
		}

		$redis->del($redis_key);
		return $value === hash(CSRF_CHALLENGE_ALGO, Csrf::getCookieKey().";$token;$action");
	}

}