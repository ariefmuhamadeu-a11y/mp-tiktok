import { catalogApi, getCatalogContext } from '../services/catalogUiService.js';

const el = (id) => document.getElementById(id);
const text = (value) => String(value ?? '').trim();
const escape = (value) => text(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const count = (value) => Number(value || 0).toLocaleString('id-ID');

const state = {
    context: null,
    products: [],
    variants: [],
    productEditingId: null,
    variantEditingId: null,
    mappingGroups: [],
    backfillPreview: null,
    auditLogs: []
};

function setStatus(id, message = '', type = '') {
    const target = el(id);
    if (!target) return;
    target.hidden = !message;
    target.className = 'catalog-status' + (type ? ' ' + type : '');
    target.textContent = message;
}

function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (busy) {
        button.dataset.originalLabel = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-arrow-repeat"></i> ' + busyLabel;
    } else {
        button.disabled = false;
        button.innerHTML = button.dataset.originalLabel || button.innerHTML;
    }
}

async function context() {
    if (!state.context?.userId) state.context = await getCatalogContext();
    if (!state.context.userId) throw new Error('User workspace belum tersedia.');
    return state.context;
}

function productOptions(selected = '', includeEmpty = false) {
    return (includeEmpty ? '<option value="">Pilih produk</option>' : '') + state.products.map((product) =>
        '<option value="' + product.id + '"' + (String(product.id) === String(selected) ? ' selected' : '') + '>' +
        escape(product.code + ' · ' + product.name) + '</option>'
    ).join('');
}

function variantOptions(productId, selected = '', includeEmpty = true) {
    const variants = state.variants.filter((variant) => !productId || String(variant.productId) === String(productId));
    return (includeEmpty ? '<option value="">Pilih variant</option>' : '') + variants.map((variant) =>
        '<option value="' + variant.id + '"' + (String(variant.id) === String(selected) ? ' selected' : '') + '>' +
        escape(variant.sku + ' · ' + variant.name) + '</option>'
    ).join('');
}

function resetProductForm() {
    state.productEditingId = null;
    el('productForm')?.reset();
    el('productFormTitle').textContent = 'Tambah produk';
    el('productSubmitBtn').innerHTML = '<i class="bi bi-plus-lg"></i> Simpan produk';
    el('productCancelBtn').hidden = true;
}

function renderProducts() {
    const body = el('productTableBody');
    const empty = el('productEmptyState');
    el('productCount').textContent = count(state.products.length) + ' produk';
    body.innerHTML = state.products.map((product) =>
        '<tr><td><strong>' + escape(product.code) + '</strong><span class="catalog-muted">' + escape(product.name) + '</span></td>' +
        '<td>' + escape(product.brand || '—') + '</td><td>' + escape(product.category || '—') + '</td>' +
        '<td><span class="workspace-badge ' + (product.isActive ? 'success' : '') + '">' + (product.isActive ? 'Aktif' : 'Nonaktif') + '</span></td>' +
        '<td>' + count(product.variantCount) + '</td><td class="catalog-actions"><button type="button" class="catalog-link" data-product-edit="' + product.id + '"><i class="bi bi-pencil"></i> Edit</button>' +
        '<button type="button" class="catalog-link" data-product-variants="' + product.id + '"><i class="bi bi-diagram-3"></i> Variant</button></td></tr>'
    ).join('');
    empty.hidden = state.products.length > 0;
}

async function loadProducts() {
    const current = await context();
    state.products = await catalogApi.listProducts(current.userId);
    renderProducts();
    renderVariantProductOptions();
    renderMappingProductOptions();
}

function editProduct(productId) {
    const product = state.products.find((item) => item.id === Number(productId));
    if (!product) return;
    state.productEditingId = product.id;
    el('productCode').value = product.code;
    el('productName').value = product.name;
    el('productBrand').value = product.brand || '';
    el('productCategory').value = product.category || '';
    el('productActive').checked = product.isActive;
    el('productFormTitle').textContent = 'Edit produk';
    el('productSubmitBtn').innerHTML = '<i class="bi bi-check-lg"></i> Simpan perubahan';
    el('productCancelBtn').hidden = false;
    el('productCode').focus();
}

