<?php
set_head_title_suffix("Ranking of the most popular signatures 🏆");
html_begin();
LOAD("template", ["navbar"]);
?>
<div class="container h-100">

	<div style="height: 100px"></div>
	<div>

		<div class="card">
			<div class="card-body">

				<div class="text-center">
					<h5 class="card-title mb-2">Most popular signatures <?=fa::solid("trophy")?></h5>
					<a class="btn btn-sm btn-pill btn-primary mb-3 mr-2" href="#search-modal" data-toggle="modal"><?=fa::solid("search", "mr-1")?> Search</a>
					<a class="btn btn-sm btn-pill btn-primary btn-premium mb-3" href="/?/donate">Donate <?=fa::solid("heart", "ml-1")?></a>
				</div>

				<div class="text-monospace mb-3">

					<?php
					$page = GET("page");

					if(empty($page)) {
						$page = 1;
					}
					else {
						$page = (int) $page;
					}

					if(!Cache::get("ranking:0", $rows_s)) {
						$db = MysqliDb::getInstance();
						$db->orderBy("views", "DESC");
						$rows = $db->get("signatures");
						$rows["id"] = guidv4();

						Cache::set("ranking:0", RANKING_TTL, serialize($rows));
					}
					else {
						$rows = unserialize($rows_s);
					}

					$rows_count = count($rows);
					$max_page = (int) ($rows_count / RANKING_ENTRIES_PER_PAGE);

					if($rows_count % RANKING_ENTRIES_PER_PAGE !== 0) {
						$max_page++;
					}

					if((int) $page > $max_page || (int) $page < 1) {
						exit_message("info", "This page does not exist");
					}

					$index = ($page - 1) * RANKING_ENTRIES_PER_PAGE;
					$entries = array_slice($rows, $index, RANKING_ENTRIES_PER_PAGE);

					if(!Cache::get("ranking:$page", $recent_views_s)) {
update_recent_views_cache:
						$recent_views = [];
						$recent_views["id"] = $rows["id"];

						// why -1? exclude "id" key from count
						for($i = 0; $i < count($entries) - 1; $i++) {
							$entry = $entries[$i];
							$recent_views[$entry["id"]] = SigStatistics::GetViews($entry["id"]);
						}

						Cache::set("ranking:$page", RANKING_TTL, serialize($recent_views));
					}
					else {
						$recent_views = unserialize($recent_views_s);

						if($recent_views["id"] !== $rows["id"]) {
							goto update_recent_views_cache;
						}
					}

					// why -1? exclude "id" key from count
					for($i = 0; $i < count($entries) - 1; $i++) {
						$entry = $entries[$i];
						$position = (int) (($page - 1) * 100 + $i + 1);

						echo '<div class="mb-1">';

						if($position === 1) {
							echo '<span class="text-gold">'.fa::regular("trophy-alt").'</span>';
						}
						else if($position === 2) {
							echo '<span class="text-silver">'.fa::regular("medal").'</span>';
						}
						else if($position === 3) {
							echo '<span class="text-bronze">'.fa::regular("medal").'</span>';
						}
						else {
							echo '<span>#'.$position.'</span>';
						}

						echo ' <a class="'.($entry["is_supporter"] ? 'supporter' : '').'" title="'.($entry["is_supporter"] ? 'Supporter' : '').'" href="https://myanimelist.net/profile/'.urlencode($entry["username"]).'" target="_blank">'.htmlentities($entry["username"]).'</a>';
						echo ' @ '.number_format($entry["views"]),' views';

						$entry_recent_views = $recent_views[$entry["id"]];
						if($entry_recent_views > 0) { 
							echo ' <abbr class="ranking-extra initialism font-italic small" title="Views in the last 24 hours">(+'.number_format($entry_recent_views).')</abbr>';
						}

						echo "</div>";
					}
					?>

				</div>

				<nav class="float-right">
					<ul class="pagination small mb-0">
						<?php
						for($i = max(1, (int) $page - 2); $i < (int) $page; $i++) {
							?>
							<li class="page-item">
								<a class="page-link" href="/?/ranking?page=<?=$i?>"><?=$i?></a>
							</li>
							<?php
						}
						?>
						<li class="page-item active">
							<a class="page-link" href="/?/ranking?page=<?=$page?>"><?=$page?></a>
						</li>
						<?php
						for($i = (int) $page + 1; $i < min($max_page + 1, (int) $page + 3); $i++) {
							?>
							<li class="page-item">
								<a class="page-link" href="/?/ranking?page=<?=$i?>"><?=$i?></a>
							</li>
							<?php
						}
						?>
					</ul>
				</nav>

			</div>
		</div>

	</div>
	<div style="height: 100px"></div>

</div>

<div class="modal fade" id="search-modal" tabindex="-1" role="dialog" aria-labelledby="search-modal-title" aria-hidden="true">
	<div class="modal-dialog" role="document">
		<div class="modal-content">
			<div class="modal-header">
				<h5 class="modal-title" id="search-modal-title"><?=fa::regular("search")?> Ranking search</h5>
				<button class="close" data-dismiss="modal" aria-label="Close">
					<span aria-hidden="true">&times;</span>
				</button>
			</div>
			<div class="modal-body">

				<form method="post" action="/?/api/rankingSearch">

					<div class="form-group">
						<input id="username" class="form-control form-control-xsm" placeholder="Username" type="text" name="username" required>
					</div>

					<?=Csrf::createField("search")?>
					<button class="btn btn-sm btn-pill btn-primary float-right" type="submit">Submit <?=fa::solid("caret-right")?></button>

				</form>

			</div>
		</div>
	</div>
</div>