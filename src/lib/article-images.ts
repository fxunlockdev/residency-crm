/**
 * The hero images an article may use.
 *
 * A fixed list, not an upload field. Every entry is artwork the design
 * package already ships, with the alt text and caption it is already
 * published with, so a new article cannot introduce an image the site never
 * had or describe an existing one differently on two pages.
 */
export type HeroImage = {
  key: string;
  /** Shown in the CRM's picker. */
  label: string;
  desktop: string;
  mobile: string;
  alt: string;
  caption: string;
  /**
   * The hero class the site's stylesheet uses to set object-position for
   * this artwork. `hero-media-city` is the default and has no rule of its
   * own; family and campus are framed differently.
   */
  mediaClass: string;
};

export const HERO_IMAGES: readonly HeroImage[] = Object.freeze([
  {
    key: 'new-york',
    label: 'New York skyline',
    desktop: '/assets/new-york-tiffany-brighter.webp',
    mobile: '/assets/new-york-tiffany-brighter-mobile.webp',
    alt: 'Editorial New York skyline with a Tiffany blue taxi',
    caption: 'Your next chapter. A broader horizon.',
    mediaClass: 'hero-media-city',
  },
  {
    key: 'family',
    label: 'Family by the waterfront',
    desktop: '/assets/family-waterfront.webp',
    mobile: '/assets/family-waterfront-mobile.webp',
    alt: 'An illustrative Indian family walking together beside the New York waterfront',
    caption: 'A life together, in the United States.',
    mediaClass: 'hero-media-family',
  },
  {
    key: 'campus',
    label: 'American campus',
    desktop: '/assets/american-campus.webp',
    mobile: '/assets/american-campus-mobile.webp',
    alt: 'An illustrative American university campus with tree-lined paths',
    caption: 'Room to learn. Space to grow.',
    mediaClass: 'hero-media-campus',
  },
  {
    key: 'pacific',
    label: 'San Francisco Bay',
    desktop: '/assets/pacific-coast.webp',
    mobile: '/assets/pacific-coast-mobile.webp',
    alt: 'An editorial view of San Francisco Bay and the Golden Gate Bridge',
    caption: 'A new perspective on what comes next.',
    mediaClass: 'hero-media-city',
  },
]);

export const HERO_IMAGE_KEYS = HERO_IMAGES.map((image) => image.key);

export function heroImage(key: string): HeroImage {
  return HERO_IMAGES.find((image) => image.key === key) ?? HERO_IMAGES[0]!;
}

/**
 * The filter buttons the published /insights/ page renders. An article filed
 * under anything else would load and then be hidden by the first filter
 * click, so the choice is closed.
 */
export const ARTICLE_KINDS = Object.freeze(['News analysis', 'Investor guidance', 'Policy explainer']);
