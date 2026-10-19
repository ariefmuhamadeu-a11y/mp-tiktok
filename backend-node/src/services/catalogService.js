import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { catalogMappingStatuses, orderItemMappingStatuses } from '../database/catalogSchema.js';
import { commerceDatabasePath } from './workspaceService.js';

const text = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const nullableText = (value) => {
    const valueText = text(value);
    return valueText || null;
};

function fail(message, statusCode = 422) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function id(value, label) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) fail(`${label} tidak valid.`);
    return parsed;
}

function booleanValue(value, fallback = true) {
    if (value === undefined) return fallback ? 1 : 0;
    if (value === true || value === 1 || value === '1') return 1;
    if (value === false || value === 0 || value === '0') return 0;
    fail('Nilai status aktif tidak valid.');
}

function attributesJson(value) {
    if (value === undefined) return undefined;
    if (value === null || value === '') return '{}';
    const parsed = typeof value === 'string'
        ? (() => {
            try { return JSON.parse(value); } catch { fail('Atribut variant harus berupa JSON object yang valid.'); }
        })()
        : value;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
        fail('Atribut variant harus berupa object.');
    }
    return JSON.stringify(parsed);
}

function parseAttributes(value) {
    try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function parseJsonValue(value) {
    if (value === null || value === undefined) return null;
    try { return JSON.parse(value); } catch { return {}; }
}

function openDatabase(databasePath) {
    if (!existsSync(databasePath)) fail('Database katalog belum tersedia.', 503);
    const database = new DatabaseSync(databasePath);
    database.exec('PRAGMA foreign_keys = ON;');
    return database;
}

function ensureUser(database, userId) {
    const numericUserId = id(userId, 'User ID');
    const user = database.prepare('SELECT id FROM users WHERE id = ?').get(numericUserId);
    if (!user) fail('User tidak ditemukan.', 404);
    return numericUserId;
}

function ensureStore(database, storeId) {
    const numericStoreId = id(storeId, 'Toko ID');
    const store = database.prepare('SELECT id, user_id, name, platform FROM stores WHERE id = ?').get(numericStoreId);
    if (!store) fail('Toko tidak ditemukan.', 404);
    return store;
}

function productPayload(row) {
    return {
        id: row.id,
        userId: row.user_id,
        code: row.internal_code,
        name: row.name,
        brand: row.brand,
        category: row.category,
        isActive: Boolean(row.is_active),
        variantCount: Number(row.variant_count || 0),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function variantPayload(row) {
    return {
        id: row.id,
        productId: row.product_id,
        userId: row.user_id,
        sku: row.internal_sku,
        name: row.name,
        barcode: row.barcode,
        attributes: parseAttributes(row.attributes_json),
        isActive: Boolean(row.is_active),
        product: row.product_name ? { id: row.product_id, code: row.product_code, name: row.product_name } : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mappingPayload(row) {
    return {
        id: row.id,
        storeId: row.store_id,
        storeName: row.store_name,
        platform: row.platform,
        productId: row.product_id,
        productName: row.product_name,
        productVariantId: row.product_variant_id,
        variantSku: row.internal_sku,
        variantName: row.variant_name,
        marketplaceProductId: row.marketplace_product_id,
        marketplaceVariantId: row.marketplace_variant_id,
        sellerSku: row.seller_sku,
        skuId: row.sku_id,
        marketplaceProductName: row.marketplace_product_name,
        marketplaceVariantName: row.marketplace_variant_name,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function productById(database, productId, userId) {
    const row = database.prepare(`
        SELECT p.id, p.user_id, p.internal_code, p.name, p.brand, p.category,
            p.is_active, p.created_at, p.updated_at, COUNT(v.id) AS variant_count
        FROM products p
        LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE p.id = ? AND p.user_id = ?
        GROUP BY p.id
    `).get(productId, userId);
    if (!row) fail('Produk tidak ditemukan.', 404);
    return row;
}

function variantById(database, variantId, userId) {
    const row = database.prepare(`
        SELECT v.id, v.product_id, v.user_id, v.internal_sku, v.name, v.barcode,
            v.attributes_json, v.is_active, v.created_at, v.updated_at,
            p.internal_code AS product_code, p.name AS product_name
        FROM product_variants v
        JOIN products p ON p.id = v.product_id
        WHERE v.id = ? AND v.user_id = ?
    `).get(variantId, userId);
    if (!row) fail('Product variant tidak ditemukan.', 404);
    return row;
}

function ensureVariantBelongsToProduct(database, variantId, productId, userId) {
    const variant = variantById(database, variantId, userId);
    if (variant.product_id !== productId) fail('Variant tidak termasuk dalam produk yang dipilih.');
    return variant;
}

function ensureMappingTarget(database, store, productVariantId, productId) {
    const variant = variantById(database, id(productVariantId, 'Product variant ID'), store.user_id);
    if (productId !== undefined && productId !== null && id(productId, 'Produk ID') !== variant.product_id) {
        fail('Produk dan variant tidak memiliki relasi yang sama.');
    }
    return variant;
}

function ensureMappingKeys(skuId, sellerSku) {
    const cleanSkuId = nullableText(skuId);
    const cleanSellerSku = nullableText(sellerSku);
    if (!cleanSkuId && !cleanSellerSku) fail('Isi minimal skuId atau sellerSku.');
    return { skuId: cleanSkuId, sellerSku: cleanSellerSku };
}

function assertMappingConflict(database, { id: mappingId = null, storeId, platform, skuId, sellerSku }) {
    const clauses = [];
    const values = [storeId, platform];
    if (skuId) { clauses.push('sku_id = ?'); values.push(skuId); }
    if (sellerSku) { clauses.push('seller_sku = ?'); values.push(sellerSku); }
    const row = database.prepare(`
        SELECT id FROM marketplace_product_mappings
        WHERE store_id = ? AND platform = ? AND (${clauses.join(' OR ')})
            ${mappingId ? 'AND id != ?' : ''}
        LIMIT 1
    `).get(...values, ...(mappingId ? [mappingId] : []));
    if (row) fail('SKU marketplace tersebut sudah memiliki mapping di toko dan platform ini.', 409);
}

function writeAuditLog(database, { actorUserId = null, storeId = null, entityType, entityId = null, action, reason = null, before = null, after = null }) {
    const actor = actorUserId === null || actorUserId === undefined || actorUserId === ''
        ? null
        : ensureUser(database, actorUserId);
    database.prepare(`
        INSERT INTO catalog_audit_logs (
            actor_user_id, store_id, entity_type, entity_id, action, reason, before_json, after_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        actor,
        storeId === null || storeId === undefined ? null : id(storeId, 'Toko ID'),
        text(entityType),
        entityId === null || entityId === undefined ? null : id(entityId, 'Entity ID'),
        text(action),
        nullableText(reason),
        before === null || before === undefined ? null : JSON.stringify(before),
        after === null || after === undefined ? null : JSON.stringify(after)
    );
}

function resolvePlatform(platform, store) {
    return text(platform || store.platform || 'tiktok').toLowerCase();
}

function classifyOrderItems(database, store, platform) {
    const rows = database.prepare(`
        SELECT i.id AS item_id, o.id AS order_id, o.external_order_id,
            o.source_created_at, i.product_name, i.variation, i.sku_id,
            i.seller_sku, i.quantity
        FROM order_items i
        JOIN orders o ON o.id = i.order_id
        WHERE o.store_id = ?
        ORDER BY o.source_created_at DESC, o.id DESC, i.id ASC
    `).all(store.id);
    const mappings = mappingRows(database, 'WHERE m.store_id = ? AND m.platform = ?', [store.id, platform]);
    const skuIdMap = new Map();
    const sellerSkuMap = new Map();
    mappings.forEach((mapping) => {
        if (mapping.skuId) skuIdMap.set(mapping.skuId, mapping);
        if (mapping.sellerSku) sellerSkuMap.set(mapping.sellerSku, mapping);
    });
    const materialized = new Map(database.prepare(`
        SELECT order_item_id, status, product_id, product_variant_id, marketplace_mapping_id
        FROM order_item_mappings WHERE store_id = ?
    `).all(store.id).map((row) => [row.order_item_id, row]));

    return rows.map((row) => {
        const bySkuId = row.sku_id ? skuIdMap.get(row.sku_id) : null;
        const bySellerSku = row.seller_sku ? sellerSkuMap.get(row.seller_sku) : null;
        const mapping = bySkuId || bySellerSku || null;
        const conflict = bySkuId && bySellerSku && bySkuId.id !== bySellerSku.id;
        const materializedRow = materialized.get(row.item_id) || null;
        const status = conflict ? 'conflict' : mapping ? mapping.status : 'unmatched';
        return {
            itemId: row.item_id,
            orderId: row.order_id,
            externalOrderId: row.external_order_id,
            orderedAt: row.source_created_at,
            productName: row.product_name,
            variation: row.variation,
            skuId: row.sku_id,
            sellerSku: row.seller_sku,
            quantity: row.quantity,
            status,
            mapping: conflict ? { skuId: bySkuId, sellerSku: bySellerSku } : mapping,
            alreadyBackfilled: Boolean(materializedRow),
            materialized: materializedRow ? {
                status: materializedRow.status,
                productId: materializedRow.product_id,
                productVariantId: materializedRow.product_variant_id,
                marketplaceMappingId: materializedRow.marketplace_mapping_id
            } : null
        };
    });
}

export function listProducts({ userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        return database.prepare(`
            SELECT p.id, p.user_id, p.internal_code, p.name, p.brand, p.category,
                p.is_active, p.created_at, p.updated_at, COUNT(v.id) AS variant_count
            FROM products p
            LEFT JOIN product_variants v ON v.product_id = p.id
            WHERE p.user_id = ?
            GROUP BY p.id
            ORDER BY p.is_active DESC, p.name ASC, p.id ASC
        `).all(numericUserId).map(productPayload);
    } finally { database.close(); }
}

export function getProduct({ productId, userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try { return productPayload(productById(database, id(productId, 'Produk ID'), ensureUser(database, userId))); }
    finally { database.close(); }
}

export function createProduct({ userId, code, name, brand, category, isActive = true, actorUserId = userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        const cleanCode = text(code);
        const cleanName = text(name);
        if (!cleanCode || !cleanName) fail('Kode internal dan nama produk wajib diisi.');
        try {
            const row = database.prepare(`
                INSERT INTO products (user_id, internal_code, name, brand, category, is_active)
                VALUES (?, ?, ?, ?, ?, ?)
                RETURNING id
            `).get(numericUserId, cleanCode, cleanName, nullableText(brand), nullableText(category), booleanValue(isActive));
            const created = productById(database, row.id, numericUserId);
            writeAuditLog(database, {
                actorUserId,
                entityType: 'product',
                entityId: created.id,
                action: 'created',
                after: productPayload(created)
            });
            return productPayload(created);
        } catch (error) {
            if (/UNIQUE constraint/i.test(error.message || '')) fail('Kode internal produk sudah digunakan.', 409);
            throw error;
        }
    } finally { database.close(); }
}

export function updateProduct({ productId, userId, code, name, brand, category, isActive, actorUserId = userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        const current = productById(database, id(productId, 'Produk ID'), numericUserId);
        const cleanCode = code === undefined ? current.internal_code : text(code);
        const cleanName = name === undefined ? current.name : text(name);
        if (!cleanCode || !cleanName) fail('Kode internal dan nama produk wajib diisi.');
        try {
            database.prepare(`
                UPDATE products SET internal_code = ?, name = ?, brand = ?, category = ?,
                    is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?
            `).run(cleanCode, name === undefined ? current.name : nullableText(name), brand === undefined ? current.brand : nullableText(brand), category === undefined ? current.category : nullableText(category), isActive === undefined ? current.is_active : booleanValue(isActive), current.id, numericUserId);
            const updated = productById(database, current.id, numericUserId);
            writeAuditLog(database, {
                actorUserId,
                entityType: 'product',
                entityId: updated.id,
                action: 'updated',
                before: productPayload(current),
                after: productPayload(updated)
            });
            return productPayload(updated);
        } catch (error) {
            if (/UNIQUE constraint/i.test(error.message || '')) fail('Kode internal produk sudah digunakan.', 409);
            throw error;
        }
    } finally { database.close(); }
}

export function listVariants({ userId, productId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        const values = [numericUserId];
        const filter = productId === undefined ? '' : ' AND v.product_id = ?';
        if (productId !== undefined) values.push(id(productId, 'Produk ID'));
        return database.prepare(`
            SELECT v.id, v.product_id, v.user_id, v.internal_sku, v.name, v.barcode,
                v.attributes_json, v.is_active, v.created_at, v.updated_at,
                p.internal_code AS product_code, p.name AS product_name
            FROM product_variants v
            JOIN products p ON p.id = v.product_id
            WHERE v.user_id = ?${filter}
            ORDER BY v.is_active DESC, p.name ASC, v.name ASC, v.id ASC
        `).all(...values).map(variantPayload);
    } finally { database.close(); }
}

export function getVariant({ variantId, userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try { return variantPayload(variantById(database, id(variantId, 'Product variant ID'), ensureUser(database, userId))); }
    finally { database.close(); }
}

export function createVariant({ productId, userId, sku, name, barcode, attributes, isActive = true, actorUserId = userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        const numericProductId = id(productId, 'Produk ID');
        productById(database, numericProductId, numericUserId);
        const cleanSku = text(sku);
        const cleanName = text(name);
        if (!cleanSku || !cleanName) fail('SKU internal dan nama variant wajib diisi.');
        const json = attributesJson(attributes) ?? '{}';
        try {
            const row = database.prepare(`
                INSERT INTO product_variants (product_id, user_id, internal_sku, name, barcode, attributes_json, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            `).get(numericProductId, numericUserId, cleanSku, cleanName, nullableText(barcode), json, booleanValue(isActive));
            const created = variantById(database, row.id, numericUserId);
            writeAuditLog(database, {
                actorUserId,
                entityType: 'product_variant',
                entityId: created.id,
                action: 'created',
                after: variantPayload(created)
            });
            return variantPayload(created);
        } catch (error) {
            if (/UNIQUE constraint/i.test(error.message || '')) fail('SKU internal sudah digunakan oleh user ini.', 409);
            throw error;
        }
    } finally { database.close(); }
}

export function updateVariant({ variantId, userId, sku, name, barcode, attributes, isActive, actorUserId = userId, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericUserId = ensureUser(database, userId);
        const current = variantById(database, id(variantId, 'Product variant ID'), numericUserId);
        const cleanSku = sku === undefined ? current.internal_sku : text(sku);
        const cleanName = name === undefined ? current.name : text(name);
        if (!cleanSku || !cleanName) fail('SKU internal dan nama variant wajib diisi.');
        try {
            database.prepare(`
                UPDATE product_variants SET internal_sku = ?, name = ?, barcode = ?,
                    attributes_json = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(cleanSku, cleanName, barcode === undefined ? current.barcode : nullableText(barcode), attributesJson(attributes) ?? current.attributes_json, isActive === undefined ? current.is_active : booleanValue(isActive), current.id, numericUserId);
            const updated = variantById(database, current.id, numericUserId);
            writeAuditLog(database, {
                actorUserId,
                entityType: 'product_variant',
                entityId: updated.id,
                action: 'updated',
                before: variantPayload(current),
                after: variantPayload(updated)
            });
            return variantPayload(updated);
        } catch (error) {
            if (/UNIQUE constraint/i.test(error.message || '')) fail('SKU internal sudah digunakan oleh user ini.', 409);
            throw error;
        }
    } finally { database.close(); }
}

function mappingRows(database, filter = '', values = []) {
    return database.prepare(`
        SELECT m.id, m.store_id, s.name AS store_name, m.platform,
            m.product_id, p.name AS product_name, m.product_variant_id,
            v.internal_sku, v.name AS variant_name, m.marketplace_product_id,
            m.marketplace_variant_id, m.seller_sku, m.sku_id,
            m.marketplace_product_name, m.marketplace_variant_name,
            m.status, m.created_at, m.updated_at
        FROM marketplace_product_mappings m
        JOIN stores s ON s.id = m.store_id
        JOIN products p ON p.id = m.product_id
        JOIN product_variants v ON v.id = m.product_variant_id
        ${filter}
        ORDER BY m.updated_at DESC, m.id DESC
    `).all(...values).map(mappingPayload);
}

export function listMappings({ storeId, platform = '', status = '', databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const values = [];
        const clauses = [];
        if (storeId !== undefined) { clauses.push('m.store_id = ?'); values.push(id(storeId, 'Toko ID')); }
        if (platform) { clauses.push('m.platform = ?'); values.push(text(platform).toLowerCase()); }
        if (status) {
            const cleanStatus = text(status).toLowerCase();
            if (!catalogMappingStatuses.includes(cleanStatus)) fail('Status mapping tidak valid.');
            clauses.push('m.status = ?'); values.push(cleanStatus);
        }
        return mappingRows(database, clauses.length ? 'WHERE ' + clauses.join(' AND ') : '', values);
    } finally { database.close(); }
}

export function createMapping({ storeId, productId, productVariantId, platform, marketplaceProductId, marketplaceVariantId, sellerSku, skuId, marketplaceProductName, marketplaceVariantName, status = 'mapped', actorUserId = null, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const store = ensureStore(database, storeId);
        const variant = ensureMappingTarget(database, store, productVariantId, productId);
        const keys = ensureMappingKeys(skuId, sellerSku);
        const cleanPlatform = text(platform || store.platform || 'tiktok').toLowerCase();
        const cleanStatus = text(status).toLowerCase();
        if (!catalogMappingStatuses.includes(cleanStatus)) fail('Status mapping tidak valid.');
        assertMappingConflict(database, { storeId: store.id, platform: cleanPlatform, ...keys });
        const row = database.prepare(`
            INSERT INTO marketplace_product_mappings (
                store_id, product_id, product_variant_id, platform, marketplace_product_id,
                marketplace_variant_id, seller_sku, sku_id, marketplace_product_name,
                marketplace_variant_name, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
        `).get(store.id, variant.product_id, variant.id, cleanPlatform, nullableText(marketplaceProductId), nullableText(marketplaceVariantId), keys.sellerSku, keys.skuId, nullableText(marketplaceProductName), nullableText(marketplaceVariantName), cleanStatus);
        const created = mappingRows(database, 'WHERE m.id = ?', [row.id])[0];
        writeAuditLog(database, {
            actorUserId: actorUserId ?? store.user_id,
            storeId: store.id,
            entityType: 'marketplace_product_mapping',
            entityId: created.id,
            action: 'created',
            after: created
        });
        return created;
    } catch (error) {
        if (/UNIQUE constraint/i.test(error.message || '')) fail('SKU marketplace tersebut sudah memiliki mapping di toko dan platform ini.', 409);
        throw error;
    } finally { database.close(); }
}

export function updateMapping({ mappingId, productId, productVariantId, platform, marketplaceProductId, marketplaceVariantId, sellerSku, skuId, marketplaceProductName, marketplaceVariantName, status, actorUserId = null, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const numericMappingId = id(mappingId, 'Mapping ID');
        const current = database.prepare('SELECT * FROM marketplace_product_mappings WHERE id = ?').get(numericMappingId);
        if (!current) fail('Mapping tidak ditemukan.', 404);
        const store = ensureStore(database, current.store_id);
        const variant = productVariantId === undefined
            ? ensureMappingTarget(database, store, current.product_variant_id, productId === undefined ? current.product_id : productId)
            : ensureMappingTarget(database, store, productVariantId, productId === undefined ? current.product_id : productId);
        const keys = ensureMappingKeys(skuId === undefined ? current.sku_id : skuId, sellerSku === undefined ? current.seller_sku : sellerSku);
        const cleanPlatform = text(platform === undefined ? current.platform : platform).toLowerCase();
        const cleanStatus = text(status === undefined ? current.status : status).toLowerCase();
        if (!catalogMappingStatuses.includes(cleanStatus)) fail('Status mapping tidak valid.');
        assertMappingConflict(database, { id: current.id, storeId: store.id, platform: cleanPlatform, ...keys });
        const before = mappingRows(database, 'WHERE m.id = ?', [current.id])[0];
        database.prepare(`
            UPDATE marketplace_product_mappings SET product_id = ?, product_variant_id = ?, platform = ?,
                marketplace_product_id = ?, marketplace_variant_id = ?, seller_sku = ?, sku_id = ?,
                marketplace_product_name = ?, marketplace_variant_name = ?, status = ?,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?
        `).run(variant.product_id, variant.id, cleanPlatform, marketplaceProductId === undefined ? current.marketplace_product_id : nullableText(marketplaceProductId), marketplaceVariantId === undefined ? current.marketplace_variant_id : nullableText(marketplaceVariantId), keys.sellerSku, keys.skuId, marketplaceProductName === undefined ? current.marketplace_product_name : nullableText(marketplaceProductName), marketplaceVariantName === undefined ? current.marketplace_variant_name : nullableText(marketplaceVariantName), cleanStatus, current.id);
        const updated = mappingRows(database, 'WHERE m.id = ?', [current.id])[0];
        writeAuditLog(database, {
            actorUserId: actorUserId ?? store.user_id,
            storeId: store.id,
            entityType: 'marketplace_product_mapping',
            entityId: updated.id,
            action: 'updated',
            before,
            after: updated
        });
        return updated;
    } catch (error) {
        if (/UNIQUE constraint/i.test(error.message || '')) fail('SKU marketplace tersebut sudah memiliki mapping di toko dan platform ini.', 409);
        throw error;
    } finally { database.close(); }
}

export function listUnmatchedOrderItems({ storeId, platform = '', status = '', limit = 100, offset = 0, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const store = ensureStore(database, storeId);
        const cleanPlatform = text(platform || store.platform || 'tiktok').toLowerCase();
        const cleanStatus = status ? text(status).toLowerCase() : 'unmatched';
        const allowedStatuses = ['unmatched', 'conflict', 'ignored', 'mapped'];
        if (!allowedStatuses.includes(cleanStatus)) fail('Status item mapping tidak valid.');
        const rows = database.prepare(`
            SELECT i.id AS item_id, o.id AS order_id, o.external_order_id,
                o.source_created_at, i.product_name, i.variation, i.sku_id,
                i.seller_sku, i.quantity
            FROM order_items i
            JOIN orders o ON o.id = i.order_id
            WHERE o.store_id = ?
            ORDER BY o.source_created_at DESC, o.id DESC, i.id ASC
        `).all(store.id);
        const mappings = mappingRows(database, 'WHERE m.store_id = ? AND m.platform = ?', [store.id, cleanPlatform]);
        const skuIdMap = new Map();
        const sellerSkuMap = new Map();
        mappings.forEach((mapping) => {
            if (mapping.skuId) skuIdMap.set(mapping.skuId, mapping);
            if (mapping.sellerSku) sellerSkuMap.set(mapping.sellerSku, mapping);
        });
        const classified = rows.map((row) => {
            const bySkuId = row.sku_id ? skuIdMap.get(row.sku_id) : null;
            const bySellerSku = row.seller_sku ? sellerSkuMap.get(row.seller_sku) : null;
            const mapping = bySkuId || bySellerSku || null;
            const conflict = bySkuId && bySellerSku && bySkuId.id !== bySellerSku.id;
            return {
                itemId: row.item_id,
                orderId: row.order_id,
                externalOrderId: row.external_order_id,
                orderedAt: row.source_created_at,
                productName: row.product_name,
                variation: row.variation,
                skuId: row.sku_id,
                sellerSku: row.seller_sku,
                quantity: row.quantity,
                status: conflict ? 'conflict' : mapping ? mapping.status : 'unmatched',
                mapping: conflict ? { skuId: bySkuId, sellerSku: bySellerSku } : mapping
            };
        });
        const filtered = classified.filter((row) => row.status === cleanStatus);
        const numericLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
        const numericOffset = Math.max(Number(offset) || 0, 0);
        return {
            store: { id: store.id, name: store.name, platform: store.platform },
            platform: cleanPlatform,
            status: cleanStatus,
            total: filtered.length,
            items: filtered.slice(numericOffset, numericOffset + numericLimit)
        };
    } finally { database.close(); }
}

export function previewBackfill({ storeId, platform = '', actorUserId = null, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const store = ensureStore(database, storeId);
        const cleanPlatform = resolvePlatform(platform, store);
        if (actorUserId !== null && actorUserId !== undefined && actorUserId !== '') ensureUser(database, actorUserId);
        const items = classifyOrderItems(database, store, cleanPlatform);
        const counts = {
            unmatched: items.filter((item) => item.status === 'unmatched').length,
            mapped: items.filter((item) => item.status === 'mapped').length,
            ignored: items.filter((item) => item.status === 'ignored').length,
            conflict: items.filter((item) => item.status === 'conflict').length,
            alreadyBackfilled: items.filter((item) => item.alreadyBackfilled).length,
            eligible: items.filter((item) => item.status === 'mapped' && !item.alreadyBackfilled).length
        };
        return {
            store: { id: store.id, name: store.name, platform: store.platform },
            platform: cleanPlatform,
            generatedAt: new Date().toISOString(),
            totalItems: items.length,
            counts,
            items: items.slice(0, 500)
        };
    } finally { database.close(); }
}

export function applyBackfill({ storeId, platform = '', actorUserId = null, reason = 'Backfill mapping dari SKU marketplace', databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const store = ensureStore(database, storeId);
        const cleanPlatform = resolvePlatform(platform, store);
        const actor = actorUserId === null || actorUserId === undefined || actorUserId === '' ? store.user_id : ensureUser(database, actorUserId);
        database.exec('BEGIN IMMEDIATE');
        try {
            const items = classifyOrderItems(database, store, cleanPlatform);
            const eligible = items.filter((item) => item.status === 'mapped' && !item.alreadyBackfilled && item.mapping && orderItemMappingStatuses.includes('mapped'));
            let mappedCount = 0;
            let skippedCount = 0;
            for (const item of eligible) {
                try {
                    const result = database.prepare(`
                        INSERT INTO order_item_mappings (
                            order_item_id, order_id, store_id, product_id, product_variant_id,
                            marketplace_mapping_id, status, source, mapped_by
                        ) VALUES (?, ?, ?, ?, ?, ?, 'mapped', 'backfill', ?)
                        RETURNING id
                    `).get(item.itemId, item.orderId, store.id, item.mapping.productId, item.mapping.productVariantId, item.mapping.id, actor);
                    writeAuditLog(database, {
                        actorUserId: actor,
                        storeId: store.id,
                        entityType: 'order_item_mapping',
                        entityId: result.id,
                        action: 'backfilled',
                        reason,
                        before: null,
                        after: {
                            orderItemId: item.itemId,
                            orderId: item.orderId,
                            productId: item.mapping.productId,
                            productVariantId: item.mapping.productVariantId,
                            marketplaceMappingId: item.mapping.id,
                            status: 'mapped',
                            source: 'backfill'
                        }
                    });
                    mappedCount += 1;
                } catch (error) {
                    if (/UNIQUE constraint/i.test(error.message || '')) skippedCount += 1;
                    else throw error;
                }
            }
            const summary = {
                eligibleCount: eligible.length,
                mappedCount,
                skippedCount,
                conflictCount: items.filter((item) => item.status === 'conflict').length,
                unmatchedCount: items.filter((item) => item.status === 'unmatched').length,
                ignoredCount: items.filter((item) => item.status === 'ignored').length
            };
            writeAuditLog(database, {
                actorUserId: actor,
                storeId: store.id,
                entityType: 'order_item_mapping',
                action: 'backfill_applied',
                reason,
                before: { eligibleCount: eligible.length },
                after: summary
            });
            database.exec('COMMIT');
            return {
                status: 'applied',
                store: { id: store.id, name: store.name, platform: store.platform },
                platform: cleanPlatform,
                ...summary
            };
        } catch (error) {
            database.exec('ROLLBACK');
            throw error;
        }
    } finally { database.close(); }
}

export function listAuditLogs({ storeId, entityType = '', limit = 100, offset = 0, databasePath = commerceDatabasePath }) {
    const database = openDatabase(databasePath);
    try {
        const values = [];
        const clauses = [];
        if (storeId !== undefined && storeId !== null && storeId !== '') {
            clauses.push('l.store_id = ?');
            values.push(id(storeId, 'Toko ID'));
        }
        if (entityType) {
            clauses.push('l.entity_type = ?');
            values.push(text(entityType));
        }
        const numericLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
        const numericOffset = Math.max(Number(offset) || 0, 0);
        const rows = database.prepare(`
            SELECT l.id, l.actor_user_id, u.name AS actor_name, l.store_id,
                s.name AS store_name, l.entity_type, l.entity_id, l.action,
                l.reason, l.before_json, l.after_json, l.created_at
            FROM catalog_audit_logs l
            LEFT JOIN users u ON u.id = l.actor_user_id
            LEFT JOIN stores s ON s.id = l.store_id
            ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''}
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT ? OFFSET ?
        `).all(...values, numericLimit, numericOffset);
        return rows.map((row) => ({
            id: row.id,
            actorUserId: row.actor_user_id,
            actorName: row.actor_name,
            storeId: row.store_id,
            storeName: row.store_name,
            entityType: row.entity_type,
            entityId: row.entity_id,
            action: row.action,
            reason: row.reason,
            before: parseJsonValue(row.before_json),
            after: parseJsonValue(row.after_json),
            createdAt: row.created_at
        }));
    } finally { database.close(); }
}
