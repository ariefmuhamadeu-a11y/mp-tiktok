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
        const transactionColumns = tableColumns(database, 'financial_transactions');
        const transferColumns = tableColumns(database, 'financial_transfers');
        const orderColumns = tableColumns(database, 'orders');
        const itemColumns = tableColumns(database, 'order_items');
        const orderDiscountColumns = tableColumns(database, 'order_discounts');
        const storeColumns = tableColumns(database, 'stores');
        const transactionField = (column, fallback = '0') => transactionColumns.has(column) ? column : fallback;
        const transactionAliasField = (column, alias, fallback = 'NULL') =>
            (transactionColumns.has(column) ? `t.${column}` : fallback) + ` AS ${alias}`;
        const itemAliasField = (column, alias, fallback = 'NULL') =>
            (itemColumns.has(column) ? `i.${column}` : fallback) + ` AS ${alias}`;
        const stores = database.prepare(`
            SELECT id, ${storeColumns.has('user_id') ? 'user_id' : 'NULL'} AS userId,
                name, ${storeColumns.has('platform') ? 'platform' : "'tiktok'"} AS platform
            FROM stores ORDER BY name, id
        `).all();
        const selectedStore = storeId === null
            ? stores[0] ?? null
            : stores.find((store) => store.id === storeId) ?? null;

        if (storeId !== null && selectedStore === null) {
            throw Object.assign(new Error('Toko tidak ditemukan.'), { statusCode: 404 });
        }

        if (selectedStore === null) {
            return { stores, selectedStoreId: null, summary: emptySummary(), orderDailySummary: [], orders: [], detectedDiscounts: [], transactions: [], transfers: [], imports: [] };
        }

        const id = selectedStore.id;
        const orderGrossAmountSql = itemColumns.has('subtotal_before_discount')
            ? 'COALESCE((SELECT SUM(i.subtotal_before_discount) FROM order_items i WHERE i.order_id = orders.id), orders.order_amount)'
            : 'orders.order_amount';
        const orderNetAmountSql = itemColumns.has('subtotal_after_discount')
            ? 'COALESCE((SELECT SUM(i.subtotal_after_discount) FROM order_items i WHERE i.order_id = orders.id), ' + orderGrossAmountSql + ')'
            : orderGrossAmountSql;
        const sellerDiscountSql = itemColumns.has('seller_discount')
            ? 'COALESCE((SELECT SUM(i.seller_discount) FROM order_items i WHERE i.order_id = orders.id), 0)'
            : '0';
        const platformDiscountSql = itemColumns.has('platform_discount')
            ? 'COALESCE((SELECT SUM(i.platform_discount) FROM order_items i WHERE i.order_id = orders.id), 0)'
            : '0';
        const paymentDiscountSql = orderColumns.has('payment_platform_discount')
            ? 'COALESCE(orders.payment_platform_discount, 0)'
            : '0';
        const orderSummary = database.prepare(`
            SELECT COUNT(*) AS total_orders,
                COALESCE(SUM(CASE WHEN financial_status = 'credited_to_balance' THEN 1 ELSE 0 END), 0) AS credited_orders,
                COALESCE(SUM(CASE WHEN financial_status = 'not_reported' THEN 1 ELSE 0 END), 0) AS pending_orders,
                COALESCE(COUNT(DISTINCT CASE WHEN EXISTS (
                    SELECT 1 FROM financial_transactions t
                    WHERE t.order_id = orders.id AND t.transaction_type = 'Pesanan'
                ) THEN orders.id END), 0) AS linked_order_count,
                COALESCE(SUM(order_amount), 0) AS gross_order_amount,
                COALESCE(SUM(payment_platform_discount), 0) AS payment_platform_discount
            FROM orders WHERE store_id = ?
        `).get(id);
        const orderDailySummary = database.prepare(`
            SELECT COALESCE(substr(source_created_at, 1, 10), 'tanpa-tanggal') AS date,
                COUNT(*) AS order_count,
                COALESCE(SUM(CASE WHEN financial_status = 'credited_to_balance' THEN 1 ELSE 0 END), 0) AS settled_order_count,
                COALESCE(SUM(CASE WHEN financial_status = 'not_reported' THEN 1 ELSE 0 END), 0) AS pending_order_count,
                COALESCE(SUM(order_amount), 0) AS order_amount,
                COALESCE(SUM(${orderGrossAmountSql}), 0) AS gross_amount,
                COALESCE(SUM(${orderNetAmountSql}), 0) AS net_amount,
                COALESCE(SUM(${sellerDiscountSql}), 0) AS seller_discount,
                COALESCE(SUM(${platformDiscountSql}), 0) AS platform_discount,
                COALESCE(SUM(${paymentDiscountSql}), 0) AS payment_platform_discount,
                COALESCE(SUM(CASE WHEN financial_status = 'credited_to_balance' THEN ${orderNetAmountSql} ELSE 0 END), 0) AS settled_amount,
                COALESCE(SUM(CASE WHEN financial_status = 'not_reported' THEN ${orderNetAmountSql} ELSE 0 END), 0) AS pending_amount,
                COALESCE(SUM((SELECT SUM(quantity) FROM order_items i WHERE i.order_id = orders.id)), 0) AS item_count,
                COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM order_packages p WHERE p.order_id = orders.id AND p.shipped_at IS NOT NULL) THEN 1 ELSE 0 END), 0) AS shipped_order_count,
                COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM order_packages p WHERE p.order_id = orders.id AND p.delivered_at IS NOT NULL) THEN 1 ELSE 0 END), 0) AS delivered_order_count
            FROM orders
            WHERE store_id = ?
            GROUP BY COALESCE(substr(source_created_at, 1, 10), 'tanpa-tanggal')
            ORDER BY date DESC
        `).all(id);
        const promotionSummary = database.prepare(`
            SELECT COALESCE(SUM(i.seller_discount), 0) AS seller_product_discount,
                COALESCE(SUM(i.platform_discount), 0) AS platform_product_discount
            FROM order_items i JOIN orders o ON o.id = i.order_id
            WHERE o.store_id = ?
        `).get(id);
        const detectedDiscountSummary = orderDiscountColumns.has('amount')
            ? database.prepare(`
                SELECT COUNT(*) AS detected_discount_count,
                    COUNT(DISTINCT order_id) AS detected_discount_order_count,
                    COALESCE(SUM(amount), 0) AS detected_discount_total
                FROM order_discounts
                WHERE store_id = ?
            `).get(id)
            : { detected_discount_count: 0, detected_discount_order_count: 0, detected_discount_total: 0 };
        const detectedDiscounts = orderDiscountColumns.has('amount')
            ? database.prepare(`
                SELECT discount_type,
                    funded_by,
                    source,
                    COUNT(*) AS line_count,
                    COUNT(DISTINCT order_id) AS order_count,
                    COALESCE(SUM(amount), 0) AS amount
                FROM order_discounts
                WHERE store_id = ?
                GROUP BY discount_type, funded_by, source
                ORDER BY amount DESC, discount_type ASC
            `).all(id)
            : [];
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
                COALESCE(SUM(${transactionField('total_revenue')}), 0) AS total_revenue,
                COALESCE(SUM(${transactionField('total_fees')}), 0) AS total_fees,
                COALESCE(SUM(${transactionField('refund_after_discount')}), 0) AS total_refunds,
                COALESCE(SUM(CASE WHEN settlement_amount > 0 THEN settlement_amount ELSE 0 END), 0) AS positive_settlement,
                COALESCE(SUM(CASE WHEN settlement_amount < 0 THEN settlement_amount ELSE 0 END), 0) AS negative_settlement,
                COALESCE(SUM(CASE WHEN transaction_type = 'Pesanan' THEN settlement_amount ELSE 0 END), 0) AS order_settlement,
                COALESCE(SUM(CASE WHEN transaction_type = 'Pesanan' AND order_id IS NULL THEN 1 ELSE 0 END), 0) AS unmatched_orders,
                COALESCE(SUM(CASE WHEN transaction_type != 'Pesanan' THEN settlement_amount ELSE 0 END), 0) AS other_settlement
            FROM financial_transactions WHERE store_id = ?
        `).get(id);
        const transferSummary = database.prepare(`
            SELECT COUNT(*) AS transfer_count,
                COALESCE(SUM(CASE WHEN transfer_type = 'Withdrawal' THEN amount ELSE 0 END), 0) AS withdrawal_amount,
                COALESCE(SUM(amount), 0) AS transfer_net_amount
            FROM financial_transfers WHERE store_id = ?
        `).get(id);
        const orders = database.prepare(`
            SELECT o.id, o.external_order_id AS orderId, o.source_order_status AS status,
                o.financial_status AS financialStatus, o.order_amount AS amount,
                o.payment_platform_discount AS paymentPlatformDiscount,
                o.source_created_at AS createdAt,
                p.tracking_id AS tracking, p.shipping_provider_name AS courier,
                p.shipped_at AS shippedAt, p.delivered_at AS deliveredAt,
                i.product_name AS product, i.variation AS variant,
                i.seller_sku AS sellerSku, i.sku_id AS skuId, i.quantity,
                ${itemAliasField('subtotal_before_discount', 'subtotalBeforeDiscount')},
                ${itemAliasField('subtotal_after_discount', 'subtotalAfterDiscount')},
                ${itemAliasField('seller_discount', 'sellerDiscount')},
                ${itemAliasField('platform_discount', 'platformDiscount')}
            FROM orders o
            LEFT JOIN order_items i ON i.order_id = o.id
            LEFT JOIN order_packages p ON p.id = i.order_package_id
            WHERE o.store_id = ?
            ORDER BY o.source_created_at DESC, o.id DESC, i.id ASC
            LIMIT 100
        `).all(id).map(({ id: _id, ...order }) => order);
        const transactions = database.prepare(`
            SELECT t.id,
                ${transactionAliasField('external_reference_id', 'externalReferenceId')},
                ${transactionAliasField('transaction_type', 'transactionType', "''")},
                ${transactionAliasField('ordered_on', 'orderedOn')},
                ${transactionAliasField('credited_on', 'creditedOn')},
                ${transactionAliasField('currency', 'currency', "'IDR'")},
                ${transactionAliasField('settlement_amount', 'settlementAmount')},
                ${transactionAliasField('total_revenue', 'totalRevenue')},
                ${transactionAliasField('total_fees', 'totalFees')},
                ${transactionAliasField('refund_after_discount', 'refundAfterDiscount')},
                ${transactionAliasField('platform_commission', 'platformCommission')},
                ${transactionAliasField('logistics_service_fee', 'logisticsServiceFee')},
                ${transactionAliasField('shipping_fee', 'shippingFee')},
                ${transactionAliasField('seller_discount', 'sellerDiscount')},
                ${transactionAliasField('breakdown', 'breakdown')},
                GROUP_CONCAT(DISTINCT p.tracking_id) AS tracking,
                GROUP_CONCAT(DISTINCT p.shipping_provider_name) AS courier,
                MIN(p.shipped_at) AS shippedAt, MIN(p.delivered_at) AS deliveredAt,
                CASE
                    WHEN COUNT(p.id) = 0 THEN 'not_found'
                    WHEN SUM(CASE WHEN p.delivered_at IS NOT NULL THEN 1 ELSE 0 END) = COUNT(p.id) THEN 'delivered'
                    WHEN SUM(CASE WHEN p.shipped_at IS NOT NULL THEN 1 ELSE 0 END) > 0 THEN 'in_transit'
                    ELSE 'awaiting_shipment'
                END AS shippingStatus,
                o.external_order_id AS orderId, o.financial_status AS financialStatus
            FROM financial_transactions t
            LEFT JOIN orders o ON o.id = t.order_id
            LEFT JOIN order_packages p ON p.order_id = t.order_id
            WHERE t.store_id = ?
            GROUP BY t.id
            ORDER BY COALESCE(${transactionColumns.has('credited_on') ? 't.credited_on' : 'NULL'}, ${transactionColumns.has('ordered_on') ? 't.ordered_on' : 'NULL'}) DESC, t.id DESC
            LIMIT 150
        `).all(id);
        const transfers = database.prepare(`
            SELECT f.id,
                ${transferColumns.has('external_reference_id') ? 'f.external_reference_id' : 'NULL'} AS externalReferenceId,
                ${transferColumns.has('transfer_type') ? 'f.transfer_type' : "''"} AS transferType,
                ${transferColumns.has('requested_on') ? 'f.requested_on' : 'NULL'} AS requestedOn,
                ${transferColumns.has('completed_on') ? 'f.completed_on' : 'NULL'} AS completedOn,
                ${transferColumns.has('amount') ? 'f.amount' : '0'} AS amount,
                ${transferColumns.has('status') ? 'f.status' : 'NULL'} AS status,
                ${transferColumns.has('bank_account') ? 'f.bank_account' : 'NULL'} AS bankAccount,
                ${transactionColumns.has('transaction_type') ? 't.transaction_type' : "''"} AS transactionType,
                t.order_id AS transactionOrderId
            FROM financial_transfers f
            LEFT JOIN financial_transactions t ON t.id = ${transferColumns.has('financial_transaction_id') ? 'f.financial_transaction_id' : 'NULL'}
            WHERE f.store_id = ?
            ORDER BY COALESCE(${transferColumns.has('completed_on') ? 'f.completed_on' : 'NULL'}, ${transferColumns.has('requested_on') ? 'f.requested_on' : 'NULL'}) DESC, f.id DESC
            LIMIT 80
        `).all(id);
        const transactionTypes = database.prepare(`
            SELECT transaction_type AS label, COUNT(*) AS count,
                COALESCE(SUM(settlement_amount), 0) AS amount
            FROM financial_transactions
            WHERE store_id = ?
            GROUP BY transaction_type
            ORDER BY ABS(SUM(settlement_amount)) DESC, transaction_type ASC
            LIMIT 8
        `).all(id);
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
                ...detectedDiscountSummary,
                shipped_packages: shippedPackages,
                delivered_packages: deliveredPackages,
                ...financeSummary,
                ...transferSummary,
                transaction_types: transactionTypes
            },
            orderDailySummary,
            orders,
            detectedDiscounts,
            transactions,
            transfers,
            imports
        };
    } finally {
        database.close();
    }
}

function tableColumns(database, tableName) {
    return new Set(database.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function emptySummary() {
    return {
        total_orders: 0, credited_orders: 0, pending_orders: 0,
        gross_order_amount: 0, payment_platform_discount: 0,
        seller_product_discount: 0, platform_product_discount: 0,
        detected_discount_count: 0, detected_discount_order_count: 0,
        detected_discount_total: 0,
        shipped_packages: 0, delivered_packages: 0,
        transaction_count: 0, order_settlement: 0, unmatched_orders: 0, linked_order_count: 0,
        other_settlement: 0, transfer_count: 0, withdrawal_amount: 0,
        transfer_net_amount: 0, total_revenue: 0, total_fees: 0,
        total_refunds: 0, positive_settlement: 0, negative_settlement: 0,
        transaction_types: []
    };
}
