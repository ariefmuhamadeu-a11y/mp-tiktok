import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const commerceDatabasePath = fileURLToPath(new URL('../../../backend/database/database.sqlite', import.meta.url));

export function readWorkspace(storeId = null, databasePath = commerceDatabasePath) {
    if (!existsSync(databasePath)) {
        throw Object.assign(new Error('Database impor belum tersedia.'), { statusCode: 503 });
    }

    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
        const stores = database.prepare('SELECT id, name FROM stores ORDER BY name, id').all();
        const selectedStore = storeId === null
            ? stores[0] ?? null
            : stores.find((store) => store.id === storeId) ?? null;

        if (storeId !== null && selectedStore === null) {
            throw Object.assign(new Error('Toko tidak ditemukan.'), { statusCode: 404 });
        }

        if (selectedStore === null) {
            return { stores, selectedStoreId: null, summary: emptySummary(), orders: [], imports: [] };
        }

        const id = selectedStore.id;
        const orderSummary = database.prepare(`
            SELECT COUNT(*) AS total_orders,
                COALESCE(SUM(CASE WHEN financial_status = 'credited_to_balance' THEN 1 ELSE 0 END), 0) AS credited_orders,
                COALESCE(SUM(CASE WHEN financial_status = 'not_reported' THEN 1 ELSE 0 END), 0) AS pending_orders,
                COALESCE(SUM(order_amount), 0) AS gross_order_amount,
                COALESCE(SUM(payment_platform_discount), 0) AS payment_platform_discount
            FROM orders WHERE store_id = ?
        `).get(id);
        const promotionSummary = database.prepare(`
            SELECT COALESCE(SUM(i.seller_discount), 0) AS seller_product_discount,
                COALESCE(SUM(i.platform_discount), 0) AS platform_product_discount
            FROM order_items i JOIN orders o ON o.id = i.order_id
            WHERE o.store_id = ?
        `).get(id);
        const shippedPackages = database.prepare(`
            SELECT COUNT(*) AS count FROM order_packages p
            JOIN orders o ON o.id = p.order_id
            WHERE o.store_id = ? AND p.shipped_at IS NOT NULL
        `).get(id).count;
        const deliveredPackages = database.prepare(`
            SELECT COUNT(*) AS count FROM order_packages p
            JOIN orders o ON o.id = p.order_id
            WHERE o.store_id = ? AND p.delivered_at IS NOT NULL
        `).get(id).count;
        const financeSummary = database.prepare(`
            SELECT COUNT(*) AS transaction_count,
                COALESCE(SUM(CASE WHEN transaction_type = 'Pesanan' THEN settlement_amount ELSE 0 END), 0) AS order_settlement,
                COALESCE(SUM(CASE WHEN transaction_type = 'Pesanan' AND order_id IS NULL THEN 1 ELSE 0 END), 0) AS unmatched_orders,
                COALESCE(SUM(CASE WHEN transaction_type != 'Pesanan' THEN settlement_amount ELSE 0 END), 0) AS other_settlement
            FROM financial_transactions WHERE store_id = ?
        `).get(id);
        const transferSummary = database.prepare(`
            SELECT COUNT(*) AS transfer_count,
                COALESCE(SUM(CASE WHEN transfer_type = 'Withdrawal' THEN amount ELSE 0 END), 0) AS withdrawal_amount
            FROM financial_transfers WHERE store_id = ?
        `).get(id);
        const orders = database.prepare(`
            SELECT o.id, o.external_order_id AS orderId, o.source_order_status AS status,
                o.financial_status AS financialStatus, o.order_amount AS amount,
                o.source_created_at AS createdAt,
                p.tracking_id AS tracking, p.shipping_provider_name AS courier,
                p.shipped_at AS shippedAt, p.delivered_at AS deliveredAt,
                i.product_name AS product, i.variation AS variant,
                i.seller_sku AS sellerSku, i.sku_id AS skuId, i.quantity
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            LEFT JOIN order_packages p ON p.id = i.order_package_id
            WHERE o.store_id = ?
            ORDER BY o.source_created_at DESC, o.id DESC, i.id ASC
            LIMIT 100
        `).all(id).map(({ id: _id, ...order }) => order);
        const imports = database.prepare(`
            SELECT kind, filename, status, row_count AS rowCount,
                imported_count AS importedCount, duplicate_count AS duplicateCount,
                unmatched_count AS unmatchedCount, error_count AS errorCount,
                imported_at AS importedAt
            FROM import_batches WHERE store_id = ?
            ORDER BY imported_at DESC, id DESC LIMIT 10
        `).all(id);

        return {
            stores,
            selectedStoreId: id,
            summary: {
                ...orderSummary,
                ...promotionSummary,
                shipped_packages: shippedPackages,
                delivered_packages: deliveredPackages,
                ...financeSummary,
                ...transferSummary
            },
            orders,
            imports
        };
    } finally {
        database.close();
    }
}

function emptySummary() {
    return {
        total_orders: 0, credited_orders: 0, pending_orders: 0,
        gross_order_amount: 0, payment_platform_discount: 0,
        seller_product_discount: 0, platform_product_discount: 0,
        shipped_packages: 0, delivered_packages: 0,
        transaction_count: 0, order_settlement: 0, unmatched_orders: 0,
        other_settlement: 0, transfer_count: 0, withdrawal_amount: 0
    };
}
