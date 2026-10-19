export const catalogMappingStatuses = Object.freeze(['mapped', 'ignored', 'conflict']);
export const orderItemMappingStatuses = Object.freeze(['mapped', 'ignored', 'conflict']);

export function ensureCatalogSchema(database) {
    database.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            internal_code TEXT NOT NULL,
            name TEXT NOT NULL,
            brand TEXT,
            category TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, internal_code)
        );

        CREATE INDEX IF NOT EXISTS products_user_active_index
            ON products (user_id, is_active, name);

        CREATE TABLE IF NOT EXISTS product_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            internal_sku TEXT NOT NULL,
            name TEXT NOT NULL,
            barcode TEXT,
            attributes_json TEXT NOT NULL DEFAULT '{}',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE (user_id, internal_sku)
        );

        CREATE INDEX IF NOT EXISTS product_variants_product_index
            ON product_variants (product_id, is_active, name);

        CREATE TABLE IF NOT EXISTS marketplace_product_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            store_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_variant_id INTEGER NOT NULL,
            platform TEXT NOT NULL DEFAULT 'tiktok',
            marketplace_product_id TEXT,
            marketplace_variant_id TEXT,
            seller_sku TEXT,
            sku_id TEXT,
            marketplace_product_name TEXT,
            marketplace_variant_name TEXT,
            status TEXT NOT NULL DEFAULT 'mapped',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
            FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
            CHECK (sku_id IS NOT NULL OR seller_sku IS NOT NULL),
            CHECK (status IN ('mapped', 'ignored', 'conflict'))
        );

        CREATE INDEX IF NOT EXISTS marketplace_mappings_store_status_index
            ON marketplace_product_mappings (store_id, platform, status);
        CREATE INDEX IF NOT EXISTS marketplace_mappings_variant_index
            ON marketplace_product_mappings (product_variant_id);
        CREATE UNIQUE INDEX IF NOT EXISTS marketplace_mappings_store_sku_id_unique
            ON marketplace_product_mappings (store_id, platform, sku_id)
            WHERE sku_id IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS marketplace_mappings_store_seller_sku_unique
            ON marketplace_product_mappings (store_id, platform, seller_sku)
            WHERE seller_sku IS NOT NULL;

        CREATE TABLE IF NOT EXISTS order_item_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_item_id INTEGER NOT NULL UNIQUE,
            order_id INTEGER NOT NULL,
            store_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            product_variant_id INTEGER NOT NULL,
            marketplace_mapping_id INTEGER,
            status TEXT NOT NULL DEFAULT 'mapped',
            source TEXT NOT NULL DEFAULT 'manual',
            mapped_by INTEGER,
            mapped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
            FOREIGN KEY (product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
            FOREIGN KEY (marketplace_mapping_id) REFERENCES marketplace_product_mappings(id) ON DELETE SET NULL,
            FOREIGN KEY (mapped_by) REFERENCES users(id) ON DELETE SET NULL,
            CHECK (status IN ('mapped', 'ignored', 'conflict')),
            CHECK (source IN ('manual', 'backfill'))
        );

        CREATE INDEX IF NOT EXISTS order_item_mappings_store_status_index
            ON order_item_mappings (store_id, status, mapped_at);

        CREATE TABLE IF NOT EXISTS catalog_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            actor_user_id INTEGER,
            store_id INTEGER,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            action TEXT NOT NULL,
            reason TEXT,
            before_json TEXT,
            after_json TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS catalog_audit_logs_store_created_index
            ON catalog_audit_logs (store_id, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS catalog_audit_logs_entity_index
            ON catalog_audit_logs (entity_type, entity_id, created_at DESC);
    `);
}
