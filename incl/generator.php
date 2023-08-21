<?php
use Curl\Curl;

class Gen {

	public static function Signature(string $username, bool $mini, &$output_path, &$err_message, &$err_log) : bool {

		$username = trim($username);
		$profile_url = "https://myanimelist.net/profile/$username";

		if (filter_var($username, FILTER_VALIDATE_URL)) {
			$err_message = "Please put your username. Fetching links is not supported";
			$err_log = false;
			return false;
		}

		$c = new Curl();
		$c->setUserAgent(CURL_USER_AGENT);
		$c->setConnectTimeout(CURL_INIT_TIMEOUT);
		$c->setTimeout(CURL_TIMEOUT);
		$c->get($profile_url);

		if($c->error) {
			$err_message = "Failed to fetch user's profile ({$c->errorMessage})";
			$err_log = false;
			return false;
		}

		$profile_html = $c->response;

		if(!preg_match("/<title>\s*(?<username>.*?)&#039;s Profile.*?<\/title>/s", $profile_html, $matches)) {
			$err_message = "Failed to match HTML username";
			$err_log = true;
			return false;
		}

		$profile_username = htmlspecialchars_decode($matches["username"]);

		if (strtolower($profile_username) !== strtolower($username)) {
			$err_message = "Failed to validate HTML username ($profile_username, $username)";
			$err_log = true;
			return false;
		}

		if(!preg_match("/Days: <\/span>(?<days>.*?)<\//", $profile_html, $matches)) {
			$err_message = "Failed to match user's days";
			$err_log = true;
			return false;
		}

		$profile_days = $matches["days"];

		if(!preg_match("/Episodes<\/span><span class=\"di-ib fl-r\">(?<episodes>.*?)<\//", $profile_html, $matches)) {
			$err_message = "Failed to match user's episodes";
			$err_log = true;
			return false;
		}

		$profile_episodes = $matches["episodes"];

		if(!preg_match("/class=\"user-image mb8\">\s*<img .*?(?:data-)?src=\"(?<url>.*?)\">\s*<\//s", $profile_html, $matches)) {
			$err_message = "Failed to match user's avatar (no profile picture?)";
			$err_log = false;
			return false;
		}

		$profile_avatar_url = $matches["url"];

		preg_match_all("/<img class.*?(?:data-)?src=\"https:\/\/cdn\.myanimelist\.net\/r\/.*?anime\/(?<id>\d+\/\d+).*?alt=\"(?<name>.+?)\">/", $profile_html, $matches);

		$matches_count = count($matches[0]);

		if($matches_count < 1) {
			$err_message = "Failed to match user's anime data entries (anime data set to private?)";
			$err_log = false;
			return false;
		}

		$image_width = 400;
		$image_height = $mini ? 63 : 135;
		$image = imagecreatetruecolor($image_width, $image_height);

		$font_path = DIR."/fonts/Rounded_Elegance.ttf";
		$font_bold_path = DIR."/fonts/Rounded_Elegance.ttf";

		// AVATAR
		$profile_avatar_filename = "__avatar_".md5($profile_avatar_url).".jpg";
		$profile_avatar_path = IMAGE_CACHE_DIR."/$profile_avatar_filename";

		if (!file_exists($profile_avatar_path)) {
			$lock = new Lock(LOCK_DIR."/$profile_avatar_filename.lock");

			if ($lock->lock(true) && !file_exists($profile_avatar_path)) {
				$c->download($profile_avatar_url, $profile_avatar_path);

				if ($c->error) {
					$err_message = "Failed to fetch user's avatar ({$c->errorMessage})";
					$err_log = true;

					$lock->unlock();
					return false;
				}
			}

			$lock->unlock();
		}

		// BACKGROUND
		$background_filename = "__background_".md5($matches["id"][0]).".jpg";
		$background_path = IMAGE_CACHE_DIR."/$background_filename";

		if (!file_exists($background_path)) {
			$lock = new Lock(LOCK_DIR."/$background_filename.lock");

			if ($lock->lock(true) && !file_exists($background_path)) {
				$c->download("https://akamai-origin.myanimelist.net/images/anime/{$matches["id"][0]}.jpg", $background_path);

				if ($c->error) {
					$err_message = "Failed to fetch anime's background picture ({$c->errorMessage})";
					$err_log = true;

					$lock->unlock();
					return false;
				}
			}

			$lock->unlock();
		}

		$background_raw = imagecreatefromstring(file_get_contents($background_path));

		if(!$background_raw) {
			$err_message = "Failed to fetch anime's background picture from cache";
			$err_log = true;
			unlink($background_path);
			return false;
		}

		$background_raw_width = imagesx($background_raw);
		$background_raw_height = imagesy($background_raw);
		$background_width = $image_width - 4;
		$background_height = $image_height - 4;
		$background = Gen::image_scale_x($background_raw, $background_raw_width, $background_raw_height, $background_width);
		Gen::image_blur($background, 10);
		imagecopy($image, $background, 2, 2, 0, 210, $background_width, $background_height);

		// BACKGROUND OVERLAY
		$overlay_color = imagecolorallocatealpha($image, 0, 0, 0, 95);
		imagefilledrectangle($image, 0, 0, $image_width - 1, $image_height - 1, $overlay_color);

		// AVATAR BORDER
		$border_color = imagecolorallocate($image, 0, 0, 0);
		imagefilledrectangle($image, 6, 6, 56, 56, $border_color);

		// AVATAR
		$avatar = imagecreatefromstring(file_get_contents($profile_avatar_path));

		if(!$avatar) {
			$err_message = "Failed to fetch user's avatar from cache";
			$err_log = true;
			unlink($profile_avatar_path);
			return false;
		}

		$avatar_width = imagesx($avatar);
		$avatar_height = imagesy($avatar);

		if($avatar_width > $avatar_height) {
			$avatar_scaled = Gen::image_scale_y($avatar, $avatar_width, $avatar_height, 49);
			$avatar_scaled_width = imagesx($avatar_scaled);
			imagecopy($image, $avatar_scaled, 7, 7, (($avatar_scaled_width - 49) / 2), 0, 49, 49);
		}
		else {
			$avatar_scaled = Gen::image_scale_x($avatar, $avatar_width, $avatar_height, 49);
			imagecopy($image, $avatar_scaled, 7, 7, 0, 0, 49, 49);
		}

		// USER INFO
		$username_font_size = Gen::string_font_size($username, 170, $font_bold_path, 16);
		Gen::image_string_draw($image, $username_font_size, 62, 29, $font_bold_path, $username, true);
		Gen::image_string_draw($image, 12, 62, 48, $font_path, "MyAnimeList.net", false);

		// USER STATS
		Gen::image_string_draw($image, 14, 236, 29, $font_path, "Episodes: $profile_episodes", false);
		Gen::image_string_draw($image, 14, 236, 50, $font_path, "Days: $profile_days", false);

		if(!$mini) {

			// ANIME LIST
			Gen::image_string_draw($image, 15, 8, 80,  $font_path, "♦ ".Gen::string_cut(html_entity_decode($matches["name"][0]), 300, $font_path, 15), false);

			if($matches_count >= 2) {
				Gen::image_string_draw($image, 15, 8, 102, $font_path, "♦ ".Gen::string_cut(html_entity_decode($matches["name"][1]), 300, $font_path, 15), false);
			}

			if($matches_count >= 3) {
				Gen::image_string_draw($image, 15, 8, 124, $font_path, "♦ ".Gen::string_cut(html_entity_decode($matches["name"][2]), 300, $font_path, 15), false);
			}

			// WATERMARK
			$watermark = imagecreatefrompng("img/watermark.png");
			imagecopy($image, $watermark, 333, 85, 0, 0, 60, 60);

		}

		if($mini) {
			$output_path = "img/signatures/__small_".md5($username).".png";
		}
		else {
			$output_path = "img/signatures/__normal_".md5($username).".png";
		}

		imagepng($image, $output_path);
		return true;
	}

