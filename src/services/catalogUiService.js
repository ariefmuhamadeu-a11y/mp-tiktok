const json = async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || 'Permintaan katalog gagal.');
    return payload.data === undefined ? payload : payload.data;
};

async function request(path, options) {
    return json(await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
        ...options
    }));
}

export async function getCatalogContext() {
    const workspace = await request('/api/workspace');
    const stores = workspace.stores || [];
    const selectedStore = stores.find((store) => store.id === workspace.selectedStoreId) || stores[0] || null;
    return { userId: selectedStore?.userId || null, stores, selectedStore };
}

export const catalogApi = {
    listProducts: (userId) => request('/api/products?userId=' + encodeURIComponent(userId)),
    createProduct: (payload) => request('/api/products', { method: 'POST', body: JSON.stringify(payload) }),
    updateProduct: (id, payload) => request('/api/products/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) }),
    listVariants: (userId, productId = '') => request('/api/variants?userId=' + encodeURIComponent(userId) + (productId ? '&productId=' + encodeURIComponent(productId) : '')),
    createVariant: (productId, payload) => request('/api/products/' + encodeURIComponent(productId) + '/variants', { method: 'POST', body: JSON.stringify(payload) }),
    updateVariant: (id, payload) => request('/api/variants/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(payload) }),
    listMappings: (storeId, status = 'mapped') => request('/api/marketplace-mappings?storeId=' + encodeURIComponent(storeId) + '&status=' + encodeURIComponent(status)),
    createMapping: (payload) => request('/api/marketplace-mappings', { method: 'POST', body: JSON.stringify(payload) }),
    unmatchedItems: (storeId, status = 'unmatched') => request('/api/marketplace-mappings/unmatched-order-items?storeId=' + encodeURIComponent(storeId) + '&status=' + encodeURIComponent(status) + '&limit=500'),
    previewBackfill: (payload) => request('/api/marketplace-mappings/backfill/preview', { method: 'POST', body: JSON.stringify(payload) }),
    applyBackfill: (payload) => request('/api/marketplace-mappings/backfill/apply', { method: 'POST', body: JSON.stringify(payload) }),
    auditLogs: (storeId) => request('/api/marketplace-mappings/audit?storeId=' + encodeURIComponent(storeId) + '&limit=50')
};
