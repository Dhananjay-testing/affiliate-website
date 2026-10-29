const form = document.querySelector('#product-form');
const notice = document.querySelector('#notice');
const productList = document.querySelector('#product-list');
const saveButton = document.querySelector('#save-product');
const saveDraftButton = document.querySelector('#save-draft');
const saving = document.querySelector('#saving');
let products = [];
let categories = [];
let editingSlug = '';
let submissionKey = crypto.randomUUID();
let imageAction = 'none';
let previewObjectUrl = '';
const imageFileInput = document.querySelector('#image-file');
const currentImage = document.querySelector('#current-image');
const imagePreview = document.querySelector('#image-preview');

function showNotice(message, kind = 'success') {
  notice.textContent = message;
  notice.dataset.kind = kind;
  notice.hidden = false;
  notice.focus?.();
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Pickora-CSRF': '1', ...(options.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `The request failed (${response.status}).`);
    error.status = response.status;
    error.issues = data.issues ?? [];
    throw error;
  }
  return data;
}

function element(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function renderProducts() {
  productList.replaceChildren();
  if (!products.length) {
    productList.append(element('p', 'muted', 'No products yet. Add one above when the details and link are ready.'));
    return;
  }
  for (const product of products) {
    const row = element('article', 'product-row');
    const info = element('div');
    const title = element('h3', '', product.name);
    const state = element('span', 'status-pill', product.status);
    state.dataset.status = product.status;
    title.append(state);
    info.append(title, element('p', '', `${product.category} · ${product.slug}`), element('p', '', product.description), element('p', '', `Special Link: ${product.affiliateUrl}`));
    const actions = element('div', 'row-actions');
    actions.append(button('Edit', 'edit', product.slug), button(product.status === 'published' ? 'Unpublish' : 'Publish', 'toggle', product.slug), button('Delete', 'delete', product.slug));
    row.append(info, actions);
    productList.append(row);
  }
}

function button(label, action, slug) {
  const item = element('button', '', label);
  item.type = 'button';
  item.dataset.action = action;
  item.dataset.slug = slug;
  return item;
}

function resetForm() {
  form.reset();
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = '';
  imageAction = 'none';
  currentImage.hidden = true;
  currentImage.querySelector('img').removeAttribute('src');
  imagePreview.hidden = true;
  imagePreview.querySelector('img').removeAttribute('src');
  editingSlug = '';
  submissionKey = crypto.randomUUID();
  document.querySelector('#editor-heading').textContent = 'Add a product';
  document.querySelector('#cancel-edit').hidden = true;
  saveButton.textContent = 'Publish product';
}

function setBusy(value, label = '') {
  for (const control of form.querySelectorAll('button, input, select, textarea')) control.disabled = value;
  saving.textContent = value ? label : '';
}

function formData(statusOverride) {
  const values = new FormData(form);
  return {
    name: values.get('name'),
    category: values.get('category'),
    description: values.get('description'),
    keyFeatures: String(values.get('keyFeatures') || '').split('\n').map((item) => item.trim()).filter(Boolean),
    intendedUse: values.get('intendedUse'),
    benefits: String(values.get('benefits') || '').split('\n').map((item) => item.trim()).filter(Boolean),
    limitations: String(values.get('limitations') || '').split('\n').map((item) => item.trim()).filter(Boolean),
    productUrl: values.get('productUrl'),
    affiliateUrl: values.get('affiliateUrl'),
    status: statusOverride || values.get('status'),
  };
}

function showIssues(issues) {
  form.querySelectorAll('[aria-invalid=true]').forEach((field) => field.removeAttribute('aria-invalid'));
  for (const issue of issues) {
    const field = form.elements[issue.field];
    if (field && field.setAttribute) field.setAttribute('aria-invalid', 'true');
  }
  if (issues.length) {
    const field = form.elements[issues[0].field];
    field?.focus();
    showNotice(issues.map((issue) => issue.message).join(' '), 'error');
  }
}

async function submit(statusOverride) {
  const body = formData(statusOverride);
  if (imageAction === 'upload' && !imageFileInput.files?.[0]) {
    showNotice('Choose an image file or clear the image selection.', 'error');
    imageFileInput.focus();
    return;
  }
  showIssues([]);
  setBusy(true, editingSlug ? 'Saving changes…' : 'Saving product…');
  try {
    let result;
    let requestBody = JSON.stringify(body);
    if (imageAction === 'upload' || imageAction === 'remove') {
      const multipart = new FormData();
      multipart.set('product', JSON.stringify(body));
      multipart.set('imageAction', imageAction);
      if (imageAction === 'upload') multipart.set('image', imageFileInput.files[0]);
      requestBody = multipart;
    }
    if (editingSlug) {
      result = await api(`/api/admin/products/${encodeURIComponent(editingSlug)}`, { method: 'PUT', body: requestBody });
    } else {
      result = await api('/api/admin/products', { method: 'POST', headers: { 'Idempotency-Key': submissionKey }, body: requestBody });
    }
    showNotice(result.duplicate ? 'This submission was already saved. No duplicate was created.' : body.status === 'published' ? 'Product published. It will appear on the product page and in its category.' : 'Draft saved. It is visible only in this dashboard.');
    resetForm();
    await refreshProducts();
  } catch (error) {
    if (error.issues?.length) showIssues(error.issues);
    else showNotice(error.message || 'The product was not saved. Please try again.', 'error');
  } finally {
    setBusy(false);
  }
}

async function refreshProducts() {
  productList.replaceChildren(element('p', 'muted', 'Loading products…'));
  try {
    products = await api('/api/admin/products');
    renderProducts();
  } catch (error) {
    productList.replaceChildren(element('p', 'required-note', error.message));
  }
}

function editProduct(slug) {
  const product = products.find((item) => item.slug === slug);
  if (!product) return;
  editingSlug = slug;
  form.elements.name.value = product.name;
  form.elements.category.value = product.category;
  form.elements.description.value = product.description;
  form.elements.keyFeatures.value = product.keyFeatures.join('\n');
  form.elements.intendedUse.value = product.intendedUse;
  form.elements.benefits.value = product.benefits.join('\n');
  form.elements.limitations.value = product.limitations.join('\n');
  form.elements.productUrl.value = product.productUrl;
  form.elements.affiliateUrl.value = product.affiliateUrl;
  form.elements.status.value = product.status;
  imageAction = 'keep';
  currentImage.hidden = !product.imageUrl;
  if (product.imageUrl) currentImage.querySelector('img').src = product.imageUrl;
  imagePreview.hidden = true;
  document.querySelector('#editor-heading').textContent = 'Edit product';
  document.querySelector('#cancel-edit').hidden = false;
  saveButton.textContent = product.status === 'published' ? 'Save changes' : 'Save changes';
  document.querySelector('#editor-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
  form.elements.name.focus();
}

async function changeStatus(product) {
  const action = product.status === 'published' ? 'unpublish' : 'publish';
  if (action === 'unpublish' && !window.confirm(`Unpublish “${product.name}”? It will disappear from public listings.`)) return;
  const nextStatus = action === 'publish' ? 'published' : 'draft';
  const body = {
    ...product,
    productUrl: product.productUrl,
    affiliateUrl: product.affiliateUrl,
    status: nextStatus,
  };
  delete body.imageUrl;
  try {
    await api(`/api/admin/products/${encodeURIComponent(product.slug)}`, { method: 'PUT', body: JSON.stringify(body) });
    showNotice(action === 'publish' ? 'Product published.' : 'Product unpublished and removed from public listings.');
    await refreshProducts();
  } catch (error) { showNotice(error.message, 'error'); }
}

async function removeProduct(product) {
  if (!window.confirm(`Delete “${product.name}” permanently? This cannot be undone.`)) return;
  const typed = window.prompt(`To confirm, type the product name exactly:\n${product.name}`);
  if (typed !== product.name) { showNotice('The product name did not match. Nothing was deleted.', 'warning'); return; }
  try {
    await api(`/api/admin/products/${encodeURIComponent(product.slug)}`, { method: 'DELETE', body: JSON.stringify({ confirmProductName: typed }) });
    showNotice('Product deleted.');
    if (editingSlug === product.slug) resetForm();
    await refreshProducts();
  } catch (error) { showNotice(error.message, 'error'); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); void submit(); });
imageFileInput.addEventListener('change', () => {
  const file = imageFileInput.files?.[0];
  if (!file) {
    imageAction = editingSlug ? 'keep' : 'none';
    imagePreview.hidden = true;
    return;
  }
  imageAction = 'upload';
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = URL.createObjectURL(file);
  imagePreview.querySelector('img').src = previewObjectUrl;
  imagePreview.hidden = false;
});
document.querySelector('#clear-image').addEventListener('click', () => {
  imageFileInput.value = '';
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = '';
  imagePreview.hidden = true;
  imagePreview.querySelector('img').removeAttribute('src');
  imageAction = editingSlug ? 'keep' : 'none';
});
document.querySelector('#remove-image').addEventListener('click', () => {
  imageFileInput.value = '';
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = '';
  imagePreview.hidden = true;
  currentImage.hidden = true;
  imageAction = 'remove';
  showNotice('The image will be removed when you save the product.', 'warning');
});
saveDraftButton.addEventListener('click', () => { form.elements.status.value = 'draft'; void submit('draft'); });
document.querySelector('#cancel-edit').addEventListener('click', resetForm);
document.querySelector('#refresh-list').addEventListener('click', () => void refreshProducts());
for (const button of document.querySelectorAll('#logout, #logout-footer')) {
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await api('/api/admin/auth/logout', { method: 'POST' });
      window.location.assign('/admin/');
    } catch (error) {
      button.disabled = false;
      showNotice(error.message || 'Could not end the secure session.', 'error');
    }
  });
}
productList.addEventListener('click', (event) => {
  const target = event.target.closest('button[data-action]');
  if (!target) return;
  const product = products.find((item) => item.slug === target.dataset.slug);
  if (!product) return;
  if (target.dataset.action === 'edit') editProduct(product.slug);
  if (target.dataset.action === 'toggle') void changeStatus(product);
  if (target.dataset.action === 'delete') void removeProduct(product);
});
async function start() {
  try {
    const [session, categoryData] = await Promise.all([api('/api/admin/session'), api('/api/admin/categories')]);
    document.querySelector('#signed-in').textContent = `Signed in as ${session.login}`;
    categories = categoryData;
    const select = form.elements.category;
    select.replaceChildren(new Option('Choose a category', ''));
    for (const category of categories) select.add(new Option(category.name, category.name));
    if (!editingSlug) select.value = 'Electronics';
    await refreshProducts();
  } catch (error) {
    document.querySelector('#signed-in').textContent = 'Session unavailable';
    showNotice(error.message || 'The secure session could not be confirmed. Sign in with GitHub and refresh this page.', 'error');
    productList.replaceChildren(element('p', 'required-note', 'Dashboard data is unavailable until GitHub sign-in and the D1 database are configured.'));
  }
}
void start();
