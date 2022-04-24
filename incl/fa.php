<?php
class fa {

	public static function light(string $icon, string $extra_class = "", string $base_class = "fa-fw", string $extra_attr = "") : string {
		return fa::create("light", "$icon", $extra_class, $base_class, $extra_attr);
	}

	public static function regular(string $icon, string $extra_class = "", string $base_class = "fa-fw", string $extra_attr = "") : string {
		return fa::create("regular", "$icon", $extra_class, $base_class, $extra_attr);
	}

	public static function solid(string $icon, string $extra_class = "", string $base_class = "fa-fw", string $extra_attr = "") : string {
		return fa::create("solid", "$icon", $extra_class, $base_class, $extra_attr);
	}

	public static function duotone(string $icon, string $extra_class = "", string $base_class = "fa-fw", string $extra_attr = "") : string {
		return fa::create("duotone", "$icon", $extra_class, $base_class, $extra_attr);
	}

	public static function brands(string $icon, string $extra_class = "", string $base_class = "fa-fw", string $extra_attr = "") : string {
		return fa::create("brands", "$icon", $extra_class, $base_class, $extra_attr);
	}

	private static function create(string $type, string $icon, string $extra_class, string $base_class, string $extra_attr) : string {
		$path = DIR."/svgs/$type/$icon.svg";

		if (!file_exists($path)) {
			return "[?]";
		}

		$svg = file_get_contents($path, false, null, 40);
		return "<svg class=\"svg-inline--fa $base_class $extra_class\" $extra_attr xmlns=\"http://www.w3.org/2000/svg\" ".$svg;
	}
	
}