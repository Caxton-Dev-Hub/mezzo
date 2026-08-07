export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mezzoescrow.xyz').replace(
  /\/$/,
  '',
);

export const SITE_NAME = 'Mezzo';

export const SITE_TAGLINE = 'Escrow that documents the item before money moves';

export const SITE_DESCRIPTION =
  'Mezzo is a Nigerian escrow service that holds the buyer’s payment while the seller photographs and fingerprints the item. Funds release on proof, not on a promise.';

export const SITE_KEYWORDS = [
  'escrow Nigeria',
  'escrow service Nigeria',
  'online escrow naira',
  'safe online payment Nigeria',
  'buyer protection Nigeria',
  'seller protection Nigeria',
  'secure payment for online sellers',
  'dispute resolution escrow',
  'escrow for Instagram sellers',
  'escrow for WhatsApp business',
];

export function absoluteUrl(path = '/'): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export function organizationSchema(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': absoluteUrl('/#organization'),
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/mezzo-mark.svg'),
    description: SITE_DESCRIPTION,
    areaServed: {
      '@type': 'Country',
      name: 'Nigeria',
    },
  };
}

export function websiteSchema(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    url: absoluteUrl('/'),
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: 'en-NG',
    publisher: { '@id': absoluteUrl('/#organization') },
  };
}

export function serviceSchema(): Record<string, unknown> {
  return {
    '@type': 'FinancialProduct',
    '@id': absoluteUrl('/#service'),
    name: 'Mezzo escrow',
    description:
      'An escrow account that holds a buyer’s payment until the item has been documented, delivered and inspected, or until an arbiter decides the outcome.',
    provider: { '@id': absoluteUrl('/#organization') },
    areaServed: {
      '@type': 'Country',
      name: 'Nigeria',
    },
    feesAndCommissionsSpecification:
      '1.5% of the transaction, capped at ₦7,500, charged once at release. No fee on a refunded escrow.',
  };
}

export function faqSchema(faqs: ReadonlyArray<{ question: string; answer: string }>) {
  return {
    '@type': 'FAQPage',
    '@id': absoluteUrl('/#faq'),
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function jsonLdGraph(nodes: ReadonlyArray<Record<string, unknown>>): string {
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': nodes });
}