async function submitProduct(event) {
    event.preventDefault();
    const button = el('productSubmitBtn');
    setBusy(button, true, 'Menyimpan…');
    setStatus('productStatus');
    try {
        const current = await context();
        const payload = {
            userId: current.userId,
            code: el('productCode').value,
            name: el('productName').value,
            brand: el('productBrand').value,
            category: el('productCategory').value,
            isActive: el('productActive').checked
        };
        if (state.productEditingId) await catalogApi.updateProduct(state.productEditingId, payload);
        else await catalogApi.createProduct(payload);
        await loadProducts();
        resetProductForm();
        setStatus('productStatus', 'Produk berhasil disimpan.', 'success');
    } catch (error) { setStatus('productStatus', error.message, 'error'); }
    finally { setBusy(button, false); }
}

function renderVariantProductOptions() {
    const selected = el('variantProduct')?.value || '';
    const filter = el('variantProductFilter')?.value || '';
    if (el('variantProduct')) el('variantProduct').innerHTML = productOptions(selected, true);
    if (el('variantProductFilter')) el('variantProductFilter').innerHTML = productOptions(filter, true).replace('Pilih produk', 'Semua produk');
}

function resetVariantForm() {
    state.variantEditingId = null;
    el('variantForm')?.reset();
    el('variantFormTitle').textContent = 'Tambah variant';
    el('variantSubmitBtn').innerHTML = '<i class="bi bi-plus-lg"></i> Simpan variant';
    el('variantCancelBtn').hidden = true;
    renderVariantProductOptions();
}

function renderVariants() {
    const filter = el('variantProductFilter')?.value || '';
    const rows = state.variants.filter((variant) => !filter || String(variant.productId) === String(filter));
    el('variantCount').textContent = count(rows.length) + ' variant';
    el('variantTableBody').innerHTML = rows.map((variant) =>
        '<tr><td><strong>' + escape(variant.product?.code || '—') + '</strong><span class="catalog-muted">' + escape(variant.product?.name || '—') + '</span></td>' +
        '<td><strong>' + escape(variant.sku) + '</strong><span class="catalog-muted">' + escape(variant.name) + '</span></td>' +
        '<td>' + escape(variant.barcode || '—') + '</td><td><code>' + escape(JSON.stringify(variant.attributes || {})) + '</code></td>' +
        '<td><span class="workspace-badge ' + (variant.isActive ? 'success' : '') + '">' + (variant.isActive ? 'Aktif' : 'Nonaktif') + '</span></td>' +
        '<td><button type="button" class="catalog-link" data-variant-edit="' + variant.id + '"><i class="bi bi-pencil"></i> Edit</button></td></tr>'
    ).join('');
    el('variantEmptyState').hidden = rows.length > 0;
}

async function loadVariants() {
    const current = await context();
    state.products = await catalogApi.listProducts(current.userId);
    state.variants = await catalogApi.listVariants(current.userId);
    renderVariantProductOptions();
    renderVariants();
}

function editVariant(variantId) {
    const variant = state.variants.find((item) => item.id === Number(variantId));
    if (!variant) return;
    state.variantEditingId = variant.id;
    el('variantProduct').value = variant.productId;
    el('variantSku').value = variant.sku;
    el('variantName').value = variant.name;
    el('variantBarcode').value = variant.barcode || '';
    el('variantAttributes').value = JSON.stringify(variant.attributes || {}, null, 2);
    el('variantActive').checked = variant.isActive;
    el('variantFormTitle').textContent = 'Edit variant';
    el('variantSubmitBtn').innerHTML = '<i class="bi bi-check-lg"></i> Simpan perubahan';
    el('variantCancelBtn').hidden = false;
    el('variantSku').focus();
}

