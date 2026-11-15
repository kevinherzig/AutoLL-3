import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  APP_ICON,
  APP_NAME,
  APP_SLUG,
  PAGES_BASE,
  applyAppIdentity,
  pagesBasePath,
} from './appIdentity';

/** A document of its own, so the suite's real one is not renamed under it. */
function freshDoc(): Document {
  return document.implementation.createHTMLDocument('Disney');
}

describe('applyAppIdentity()', () => {
  // Two builds open at once are two tabs on disneyworld.disney.go.com. The
  // title is what the tab strip shows, and nothing set it before.
  it('names the tab after this build', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    expect(doc.title).toBe(APP_NAME);
  });

  it('installs an icon that carries the glyph', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link).not.toBeNull();
    expect(decodeURIComponent(link!.href)).toContain(APP_ICON);
  });

  // It replaced a `data:,` blank. An icon that renders nothing would identify
  // the build no better than the blank did.
  it('is not the blank favicon it replaced', () => {
    const doc = freshDoc();
    applyAppIdentity(doc);
    const link = doc.querySelector<HTMLLinkElement>('link[rel="icon"]');
    // `getAttribute` rather than `toHaveAttribute`: these elements belong to
    // a document of their own, and jest-dom's matchers test `instanceof`
    // against the suite's window, which a detached document fails.
    /* eslint-disable jest-dom/prefer-to-have-attribute */
    expect(link!.getAttribute('href')).not.toBe('data:,');
    expect(link!.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    /* eslint-enable jest-dom/prefer-to-have-attribute */
  });

  // The whole point is telling two builds apart, so the name has to be this
  // build's rather than the upstream one every fork inherits.
  it('does not call itself bg1', () => {
    expect(APP_NAME.toLowerCase()).not.toBe('bg1');
  });
});

/**
 * These four values are the whole difference between this build and its sibling.
 *
 * AutoLL-3 and AutoLL-4 are kept as mutual fallbacks and are synced by merging
 * one into the other, so the identity file is the one place a merge is supposed
 * to stop. Nothing in git makes it stop there -- a merge that silently takes the
 * wrong side of this file produces a build that calls itself by the other's
 * name, writes to the other's storage keys, and hands a live Disney session to
 * the other's responder page.
 *
 * So the name test does not assert the literal 'AutoLL-3', which would only
 * restate the source file and would have to differ between the two repos. It
 * asserts that the name agrees with `package.json`, which a merge would have
 * to get wrong in the same direction at the same time for this to pass.
 *
 * The pages origin is the exception, and it is asserted literally. This fork
 * is self-hosted at https://ll.herzig.net, at the site root. A merge that
 * takes upstream's GitHub Pages URL would hand the responder a different
 * origin, so that assertion is supposed to fail until someone puts it back.
 */
describe('this build knows which build it is', () => {
  const pkg = JSON.parse(
    readFileSync(join(process.cwd(), 'package.json'), 'utf8')
  ) as { repository: string };
  const repoName = pkg.repository.replace(/^.*\//, '');

  it('calls itself what the repository is called', () => {
    expect(APP_NAME).toBe(repoName);
  });

  it('serves its pages from the self-hosted site root', () => {
    expect(PAGES_BASE).toBe('https://ll.herzig.net');
    expect(pagesBasePath()).toBe('/');
  });

  // The old GitHub Pages URL put the bundle under /AutoLL-3/. A path that
  // loses its trailing slash would make Vite emit the wrong asset URLs.
  it('keeps a path prefix when the pages URL has one', () => {
    expect(pagesBasePath('https://mbs1234.github.io/AutoLL-3')).toBe(
      '/AutoLL-3/'
    );
  });

  it('is the origin the deploy workflow brands the static site with', () => {
    const yml = readFileSync(
      join(process.cwd(), '.github/workflows/deploy.yml'),
      'utf8'
    );
    const origin = yml.match(/^ {2}PAGES_ORIGIN: (\S+)/m)?.[1];
    expect(origin).toBe(PAGES_BASE);
  });

  // The slug prefixes localStorage keys, notification tags and the cross-tab
  // quarantine event. It is deliberately a separate constant rather than a
  // derivation, so this is where the two are held to each other.
  it('uses a slug that is the name in storage-safe form', () => {
    expect(APP_SLUG).toBe(APP_NAME.toLowerCase().replace(/-/g, ''));
  });
});
