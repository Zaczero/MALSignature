<?php

function push_font(string $url) : void {
	push($url, "font");
}

function push_style(string $url) : void {
	push($url, "style");
}

function push_script(string $url) : void {
	push($url, "script");
}

function push_image(string $url) : void {
	push($url, "image");
}

function push_audio(string $url) : void {
	push($url, "audio");
}

function push_video(string $url) : void {
	push($url, "video");
}

function push(string $url, string $as) : void {
	header("Link: <$url>; rel=preload; as=$as", false);
}