async function submitVariant(event) {
    event.preventDefault();
    const productId = el('variantProduct').value;
    if (!productId) { setStatus('variantStatus', 'Pilih produk induk.', 'error'); return; }
    const button = el('variantSubmitBtn');
    setBusy(button, true, 'Menyimpan…');
    setStatus('variantStatus');
    try {
        const current = await context();
        const payload = { userId: current.userId, sku: el('variantSku').value, name: el('variantName').value, barcode: el('variantBarcode').value, attributes: el('variantAttributes').value, isActive: el('variantActive').checked };
        if (state.variantEditingId) await catalogApi.updateVariant(state.variantEditingId, payload);
        else await catalogApi.createVariant(productId, payload);
        await loadVariants();
        resetVariantForm();
        setStatus('variantStatus', 'Variant berhasil disimpan.', 'success');
    } catch (error) { setStatus('variantStatus', error.message, 'error'); }
    finally { setBusy(button, false); }
}

function renderMappingProductOptions() {
    const options = productOptions('', true);
    document.querySelectorAll('[data-mapping-product]').forEach((select) => {
        const selected = select.value;
        select.innerHTML = options;
        select.value = selected;
    });
}

function groupedMappingItems(items) {
    const groups = new Map();
    items.forEach((item) => {
        const key = [item.skuId, item.sellerSku, item.productName, item.variation].map(text).join('|');
        const existing = groups.get(key) || { ...item, count: 0, orderCount: 0, orderIds: new Set() };
        existing.count += 1;
        existing.orderIds.add(item.externalOrderId);
        existing.orderCount = existing.orderIds.size;
        groups.set(key, existing);
    });
    return Array.from(groups.values()).map(({ orderIds, ...group }) => group);
}

function renderMappingRows(items, status) {
    state.mappingGroups = groupedMappingItems(items);
    el('mappingItemCount').textContent = count(items.length) + ' baris · ' + count(state.mappingGroups.length) + ' SKU unik';
    el('mappingTableBody').innerHTML = state.mappingGroups.map((item, index) => {
        const currentMapping = item.mapping && !Array.isArray(item.mapping) ? item.mapping : null;
        const action = status === 'mapped' || status === 'ignored'
            ? '<span class="workspace-badge ' + (item.status === 'mapped' ? 'success' : 'warning') + '">' + escape(item.status) + '</span>'
            : '<div class="mapping-action"><select class="catalog-select mapping-product" data-mapping-index="' + index + '">' + productOptions(currentMapping?.productId || '', true) + '</select><select class="catalog-select mapping-variant" data-mapping-index="' + index + '"><option value="">Pilih variant</option></select><button type="button" class="catalog-btn small primary" data-mapping-save="' + index + '"><i class="bi bi-link-45deg"></i> Mapping</button></div>';
        return '<tr><td><strong>' + escape(item.sellerSku || item.skuId || 'Tanpa SKU') + '</strong><span class="catalog-muted">' + escape(item.skuId || 'SKU ID kosong') + '</span></td>' +
            '<td class="catalog-product-cell"><strong>' + escape(item.productName || '—') + '</strong><span class="catalog-muted">' + escape(item.variation || 'Variant marketplace kosong') + '</span></td>' +
            '<td>' + count(item.count) + ' item<span class="catalog-muted">' + count(item.orderCount) + ' order</span></td><td>' + action + '</td></tr>';
    }).join('');
    el('mappingEmptyState').hidden = state.mappingGroups.length > 0;
    renderMappingProductOptions();
    state.mappingGroups.forEach((item, index) => {
        const row = document.querySelector('[data-mapping-index="' + index + '"]')?.closest('tr');
        const productSelect = row?.querySelector('.mapping-product');
        const variantSelect = row?.querySelector('.mapping-variant');
        if (productSelect && variantSelect) variantSelect.innerHTML = variantOptions(productSelect.value, '', true);
    });
}

async function loadMappings() {
    const current = await context();
    const storeId = el('mappingStore').value || current.selectedStore?.id || current.stores[0]?.id;
    if (!storeId) throw new Error('Toko belum tersedia.');
    el('mappingStore').value = String(storeId);
    const status = el('mappingStatusFilter').value;
    const result = await catalogApi.unmatchedItems(storeId, status);
    renderMappingRows(result.items || [], status);
    el('mappingStoreHint').textContent = result.store.name + ' · ' + result.platform;
    await loadAuditLogs(storeId);
}

