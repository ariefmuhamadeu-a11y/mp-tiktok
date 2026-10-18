import * as XLSX from 'xlsx';

export const shipmentStorageKey = 'mp-tiktok-shipment-records-v1';

const aliases = {
    orderId: ['order_id', 'orderid', 'id_pesanan', 'no_pesanan', 'nomor_pesanan', 'nomor_order', 'no_order', 'order', 'pesanan', 'id_order'],
    item: ['quantity', 'qty', 'jumlah', 'item'],
    productTitle: ['product_name', 'product_title', 'nama_produk', 'judul_produk', 'produk'],
    variant: ['variation', 'variant', 'varian'],
    sku: ['seller_sku', 'sku', 'kode_sku'],
    skuId: ['sku_id', 'id_sku'],
    packageId: ['package_id', 'id_paket'],
    tracking: ['no_resi', 'nomor_resi', 'resi', 'tracking_id', 'tracking_number', 'tracking', 'awb', 'nomor_tracking'],
    recipient: ['nama_penerima', 'penerima', 'customer', 'nama_pelanggan', 'recipient', 'buyer', 'nama_customer'],
    courier: ['kurir', 'courier', 'ekspedisi', 'shipping_provider_name', 'shipping_provider', 'shipping_courier', 'logistik'],
    status: ['status_pengiriman', 'shipping_status', 'status', 'order_status'],
    total: ['total_pesanan', 'total_order', 'total', 'harga_total', 'amount', 'order_amount', 'nilai_pesanan']
};

export const shipmentText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const shipmentNormalize = (value) => shipmentText(value)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
export const escapeShipmentHtml = (value) => shipmentText(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[character]));

export function readShipmentRecords() {
    try {
        const stored = JSON.parse(localStorage.getItem(shipmentStorageKey) || '[]');
        return Array.isArray(stored) ? stored : [];
    } catch (_) {
        return [];
    }
}

export function saveShipmentRecords(records) {
    localStorage.setItem(shipmentStorageKey, JSON.stringify(records));
}

export function formatShipmentSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function formatShipmentAmount(value) {
    const raw = shipmentText(value);
    if (!raw) return '—';
    const digits = raw.replace(/[^0-9]/g, '');
    return digits ? 'Rp' + Number(digits).toLocaleString('id-ID') : escapeShipmentHtml(raw);
}

export function shipmentKey(row) {
    const orderId = shipmentNormalize(row.orderId);
    const tracking = shipmentNormalize(row.tracking);
    const itemIdentity = [row.packageId, row.skuId || row.sku, row.variant, row.productTitle]
        .map(shipmentNormalize).join('|');
    if (orderId) return 'order:' + orderId + '|item:' + itemIdentity;
    if (tracking) return 'resi:' + tracking;
    return 'data:' + [row.productTitle, row.variant, row.sku, row.recipient, row.courier, row.status, row.total]
        .map(shipmentNormalize).join('|');
}

function findHeader(rows) {
    const knownHeaders = Object.values(aliases).flat();
    let bestIndex = 0;
    let bestScore = 0;
    rows.slice(0, 15).forEach((row, index) => {
        const score = row.map(shipmentNormalize).filter((header) => knownHeaders.includes(header)).length;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });
    return { index: bestIndex, score: bestScore };
}

export async function parseShipmentFile(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: false });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('Sheet pertama tidak ditemukan.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '', raw: false });
    const header = findHeader(rows);
    const headers = (rows[header.index] || []).map(shipmentNormalize);
    const mapping = Object.fromEntries(Object.entries(aliases).flatMap(([field, names]) => {
        const index = headers.findIndex((value) => names.includes(value));
        return index >= 0 ? [[field, index]] : [];
    }));
    if (mapping.orderId === undefined || (mapping.skuId === undefined && mapping.sku === undefined && mapping.productTitle === undefined)) {
        throw new Error('kolom Order ID dan identitas produk/SKU tidak ditemukan');
    }

    return rows.slice(header.index + 1).flatMap((row, rowIndex) => {
        if (!Array.isArray(row) || row.every((value) => shipmentText(value) === '')) return [];
        const read = (field) => mapping[field] === undefined ? '' : shipmentText(row[mapping[field]]);
        const record = {
            orderId: read('orderId'), item: read('item'), productTitle: read('productTitle'),
            variant: read('variant'), sku: read('sku'), skuId: read('skuId'), packageId: read('packageId'),
            tracking: read('tracking'), recipient: read('recipient'),
            courier: read('courier'), status: read('status'), total: read('total'),
            fileName: file.name, sourceRow: rowIndex + header.index + 2
        };
        return record.orderId || record.tracking || record.recipient || record.total ? [record] : [];
    });
}

export function getUniqueShipmentRows(rows, store, storedRows) {
    const knownKeys = new Set(storedRows.filter((row) => row.store === store).map((row) => store + '|' + shipmentKey(row)));
    const seenKeys = new Set(knownKeys);
    let duplicateCount = 0;
    const uniqueRows = rows.filter((row) => {
        row.key = shipmentKey(row);
        const scopedKey = store + '|' + row.key;
        if (seenKeys.has(scopedKey)) {
            duplicateCount += 1;
            return false;
        }
        seenKeys.add(scopedKey);
        return true;
    });
    return { uniqueRows, duplicateCount };
}
