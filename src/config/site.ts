export const site = {
  name: 'Pickora',
  tagline: 'Discover Better. Choose Smarter.',
  description: 'Helpful product discoveries, practical buying guides and smarter choices for everyday life.',
  url: (import.meta.env.PUBLIC_SITE_URL ?? '').replace(/\/$/, ''), // Set after the production domain is chosen.
  logo: '/brand/pickora-mark.svg',
  socialCard: '/brand/social-card.svg',
  contactEmail: '', // Add a real monitored email before enabling contact details.
  socials: [] as { label: string; url: string }[],
  footerText: 'Useful discoveries and practical guidance for more confident everyday choices.',
  amazonAssociateStatement: 'As an Amazon Associate I earn from qualifying purchases.',
  affiliateDisclosure: 'Affiliate link: We may earn a commission from qualifying purchases.',
  navigation: [
    { label: 'Categories', href: '/categories/' },
    { label: 'Products', href: '/products/' },
    { label: 'Buying guides', href: '/guides/' },
    { label: 'Articles', href: '/articles/' },
    { label: 'Deals', href: '/deals/' },
  ],
};

export const affiliateSettings = {
  amazonIndiaTrackingId: '', // Unverified: enter only after confirming in Associates Central.
  requireVerifiedSpecialLinks: true,
};
