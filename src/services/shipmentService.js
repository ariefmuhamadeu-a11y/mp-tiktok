import * as XLSX from 'xlsx';

export const shipmentStorageKey = 'mp-tiktok-shipment-records-v2';

const aliases = {
    orderId: ['order_id', 'orderid', 'id_pesanan', 'no_pesanan', 'nomor_pesanan', 'nomor_order', 'no_order', 'order', 'pesanan', 'id_order'],
    createdAt: ['created_time', 'created_at', 'waktu_dibuat', 'tanggal_order', 'order_date', 'order_created_at'],
    item: ['quantity', 'qty', 'jumlah', 'item'],
    productTitle: ['product_name', 'product_title', 'nama_produk', 'judul_produk', 'produk'],
    variant: ['variation', 'variant', 'varian'],
    sku: ['seller_sku', 'sku', 'kode_sku'],
    skuId: ['sku_id', 'id_sku'],
    packageId: ['package_id', 'id_paket'],
    tracking: ['no_resi', 'nomor_resi', 'resi', 'tracking_id', 'tracking_number', 'tracking', 'awb', 'nomor_tracking'],
    recipient: ['nama_penerima', 'penerima', 'customer', 'nama_pelanggan', 'recipient', 'buyer', 'nama_customer'],
    courier: ['kurir', 'courier', 'ekspedisi', 'shipping_provider_name', 'shipping_provider', 'shipping_courier', 'logistik'],
    shippedAt: ['shipped_time', 'shipped_at', 'waktu_dikirim', 'tanggal_dikirim', 'ship_date'],
    deliveredAt: ['delivered_time', 'delivered_at', 'waktu_diterima', 'tanggal_diterima', 'delivery_date'],
    status: ['status_pengiriman', 'shipping_status', 'status', 'order_status'],
    total: ['total_pesanan', 'total_order', 'total', 'harga_total', 'amount', 'order_amount', 'nilai_pesanan'],
    unitOriginalPrice: ['sku_unit_original_price', 'unit_original_price', 'sku_original_price', 'harga_satuan_asli'],
    subtotalBeforeDiscount: ['sku_subtotal_before_discount', 'subtotal_before_discount', 'sku_subtotal_sebelum_diskon', 'subtotal_sebelum_diskon'],
    platformDiscount: ['sku_platform_discount', 'platform_discount', 'sku_diskon_platform', 'diskon_platform'],
    sellerDiscount: ['sku_seller_discount', 'seller_discount', 'sku_diskon_penjual', 'diskon_penjual'],
    subtotalAfterDiscount: ['sku_subtotal_after_discount', 'subtotal_after_discount', 'sku_subtotal_setelah_diskon', 'subtotal_setelah_diskon'],
    shippingFeeAfterDiscount: ['shipping_fee_after_discount', 'ongkir_setelah_diskon'],
    originalShippingFee: ['original_shipping_fee', 'ongkir_asli'],
    shippingFeeSellerDiscount: ['shipping_fee_seller_discount', 'diskon_penjual_ongkir'],
    shippingFeePlatformDiscount: ['shipping_fee_platform_discount', 'diskon_platform_ongkir'],
    distanceShippingFee: ['distance_shipping_fee', 'ongkir_jarak'],
    distanceFee: ['distance_fee', 'biaya_jarak'],
    orderRefundAmount: ['order_refund_amount', 'order_refund', 'refund_amount', 'jumlah_pengembalian_pesanan'],
    paymentPlatformDiscount: ['payment_platform_discount', 'payment_discount', 'diskon_platform_pembayaran'],
    buyerServiceFee: ['buyer_service_fee', 'buyer_fee', 'biaya_layanan_pembeli'],
    handlingFee: ['handling_fee', 'biaya_penanganan'],
    shippingInsurance: ['shipping_insurance', 'asuransi_pengiriman'],
    itemInsurance: ['item_insurance', 'asuransi_produk']
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

function shipmentDateTime(value, date1904) {
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) return shipmentText(value);
        const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
        const serial = !date1904 && value < 60 ? value + 1 : value;
        const date = new Date(epoch + Math.round(serial * 86400) * 1000);
        return Number.isNaN(date.getTime()) ? shipmentText(value) : date.toISOString().slice(0, 19).replace('T', ' ');
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 19).replace('T', ' ');
    }
    return shipmentText(value);
}

export async function parseShipmentFile(file) {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) throw new Error('Sheet pertama tidak ditemukan.');
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: '', raw: true });
    const date1904 = Boolean(workbook.Workbook?.WBProps?.date1904);
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
        const readDateTime = (field) => mapping[field] === undefined ? '' : shipmentDateTime(row[mapping[field]], date1904);
        const record = {
            orderId: read('orderId'), createdAt: readDateTime('createdAt'), item: read('item'), productTitle: read('productTitle'),
            variant: read('variant'), sku: read('sku'), skuId: read('skuId'), packageId: read('packageId'),
            tracking: read('tracking'), recipient: read('recipient'),
            courier: read('courier'), shippedAt: readDateTime('shippedAt'), deliveredAt: readDateTime('deliveredAt'),
            status: read('status'), total: read('total'),
            unitOriginalPrice: read('unitOriginalPrice'),
            subtotalBeforeDiscount: read('subtotalBeforeDiscount'),
            platformDiscount: read('platformDiscount'),
            sellerDiscount: read('sellerDiscount'),
            subtotalAfterDiscount: read('subtotalAfterDiscount'),
            shippingFeeAfterDiscount: read('shippingFeeAfterDiscount'),
            originalShippingFee: read('originalShippingFee'),
            shippingFeeSellerDiscount: read('shippingFeeSellerDiscount'),
            shippingFeePlatformDiscount: read('shippingFeePlatformDiscount'),
            distanceShippingFee: read('distanceShippingFee'),
            distanceFee: read('distanceFee'),
            orderRefundAmount: read('orderRefundAmount'),
            paymentPlatformDiscount: read('paymentPlatformDiscount'),
            buyerServiceFee: read('buyerServiceFee'),
            handlingFee: read('handlingFee'),
            shippingInsurance: read('shippingInsurance'),
            itemInsurance: read('itemInsurance'),
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
