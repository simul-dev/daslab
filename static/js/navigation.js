(function () {
	'use strict';

	var nav = document.querySelector('body > nav');
	if (!nav) return;

	var toggle = nav.querySelector('.nav-menu-toggle');
	var links = nav.querySelector('.nav-links');
	if (!toggle || !links) return;

	function closeMenu() {
		nav.classList.remove('nav-open');
		toggle.setAttribute('aria-expanded', 'false');
	}

	toggle.addEventListener('click', function () {
		var open = !nav.classList.contains('nav-open');
		nav.classList.toggle('nav-open', open);
		toggle.setAttribute('aria-expanded', String(open));
	});

	links.addEventListener('click', function (event) {
		if (event.target.closest('a')) closeMenu();
	});

	document.addEventListener('keydown', function (event) {
		if (event.key === 'Escape') {
			closeMenu();
			toggle.focus();
		}
	});

	document.addEventListener('pointerdown', function (event) {
		if (!nav.contains(event.target)) closeMenu();
	});

	var desktop = window.matchMedia('(min-width: 901px)');
	if (desktop.addEventListener) desktop.addEventListener('change', closeMenu);
})();
