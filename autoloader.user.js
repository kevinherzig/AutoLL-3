// ==UserScript==
// @name         AutoLL-3 Autoloader
// @namespace    https://ll.herzig.net/
// @version      0.4
// @description  Automatically loads the AutoLL-3 interface
// @author       Joel Bruick
// @match        https://ll.herzig.net/start.html
// @match        https://disneyworld.disney.go.com/vas/
// @match        https://disneyworld.disney.go.com/*/vas/
// @grant        none
// ==/UserScript==
'use strict';

const bg1Url = 'https://ll.herzig.net/';
if (window.location.href === bg1Url + 'start.html') {
  document.body.classList.add('autoload');
} else {
  document.open();
  document.write(
    `<!doctype html><link rel=stylesheet href="${bg1Url}bg1.css"><body>`
  );
  const script = document.createElement('script');
  script.type = 'module';
  script.src = bg1Url + 'bg1.js';
  document.head.appendChild(script);
}