function renderBackfillPreview(preview) {
    state.backfillPreview = preview;
    const counts = preview?.counts || {};
    const summary = el('mappingBackfillSummary');
    if (summary) {
        summary.innerHTML = '<span><strong>' + count(preview?.totalItems) + '</strong> totaal item</span>' +
            '<span><strong>' + count(counts.eligible) + '</strong> siap backfill</span>' +
            '<span><strong>' + count(counts.unmatched) + '</strong> unmatched</span>' +
            '<span><strong>' + count(counts.conflict) + '</strong> konflik</span>' +
            '<span><strong>' + count(counts.alreadyBackfilled) + '</strong> sudah ada</span>';
    }
    const applyButton = el('mappingBackfillApplyBtn');
    if (applyButton) applyButton.disabled = !(counts.eligible > 0);
    setStatus('mappingBackfillStatus', counts.eligible > 0
        ? 'Preview siap. Hanya item yang match tepat dan belum termaterialisasi yang akan diproses.'
        : 'Tidak ada item yang eligible untuk backfill. Unmatched dan konflik tetap aman.', counts.eligible > 0 ? 'success' : '');
}

function renderAuditLogs(logs) {
    state.auditLogs = logs || [];
    const body = el('mappingAuditBody');
    if (!body) return;
    body.innerHTML = state.auditLogs.map((log) => '<tr><td>' + escape(log.createdAt || '—') + '</td>' +
        '<td><strong>' + escape(log.action) + '</strong><span class="catalog-muted">' + escape(log.entityType) + (log.entityId ? ' #' + log.entityId : '') + '</span></td>' +
        '<td>' + escape(log.actorName || 'Sistem') + '</td><td>' + escape(log.reason || '—') + '</td>' +
        '<td><code>' + escape(JSON.stringify(log.after || {})) + '</code></td></tr>').join('');
    el('mappingAuditEmpty').hidden = state.auditLogs.length > 0;
}

async function loadAuditLogs(storeId) {
    renderAuditLogs(await catalogApi.auditLogs(storeId));
}

function backfillPayload(current) {
    const storeId = Number(el('mappingStore').value);
    const store = current.stores.find((item) => item.id === storeId) || current.selectedStore;
    return { storeId, platform: store?.platform || 'tiktok', actorUserId: store?.userId || current.userId };
}

async function previewMappingBackfill() {
    const button = el('mappingBackfillPreviewBtn');
    setBusy(button, true, 'Menyiapkan…');
    try {
        const current = await context();
        renderBackfillPreview(await catalogApi.previewBackfill(backfillPayload(current)));
    } catch (error) { setStatus('mappingBackfillStatus', error.message, 'error'); }
    finally { setBusy(button, false); }
}

async function applyMappingBackfill() {
    if (!state.backfillPreview?.counts?.eligible) return;
    const button = el('mappingBackfillApplyBtn');
    setBusy(button, true, 'Menerapkan…');
    try {
        const current = await context();
        const result = await catalogApi.applyBackfill({ ...backfillPayload(current), reason: 'Backfill mapping dari halaman Mapping Pesanan' });
        state.backfillPreview = null;
        renderBackfillPreview({ totalItems: 0, counts: { eligible: 0, unmatched: 0, conflict: 0, alreadyBackfilled: result.mappedCount || 0 } });
        setStatus('mappingBackfillStatus', result.mappedCount + ' item berhasil dimaterialisasi ke mapping order item.', 'success');
        await loadMappings();
    } catch (error) { setStatus('mappingBackfillStatus', error.message, 'error'); }
    finally { setBusy(button, false); }
}