	private static function image_scale_x($input, int $width, int $height, int $newWidth) {
		$ratio = $width / $height;
		$newHeight = $newWidth / $ratio;
		$scaled = imagecreatetruecolor($newWidth, $newHeight);
		imagecopyresampled($scaled, $input, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
		return $scaled;
	}

	private static function image_scale_y($input, int $width, int $height, int $newHeight) {
		$ratio = $width / $height;
		$newWidth = $newHeight * $ratio;
		$scaled = imagecreatetruecolor($newWidth, $newHeight);
		imagecopyresampled($scaled, $input, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
		return $scaled;
	}

	private static function image_blur($input, int $amount) : void {
		for ($i = 0; $i < $amount; $i++) {
			imagefilter($input, IMG_FILTER_GAUSSIAN_BLUR);
		}
	}

	private static function string_font_size(string $string, int $length, string $font, float $size) : float {
		while(true){
			list($left,, $right) = imageftbbox($size, 0, $font, $string);
			$width = $right - $left;
			if($width <= $length){
				break;
			}
			$size -= 0.5;
		}
		return $size;
	}

	private static function string_cut(string $string, int $length, string $font, float $size) {
		$cut = false;
		$string = trim($string);
		while(true){
			if($cut){
				list($left,, $right) = imageftbbox($size, 0, $font, trim($string)."...");
			}
			else{
				list($left,, $right) = imageftbbox($size, 0, $font, $string);
			}
			$width = $right - $left;
			if($width <= $length){
				break;
			}
			$cut = true;
			$string = substr($string, 0, strlen($string) - 1);
			$string = trim($string);
		}
		if($cut){
			return $string."...";
		}
		return $string;
	}

	private static function image_string_draw($image, float $size, int $x, int $y, string $font, string $text, bool $bolded) : void {
		$fontColorB = imagecolorallocate($image, 0, 0, 0);
		$fontColorW = imagecolorallocate($image, 255, 255, 255);
		if(!$bolded) {
			imagettftext($image, $size, 0, $x + 1, $y + 1, $fontColorB, $font, $text);
			imagettftext($image, $size, 0, $x, $y, $fontColorW, $font, $text);
		}
		else{
			imagettftext($image, $size, 0, $x + 1, $y + 1, $fontColorB, $font, $text);
			imagettftext($image, $size, 0, $x + 2, $y + 1, $fontColorB, $font, $text);
			imagettftext($image, $size, 0, $x, $y, $fontColorW, $font, $text);
			imagettftext($image, $size, 0, $x + 1, $y, $fontColorW, $font, $text);
		}
	}

}
