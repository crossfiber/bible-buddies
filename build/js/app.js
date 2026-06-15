// Boot. Registers every screen, wires navigation, and opens Home.

(function () {
  'use strict';

  function start() {
    HomeScreen.register();
    SectionsScreen.register();
    GalleryScreen.register();
    ColoringScreen.register();
    Screens.wireNavButtons();
    Screens.show('home');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