async function loadMappingContext() {
    const current = await context();
    el('mappingStore').innerHTML = current.stores.map((store) => '<option value="' + store.id + '">' + escape(store.name) + '</option>').join('');
    el('mappingStore').value = String(current.selectedStore?.id || current.stores[0]?.id || '');
    state.products = await catalogApi.listProducts(current.userId);
    state.variants = await catalogApi.listVariants(current.userId);
    await loadMappings();
}

async function saveMapping(index) {
    const item = state.mappingGroups[index];
    const row = document.querySelector('[data-mapping-save="' + index + '"]')?.closest('tr');
    const productId = row?.querySelector('.mapping-product')?.value;
    const variantId = row?.querySelector('.mapping-variant')?.value;
    if (!productId || !variantId) { setStatus('mappingStatus', 'Pilih produk dan variant sebelum mapping.', 'error'); return; }
    const button = row.querySelector('[data-mapping-save]');
    setBusy(button, true, '…');
    try {
        const current = await context();
        const storeId = Number(el('mappingStore').value);
        await catalogApi.createMapping({ storeId, productId: Number(productId), productVariantId: Number(variantId), platform: current.stores.find((store) => store.id === storeId)?.platform || 'tiktok', skuId: item.skuId, sellerSku: item.sellerSku, marketplaceProductName: item.productName, marketplaceVariantName: item.variation });
        setStatus('mappingStatus', 'Mapping ' + (item.sellerSku || item.skuId) + ' berhasil disimpan.', 'success');
        await loadMappings();
    } catch (error) { setStatus('mappingStatus', error.message, 'error'); setBusy(button, false); }
}

function bindMappingEvents() {
    el('mappingTableBody').addEventListener('change', (event) => {
        if (!event.target.classList.contains('mapping-product')) return;
        const row = event.target.closest('tr');
        const variant = row?.querySelector('.mapping-variant');
        if (variant) variant.innerHTML = variantOptions(event.target.value, '', true);
    });
    el('mappingTableBody').addEventListener('click', (event) => {
        const button = event.target.closest('[data-mapping-save]');
        if (button) saveMapping(Number(button.dataset.mappingSave));
    });
    el('mappingRefreshBtn').addEventListener('click', () => loadMappings().catch((error) => setStatus('mappingStatus', error.message, 'error')));
    el('mappingStore').addEventListener('change', () => loadMappings().catch((error) => setStatus('mappingStatus', error.message, 'error')));
    el('mappingStatusFilter').addEventListener('change', () => loadMappings().catch((error) => setStatus('mappingStatus', error.message, 'error')));
    el('mappingBackfillPreviewBtn').addEventListener('click', () => previewMappingBackfill());
    el('mappingBackfillApplyBtn').addEventListener('click', () => applyMappingBackfill());
}

export function setupCatalog() {
    el('productForm').addEventListener('submit', submitProduct);
    el('productCancelBtn').addEventListener('click', resetProductForm);
    el('productTableBody').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-product-edit]');
        if (edit) editProduct(edit.dataset.productEdit);
        const variants = event.target.closest('[data-product-variants]');
        if (variants) {
            el('variantProductFilter').value = variants.dataset.productVariants;
            document.querySelector('[data-page-target="variants"]')?.click();
        }
    });
    el('variantForm').addEventListener('submit', submitVariant);
    el('variantCancelBtn').addEventListener('click', resetVariantForm);
    el('variantProductFilter').addEventListener('change', renderVariants);
    el('variantTableBody').addEventListener('click', (event) => {
        const edit = event.target.closest('[data-variant-edit]');
        if (edit) editVariant(edit.dataset.variantEdit);
    });
    bindMappingEvents();
}

export async function renderCatalogPage(page) {
    try {
        if (page === 'products') {
            await loadProducts();
            setStatus('productStatus');
        } else if (page === 'variants') {
            await loadVariants();
            setStatus('variantStatus');
        } else if (page === 'orderMapping') {
            await loadMappingContext();
            setStatus('mappingStatus');
        }
    } catch (error) {
        const target = page === 'products' ? 'productStatus' : page === 'variants' ? 'variantStatus' : 'mappingStatus';
        setStatus(target, error.message, 'error');
    }
}
