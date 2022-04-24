<?php
class Lock {

	private $_file;

	public function __construct(string $path) {
		$this->_file = fopen($path, "w+");
	}

	public function __destruct() {
		fclose($this->_file);
	}

	public function lock(bool $wait = false) : bool {
		return $wait ? flock($this->_file, LOCK_EX) : flock($this->_file, LOCK_EX | LOCK_NB);
	}

	public function unlock() : bool {
		return flock($this->_file, LOCK_UN);
	}

}