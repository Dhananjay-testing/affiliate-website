interface PublicProduct {
  slug: string;
  name: string;
  category: string;
  description: string;
  keyFeatures: string[];
  intendedUse: string;
  benefits: string[];
  limitations: string[];
  affiliateUrl: string;
  retailer: string;
}

const disclosure = 'Affiliate link: We may earn a commission from qualifying purchases.';

function makeElement(tag: string, text?: string, className?: string): HTMLElement {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function makeProductCard(product: PublicProduct): HTMLElement {
  const card = makeElement('article', undefined, 'product-card');
  const art = makeElement('div', undefined, 'product-placeholder');
  art.append(makeElement('span', '✳'));
  const body = makeElement('div', undefined, 'product-card-body');
  body.append(makeElement('p', product.category, 'eyebrow'), makeElement('h3', product.name), makeElement('p', product.description));
  const intended = makeElement('p', undefined, 'product-note');
  const strong = makeElement('strong', 'Intended use: ');
  intended.append(strong, document.createTextNode(product.intendedUse));
  body.append(intended);

  const details = document.createElement('details');
  details.className = 'product-details';
  details.append(makeElement('summary', 'Selection notes'));
  const groups: Array<[string, string[]]> = [['Key features', product.keyFeatures], ['Potential benefits', product.benefits], ['Limitations', product.limitations]];
  for (const [label, entries] of groups) {
    const section = document.createElement('div');
    section.append(makeElement('strong', label));
    const list = document.createElement('ul');
    for (const entry of entries) list.append(makeElement('li', entry));
    section.append(list);
    details.append(section);
  }
  const notice = makeElement('span', disclosure, 'disclosure');
  const link = document.createElement('a');
  link.className = 'button button-secondary';
  link.href = product.affiliateUrl;
  link.target = '_blank';
  link.rel = 'sponsored nofollow noopener noreferrer';
  link.append(document.createTextNode(`View at ${product.retailer}`), makeElement('span', '↗'));
  link.lastElementChild?.setAttribute('aria-hidden', 'true');
  body.append(details, notice, link);
  card.append(art, body);
  return card;
}

function showFeedError(container: HTMLElement, message: string) {
  const status = makeElement('p', message, 'feed-status');
  status.setAttribute('role', 'status');
  container.replaceChildren(status);
}

async function loadFeed(container: HTMLElement) {
  if (container.dataset.ssrLoaded === 'true') return;
  try {
    const response = await fetch('/api/products', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Product recommendations are temporarily unavailable. Please try again later.');
    const products = await response.json() as PublicProduct[];
    const category = container.dataset.category?.toLocaleLowerCase();
    const limit = Number(container.dataset.limit ?? 0);
    const matching = products.filter((product) => !category || product.category.toLocaleLowerCase() === category);
    const visible = limit > 0 ? matching.slice(0, limit) : matching;
    const empty = container.querySelector<HTMLElement>('[data-empty-feed]');
    const section = container.closest<HTMLElement>('[data-product-section]');
    if (!visible.length) {
      if (empty) empty.hidden = false;
      if (section) section.hidden = !empty;
      return;
    }
    const list = container.querySelector<HTMLElement>('[data-product-list]');
    if (!list) return;
    list.replaceChildren(...visible.map(makeProductCard));
    if (empty) empty.hidden = true;
    if (section) section.hidden = false;
    const categoryEmpty = document.querySelector<HTMLElement>('[data-empty-category]');
    if (categoryEmpty) categoryEmpty.hidden = true;
    container.hidden = false;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Product recommendations are temporarily unavailable.';
    const empty = container.querySelector<HTMLElement>('[data-empty-feed]');
    if (empty) {
      const messageTarget = empty.querySelector<HTMLElement>('[data-feed-message]');
      if (messageTarget) messageTarget.textContent = message;
      empty.hidden = false;
    } else {
      showFeedError(container, message);
    }
  }
}

for (const container of document.querySelectorAll<HTMLElement>('[data-product-feed]')) void loadFeed(container);
