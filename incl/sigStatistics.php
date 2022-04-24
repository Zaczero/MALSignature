<?php
class SigStatistics {

	public static function GetViews(int $user_id) : int {
		$redis = RedisInstance::get();
		$redis_key_match = "signature_statistics:$user_id:*";
		$redis_lua = <<<LUA
local sum = 0
local matches = redis.call("KEYS", KEYS[1])

for _,key in ipairs(matches) do
	local val = redis.call("GET", key)
	sum = sum + tonumber(val)
end

return sum
LUA;

		return (int) $redis->eval($redis_lua, [$redis_key_match], 1);
	}

}